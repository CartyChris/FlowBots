import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createThreadEvents } from "@rakazo/db";
import { expect, it } from "vitest";
import type { AgentRuntime, AgentRuntimeEvent } from "../../../packages/adapter-kit/src/index.js";
import {
  resolveActionApproval,
  saveActionPolicy,
} from "../../../packages/adapters/src/action-approvals.js";
import { createRunExecutor } from "../../../packages/adapters/src/executor.js";
import { FakeSandboxProvider } from "../../../packages/adapters/src/fake-sandbox.js";
import { LocalAgentHomeStore } from "../../../packages/adapters/src/home.js";
import { InMemoryJobQueue } from "../../../packages/adapters/src/wakeup.js";
import { MarkdownMemoryStore } from "../../../packages/memory/src/index.js";
import { createTestDatabase } from "./test-db.js";

it.each([
  "allow-once",
  "deny",
  "unsupported-runtime",
  "legacy-large-action",
  "expired-during-setup",
  "runtime-control-policy-change",
] as const)("handles %s without replaying an unapproved action", async (decision) => {
  const database = await createTestDatabase();
  const { prisma } = database;
  const dataDir = await mkdtemp(path.join(tmpdir(), "flowbots-approval-executor-"));
  const scope = { workspaceId: "approval-executor-ws", userId: "approval-executor-user" };
  const botId = "approval-executor-bot";
  const threadId = "approval-executor-thread";
  const jobs = new InMemoryJobQueue();
  const sandbox = new FakeSandboxProvider();
  let calls = 0;
  const runtime: AgentRuntime = {
    describe: () => ({
      id: "approval-test",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: {
        streaming: true,
        compaction: false,
        tools: true,
        scripted: false,
        executorTools: decision !== "unsupported-runtime",
      },
    }),
    abort: async () => {},
    async *run(request): AsyncIterable<AgentRuntimeEvent> {
      calls += 1;
      if (decision === "runtime-control-policy-change") {
        expect(await request.allowRuntimeTool!("request_takeover")).toBe(true);
        await saveActionPolicy(prisma, scope, botId, { mode: "read-only", rules: [] });
        expect(await request.allowRuntimeTool!("request_takeover")).toBe(false);
        expect(await request.allowRuntimeTool!("run_subagent")).toBe(false);
        yield { type: "text", text: "Policy change respected." };
        yield { type: "done", finishReason: "stop" };
        return;
      }
      if (decision === "legacy-large-action") {
        await request.executeTool!(
          "write_file",
          { path: "large.txt", content: "a".repeat(40_000) },
          "large-action",
        );
        yield { type: "text", text: "Large file written." };
        yield { type: "done", finishReason: "stop" };
        return;
      }
      if (calls === 1) {
        await request.executeTool!(
          "write_file",
          { path: "approved.txt", content: "Only this original content" },
          "original-tool-identity",
        );
        throw new Error("The model should have stopped at approval");
      }
      expect(request.instructions).toContain("Do not repeat the reviewed action");
      yield {
        type: "text",
        text: decision === "deny" ? "The action was denied." : "The approved file is ready.",
      };
      yield { type: "done", finishReason: "stop" };
    },
  };
  try {
    await prisma.organization.create({
      data: {
        id: scope.workspaceId,
        name: "Approval",
        slug: scope.workspaceId,
        createdAt: new Date(),
      },
    });
    await prisma.bot.create({
      data: {
        ...scope,
        id: botId,
        name: "Alex",
        color: "blue",
        notifyOnFinish: false,
        thread: { create: { ...scope, id: threadId } },
        computer: { create: { ...scope, kind: "fake" } },
      },
    });
    await prisma.task.create({
      data: {
        ...scope,
        id: "approval-executor-task",
        botId,
        threadId,
        prompt: "Write an approved file",
        status: "queued",
      },
    });
    await prisma.run.create({
      data: {
        ...scope,
        id: "approval-executor-run",
        botId,
        threadId,
        taskId: "approval-executor-task",
        status: "queued",
        trigger: "user",
      },
    });
    await saveActionPolicy(prisma, scope, botId, {
      mode:
        decision === "legacy-large-action" || decision === "runtime-control-policy-change"
          ? "legacy"
          : "review-risky",
      rules: [],
    });
    const deps = {
      prisma,
      sandbox,
      runtime,
      jobs,
      events: createThreadEvents(prisma),
      home: new LocalAgentHomeStore(dataDir),
      memory: new MarkdownMemoryStore(prisma),
      secrets: [],
      dataDir,
    };
    await createRunExecutor(deps).continueRun("approval-executor-run", "worker-before-restart");
    if (decision === "runtime-control-policy-change") {
      expect(await prisma.run.findUnique({ where: { id: "approval-executor-run" } })).toMatchObject(
        { status: "completed" },
      );
      expect(await prisma.externalEffect.count()).toBe(0);
      return;
    }
    if (decision === "unsupported-runtime") {
      expect(await prisma.run.findUnique({ where: { id: "approval-executor-run" } })).toMatchObject(
        { status: "failed" },
      );
      expect(calls).toBe(0);
      expect(await prisma.externalEffect.count()).toBe(0);
      await createRunExecutor(deps).continueRun("approval-executor-run", "retry-worker");
      expect(calls).toBe(0);
      return;
    }
    if (decision === "legacy-large-action") {
      expect(await prisma.run.findUnique({ where: { id: "approval-executor-run" } })).toMatchObject(
        { status: "completed" },
      );
      expect(
        await prisma.externalEffect.findUnique({ where: { idempotencyKey: "large-action" } }),
      ).toMatchObject({ status: "completed" });
      expect(await prisma.actionApproval.count()).toBe(0);
      return;
    }
    expect(await prisma.run.findUnique({ where: { id: "approval-executor-run" } })).toMatchObject({
      status: "waiting_input",
    });
    expect(await prisma.externalEffect.count()).toBe(0);
    const approval = await prisma.actionApproval.findFirstOrThrow();
    await resolveActionApproval(
      prisma,
      scope,
      approval.id,
      decision === "expired-during-setup" ? "allow-once" : decision,
    );
    if (decision === "expired-during-setup") {
      const provision = sandbox.provision.bind(sandbox);
      sandbox.provision = async (...args) => {
        // The remote computer may take long enough to boot that approval expires after claiming.
        await prisma.actionApproval.update({
          where: { id: approval.id },
          data: { expiresAt: new Date(0) },
        });
        return provision(...args);
      };
    }
    // A fresh executor instance consumes the durable request rather than replaying a model trace.
    await createRunExecutor(deps).continueRun("approval-executor-run", "worker-after-restart");
    if (decision === "expired-during-setup") {
      expect(await prisma.externalEffect.count()).toBe(0);
      expect(await prisma.run.findUnique({ where: { id: "approval-executor-run" } })).toMatchObject(
        { status: "failed" },
      );
      expect(calls).toBe(1);
      return;
    }
    expect(await prisma.run.findUnique({ where: { id: "approval-executor-run" } })).toMatchObject({
      status: "completed",
    });
    expect(calls).toBe(2);
    const effect = await prisma.externalEffect.findUnique({
      where: { idempotencyKey: "original-tool-identity" },
    });
    if (decision === "allow-once") {
      expect(effect).toMatchObject({
        kind: "write_file",
        status: "completed",
        request: { path: "approved.txt", content: "Only this original content" },
      });
      expect(await prisma.actionApproval.findUnique({ where: { id: approval.id } })).toMatchObject({
        status: "consumed",
      });
    } else expect(effect).toBeNull();
    await createRunExecutor(deps).continueRun("approval-executor-run", "duplicate-worker");
    expect(calls).toBe(2);
    expect(await prisma.externalEffect.count()).toBe(decision === "allow-once" ? 1 : 0);
  } finally {
    await jobs.close();
    await database.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
