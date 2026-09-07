import { randomUUID } from "node:crypto";
import type { Actor, Bot } from "@rakazo/contracts";
import { createRepos, type PrismaClient } from "@rakazo/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../local-runtime/src/test-db.js";
import { hydrateBotPresence } from "./bot-presence.js";

describe("persisted bot presence hydration", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let bot: Bot;
  let runId: string;
  const actor: Actor = {
    userId: `presence-user-${randomUUID()}`,
    workspaceId: `presence-workspace-${randomUUID()}`,
    email: "presence@example.test",
    isDeploymentOwner: false,
  };

  beforeAll(async () => {
    const db = await createTestDatabase();
    prisma = db.prisma;
    close = db.close;
    await prisma.organization.create({
      data: {
        id: actor.workspaceId,
        name: "Presence test",
        slug: actor.workspaceId,
        createdAt: new Date(),
      },
    });
    bot = await createRepos(prisma).createBot(actor, {
      name: "Researcher",
      title: "Research",
      instructions: "",
      description: "",
      notifyOnFinish: false,
    });
    const task = await prisma.task.create({
      data: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        botId: bot.id,
        threadId: bot.threadId,
        prompt: "PRIVATE_TASK",
        status: "running",
      },
    });
    const run = await prisma.run.create({
      data: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        botId: bot.id,
        threadId: bot.threadId,
        taskId: task.id,
        status: "running",
        trigger: "user",
        startedAt: new Date(Date.now() - 10_000),
      },
    });
    runId = run.id;
    // Newer terminal history must not obscure a currently active worker.
    await prisma.run.create({
      data: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        botId: bot.id,
        threadId: bot.threadId,
        taskId: task.id,
        status: "completed",
        trigger: "user",
        completedAt: new Date(),
        createdAt: new Date(Date.now() + 1_000),
      },
    });
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({ where: { runId } });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "running", completedAt: null },
    });
    await prisma.event.createMany({
      data: Array.from({ length: 100 }, (_, seq) => ({
        workspaceId: actor.workspaceId,
        botId: bot.id,
        threadId: bot.threadId,
        runId,
        seq,
        type:
          seq === 98
            ? "run.started"
            : seq === 99 || seq % 2 === 0
              ? "agent.tool.started"
              : "agent.tool.finished",
        payload: {
          name: seq === 99 ? "web_search" : "shell",
          executionId: seq === 99 ? "search" : `old-${Math.floor(seq / 2)}`,
          args: "PRIVATE_TOOL_ARGS",
        },
      })),
    });
  });

  it("hydrates the current run and only its latest safe action after reload", async () => {
    const first = await hydrateBotPresence(prisma, actor, [bot]);
    const reloaded = await hydrateBotPresence(
      prisma,
      actor,
      await createRepos(prisma).listBots(actor),
    );
    expect(first[0]?.presence).toMatchObject({ runId, state: "searching", station: "research" });
    expect(reloaded[0]?.presence).toEqual(first[0]?.presence);
    expect(JSON.stringify(first)).not.toContain("PRIVATE_TASK");
    expect(JSON.stringify(first)).not.toContain("PRIVATE_TOOL_ARGS");
  });

  it("rejects another user even when a caller supplies the correct bot ID", async () => {
    await expect(
      hydrateBotPresence(prisma, { ...actor, userId: "someone-else" }, [bot]),
    ).rejects.toThrow();
    await expect(
      hydrateBotPresence(prisma, { ...actor, workspaceId: "another-workspace" }, [bot]),
    ).rejects.toThrow();
  });

  it("a delayed model tool-call event cannot hide a tool that is actually executing", async () => {
    await prisma.event.create({
      data: {
        workspaceId: actor.workspaceId,
        botId: bot.id,
        threadId: bot.threadId,
        runId,
        seq: 100,
        type: "agent.tool.called",
        payload: { name: "web_search", executionId: "search" },
      },
    });
    expect((await hydrateBotPresence(prisma, actor, [bot]))[0]?.presence?.state).toBe("searching");
  });

  it("finishing a parallel tool retains another execution until its own finish", async () => {
    await prisma.event.createMany({
      data: [
        {
          workspaceId: actor.workspaceId,
          botId: bot.id,
          threadId: bot.threadId,
          runId,
          seq: 100,
          type: "agent.tool.started",
          payload: { name: "web_search", executionId: "search-b" },
        },
        {
          workspaceId: actor.workspaceId,
          botId: bot.id,
          threadId: bot.threadId,
          runId,
          seq: 101,
          type: "agent.tool.finished",
          payload: { name: "web_search", executionId: "search-b" },
        },
      ],
    });
    expect((await hydrateBotPresence(prisma, actor, [bot]))[0]?.presence?.state).toBe("searching");
    await prisma.event.create({
      data: {
        workspaceId: actor.workspaceId,
        botId: bot.id,
        threadId: bot.threadId,
        runId,
        seq: 102,
        type: "agent.tool.finished",
        payload: { name: "web_search", executionId: "search" },
      },
    });
    expect((await hydrateBotPresence(prisma, actor, [bot]))[0]?.presence?.state).toBe("thinking");
  });

  it("shows tool completion and cancellation from persisted state", async () => {
    await prisma.event.create({
      data: {
        workspaceId: actor.workspaceId,
        botId: bot.id,
        threadId: bot.threadId,
        runId,
        seq: 100,
        type: "agent.tool.finished",
        payload: { name: "web_search", executionId: "search" },
      },
    });
    expect((await hydrateBotPresence(prisma, actor, [bot]))[0]?.presence?.state).toBe("thinking");
    await prisma.event.createMany({
      data: [
        {
          workspaceId: actor.workspaceId,
          botId: bot.id,
          threadId: bot.threadId,
          runId,
          seq: 101,
          type: "agent.tool.started",
          payload: { name: "shell", executionId: "interrupted-shell" },
        },
        {
          workspaceId: actor.workspaceId,
          botId: bot.id,
          threadId: bot.threadId,
          runId,
          seq: 102,
          type: "run.started",
          payload: {},
        },
      ],
    });
    expect((await hydrateBotPresence(prisma, actor, [bot]))[0]?.presence?.state).toBe("thinking");
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "cancelled",
        completedAt: new Date(),
        createdAt: new Date(Date.now() + 5_000),
      },
    });
    expect((await hydrateBotPresence(prisma, actor, [bot]))[0]?.presence?.state).toBe("cancelled");
  });
});
