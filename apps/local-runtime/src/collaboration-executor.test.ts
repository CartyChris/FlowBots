import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createThreadEvents, createThreadMessage } from "@rakazo/db";
import { expect, it, vi } from "vitest";
import type {
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
  ConnectorEvent,
} from "../../../packages/adapter-kit/src/index.js";
import { LocalArtifactStore } from "../../../packages/adapters/src/artifacts.js";
import { createCollaborativeTasks } from "../../../packages/adapters/src/collaboration.js";
import { completeFencedEffect } from "../../../packages/adapters/src/effect-completion.js";
import { createRunExecutor } from "../../../packages/adapters/src/executor.js";
import { FakeSandboxProvider } from "../../../packages/adapters/src/fake-sandbox.js";
import { LocalAgentHomeStore } from "../../../packages/adapters/src/home.js";
import { PeerConnector } from "../../../packages/adapters/src/peer-connector.js";
import { InMemoryJobQueue } from "../../../packages/adapters/src/wakeup.js";
import { createContextPacket } from "../../../packages/core/src/collaboration.js";
import { MarkdownMemoryStore } from "../../../packages/memory/src/index.js";
import { createTestDatabase } from "./test-db.js";

it.each([
  { handoffTool: "delegate_to_bot", recovery: false },
  { handoffTool: "message_bot", recovery: false },
  { handoffTool: "message_bot", recovery: true },
  { handoffTool: "message_bot", recovery: false, stale: "intended" },
  { handoffTool: "message_bot", recovery: false, stale: "completed" },
])(
  "executes $handoffTool (recovery=$recovery, stale=$stale) through durable worker callbacks",
  async ({ handoffTool, recovery, stale }) => {
    const database = await createTestDatabase();
    const { prisma } = database;
    const dataDir = await mkdtemp(path.join(tmpdir(), "flowbots-collaboration-executor-"));
    const jobs = new InMemoryJobQueue();
    const enqueue = vi.spyOn(jobs, "enqueue");
    const scope = { workspaceId: "workspace-executor", userId: "user-executor" };
    const handoffArgs = {
      bot_id: "nova-executor",
      [handoffTool === "message_bot" ? "message" : "task"]: "Verify the form keyboard behavior",
      context_summary: "Use the acceptance criteria in the compact packet.",
      constraints: ["Keep the existing permissions"],
      requested_output: "A verification report",
    };
    const requests: AgentRunRequest[] = [];
    let delegated: { taskId: string; runId: string; botId: string } | undefined;
    let returned: unknown;
    let executor: ReturnType<typeof createRunExecutor>;
    const runtime: AgentRuntime = {
      describe: () => ({
        id: "deterministic-collaboration",
        contractVersion: "1",
        adapterVersion: "1",
        capabilities: { streaming: true, compaction: false, tools: true, scripted: false },
      }),
      abort: async () => {},
      async *run(request): AsyncIterable<AgentRuntimeEvent> {
        requests.push(request);
        expect(request.executeTool).toBeTypeOf("function");
        expect(request.tools.map((tool) => tool.name)).toContain("read_task_result");
        if (request.botId === "alex-executor") {
          const result = await request.executeTool!(
            handoffTool,
            handoffArgs,
            `${request.runId}:delegate`,
          );
          expect(result).toMatchObject({
            ok: true,
            botId: "nova-executor",
            reminder: expect.stringContaining("queued"),
          });
          delegated = result as typeof delegated;
          expect(await prisma.run.findUnique({ where: { id: delegated!.runId } })).toMatchObject({
            status: "queued",
          });
          expect(await prisma.message.count({ where: { threadId: "thread-nova-executor" } })).toBe(
            1,
          );
          // Explicitly drive the already queued worker job; no scheduler or model is fabricated.
          await executor.continueRun(delegated!.runId, "child-worker");
          expect(await prisma.run.findUnique({ where: { id: delegated!.runId } })).toMatchObject({
            status: "completed",
            error: null,
          });
          returned = await request.executeTool!(
            "read_task_result",
            { task_id: delegated!.taskId },
            `${request.runId}:read-result`,
          );
          expect(returned).toMatchObject({
            status: "completed",
            result: expect.stringContaining("Keyboard verification passed"),
            artifacts: [expect.objectContaining({ name: "verification.txt" })],
          });
          yield { type: "text", text: "Integrated Nova's verified report." };
        } else {
          expect(request.botId).toBe("nova-executor");
          expect(request.history).toHaveLength(1);
          expect(request.history[0]!.content).toContain("acceptance criteria");
          expect(request.history[0]!.content).toContain("Keep the existing permissions");
          expect(JSON.stringify(request)).not.toContain("PRIVATE_PARENT_HISTORY");
          expect(JSON.stringify(request)).not.toContain("PRIVATE_CHILD_HISTORY");
          await request.executeTool!(
            "write_file",
            { path: "verification.txt", content: "Keyboard verification passed" },
            `${request.runId}:write`,
          );
          await request.executeTool!(
            "share_file",
            { path: "verification.txt" },
            `${request.runId}:share`,
          );
          yield { type: "text", text: "Keyboard verification passed." };
        }
        yield { type: "done", finishReason: "stop" };
      },
    };
    try {
      await prisma.organization.create({
        data: {
          id: scope.workspaceId,
          name: "Executor workspace",
          slug: scope.workspaceId,
          createdAt: new Date(),
        },
      });
      for (const botId of ["alex-executor", "nova-executor"]) {
        await prisma.bot.create({
          data: {
            ...scope,
            id: botId,
            name: botId,
            color: "blue",
            notifyOnFinish: false,
            thread: { create: { ...scope, id: `thread-${botId}` } },
            computer: { create: { ...scope, kind: "fake" } },
          },
        });
        await createThreadMessage(prisma, {
          threadId: `thread-${botId}`,
          role: "user",
          blocks: [
            {
              kind: "text",
              text: botId === "alex-executor" ? "PRIVATE_PARENT_HISTORY" : "PRIVATE_CHILD_HISTORY",
            },
          ],
        });
      }
      await prisma.task.create({
        data: {
          ...scope,
          id: "executor-parent-task",
          botId: "alex-executor",
          threadId: "thread-alex-executor",
          prompt: "Delegate form verification to Nova",
          status: "queued",
        },
      });
      await prisma.run.create({
        data: {
          ...scope,
          id: "executor-parent-run",
          taskId: "executor-parent-task",
          botId: "alex-executor",
          threadId: "thread-alex-executor",
          status: "queued",
          trigger: "user",
        },
      });
      if (recovery) {
        await prisma.run.update({
          where: { id: "executor-parent-run" },
          data: { status: "running", leaseOwner: "old-worker", leaseFence: 1 },
        });
        await createCollaborativeTasks(prisma, {
          ...scope,
          sourceBotId: "alex-executor",
          sourceRunId: "executor-parent-run",
          sourceLeaseOwner: "old-worker",
          sourceLeaseFence: 1,
          requestId: "executor-parent-run:delegate",
          assignments: [
            {
              botId: "nova-executor",
              packet: createContextPacket({
                objective: handoffArgs.message,
                summary: handoffArgs.context_summary,
                constraints: handoffArgs.constraints,
                requestedOutput: handoffArgs.requested_output,
              }),
            },
          ],
        });
        await prisma.externalEffect.create({
          data: {
            workspaceId: scope.workspaceId,
            runId: "executor-parent-run",
            kind: "message_bot",
            idempotencyKey: "executor-parent-run:delegate",
            status: "intended",
            request: handoffArgs,
          },
        });
        await prisma.run.update({
          where: { id: "executor-parent-run" },
          data: { status: "queued", leaseOwner: null },
        });
      }
      const events = createThreadEvents(prisma);
      const peer = new PeerConnector({ prisma, jobs, events });
      const home = new LocalAgentHomeStore(dataDir);
      const checkpoint = vi.spyOn(home, "commit");
      if (stale) {
        const execute = peer.execute.bind(peer);
        vi.spyOn(peer, "execute").mockImplementation(
          async function* (call, context): AsyncIterable<ConnectorEvent> {
            for await (const event of execute(call, context)) {
              if (event.type === "result") {
                await prisma.run.update({
                  where: { id: "executor-parent-run" },
                  data: { leaseOwner: "new-worker", leaseFence: 2 },
                });
                if (stale === "completed") {
                  const effect = await prisma.externalEffect.findUniqueOrThrow({
                    where: { idempotencyKey: call.executionId },
                  });
                  await completeFencedEffect(
                    prisma,
                    {
                      workspaceId: scope.workspaceId,
                      runId: "executor-parent-run",
                      effectId: effect.id,
                      leaseOwner: "new-worker",
                      leaseFence: 2,
                    },
                    { ok: true, taskId: "new-worker-result" },
                  );
                }
                yield { type: "error", message: "Stale connector response" };
              } else yield event;
            }
          },
        );
      }

      executor = createRunExecutor({
        prisma,
        events,
        runtime,
        jobs,
        sandbox: new FakeSandboxProvider(),
        home,
        artifacts: new LocalArtifactStore(dataDir),
        memory: new MarkdownMemoryStore(prisma),
        connector: peer,
        secrets: [],
        dataDir,
      });
      await executor.continueRun("executor-parent-run", "lead-worker");
      if (stale) {
        expect(await prisma.run.findUnique({ where: { id: "executor-parent-run" } })).toMatchObject(
          { status: "running", leaseOwner: "new-worker", leaseFence: 2, error: null },
        );
        const effect = await prisma.externalEffect.findUniqueOrThrow({
          where: { idempotencyKey: "executor-parent-run:delegate" },
        });
        expect(effect).toMatchObject(
          stale === "completed"
            ? { status: "completed", result: { ok: true, taskId: "new-worker-result" } }
            : { status: "intended", result: null },
        );
        expect(requests.map((request) => request.botId)).toEqual(["alex-executor"]);
        expect(await prisma.message.count()).toBe(2); // only the original two private messages
        expect(checkpoint).not.toHaveBeenCalled();
        expect(
          await prisma.attempt.findFirst({ where: { runId: "executor-parent-run" } }),
        ).toMatchObject({ status: "interrupted" });
        return;
      }

      expect(await prisma.run.findUnique({ where: { id: "executor-parent-run" } })).toMatchObject({
        status: "completed",
        error: null,
      });
      expect(requests.map((request) => request.botId)).toEqual(["alex-executor", "nova-executor"]);
      expect(delegated).toBeDefined();
      expect(await prisma.task.count()).toBe(2);
      expect(
        await prisma.externalEffect.findUnique({
          where: { idempotencyKey: "executor-parent-run:delegate" },
        }),
      ).toMatchObject({ status: "completed" });
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ name: "run.continue", payload: { runId: delegated!.runId } }),
      );
      expect(await prisma.task.findUnique({ where: { id: delegated!.taskId } })).toMatchObject({
        status: "completed",
        parentTaskId: "executor-parent-task",
      });
      expect(await prisma.attempt.count({ where: { status: "completed" } })).toBe(2);
      expect(
        await prisma.event.findMany({ where: { type: "collaboration.handoff.accepted" } }),
      ).toHaveLength(1);
      expect(
        await prisma.event.findMany({
          where: { runId: "executor-parent-run", type: "agent.tool.finished" },
        }),
      ).toHaveLength(2);
      expect(await prisma.externalEffect.count({ where: { kind: "read_task_result" } })).toBe(0);
      expect(JSON.stringify(returned)).not.toContain("PRIVATE_CHILD_HISTORY");
      expect(JSON.stringify(returned)).not.toContain("storageKey");
    } finally {
      await jobs.close();
      await database.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
