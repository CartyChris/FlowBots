import type { JobPublisher } from "@rakazo/adapter-kit";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_PEER_HOPS,
  MAX_PEER_SENDS_PER_RUN,
  PeerConnector,
  peerHopHeader,
} from "./peer-connector.js";

function context(runId = "run-source") {
  return {
    operationId: runId,
    traceId: runId,
    workspaceId: "workspace-1",
    userId: "user-1",
    botId: "bot-source",
    runId,
    signal: new AbortController().signal,
  };
}

function harness(
  options: { effectCount?: number; hop?: number; sourceRun?: Record<string, unknown> | null } = {},
) {
  const source = {
    id: "bot-source",
    name: "Chief",
    workspaceId: "workspace-1",
    userId: "user-1",
    thread: { id: "thread-source" },
  };
  const target = {
    id: "bot-target",
    name: "Scout",
    workspaceId: "workspace-1",
    userId: "user-1",
    thread: { id: "thread-target" },
  };
  const prisma = {
    bot: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === source.id || where.name === source.name) return [source];
        if (where.id === target.id || where.name === target.name) return [target];
        return [];
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === source.id ? source : where.id === target.id ? target : null,
      ),
    },
    run: {
      findUnique: vi.fn(async () => ({
        id: "run-source",
        workspaceId: "workspace-1",
        userId: "user-1",
        botId: "bot-source",
        groupChatId: null,
        task: {
          id: "task-source",
          parentTaskId: null,
          prompt:
            options.hop == null
              ? "ordinary user task"
              : `${peerHopHeader(options.hop, "bot-parent")}\npeer task`,
        },
        ...options.sourceRun,
      })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "run-target",
        ...data,
      })),
    },
    task: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "task-target",
        ...data,
      })),
    },
    externalEffect: {
      count: vi.fn(async () => options.effectCount ?? 1),
    },
    message: {
      findMany: vi.fn(async () => [
        {
          role: "bot",
          blocks: [{ kind: "text", text: "Found three venues." }],
          createdAt: new Date("2026-08-18T20:00:00Z"),
        },
      ]),
    },
    artifact: { findMany: vi.fn(async () => []) },
  } as unknown as PrismaClient;
  const jobs = {
    enqueue: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as JobPublisher;
  const events = {
    append: vi.fn(async () => ({ id: "event-peer" })),
  } as unknown as ThreadEvents;
  const writeMessage = vi.fn(async (_prisma, input) => ({
    id: "message-peer",
    threadId: input.threadId,
    seq: 7,
    role: input.role,
    blocks: input.blocks,
    runId: input.runId ?? null,
    createdAt: new Date("2026-08-18T20:00:00Z"),
  }));
  const connector = new PeerConnector({ prisma, jobs, events, writeMessage });
  if (options.sourceRun === null) vi.mocked(prisma.run.findUnique).mockResolvedValue(null);
  return { connector, prisma, jobs, events, writeMessage, source, target };
}

async function execute(
  connector: PeerConnector,
  tool: string,
  args: Record<string, unknown>,
  runId = "run-source",
) {
  const events = [];
  for await (const event of connector.execute(
    { tool, args, executionId: `${tool}-execution` },
    context(runId),
  )) {
    events.push(event);
  }
  return events;
}

describe("PeerConnector", () => {
  it("discovers explicit peer collaboration tools", async () => {
    const { connector } = harness();
    const names = (await connector.discoverTools(context())).map((tool) => tool.name);
    expect(names).toContain("message_bot");
    expect(names).toContain("delegate_to_bot");
    expect(names).toContain("read_bot_updates");
    expect(names).toContain("read_task_result");
  });

  it("advertises compact context and artifact references for discovered delegation", async () => {
    const { connector } = harness();
    const tools = await connector.discoverTools(context());
    for (const name of ["delegate_to_bot", "delegate_team"]) {
      expect(tools.find((tool) => tool.name === name)?.inputSchema).toMatchObject({
        properties: {
          context_summary: { type: "string" },
          artifact_ids: { type: "array" },
          requested_output: { type: "string" },
        },
      });
    }
  });

  it("cannot wake a peer when its source run does not exist", async () => {
    const { connector, jobs, writeMessage, target } = harness({ sourceRun: null });
    const result = await execute(connector, "message_bot", {
      bot_id: target.id,
      message: "Please check venue availability.",
    });

    expect(result).toEqual([
      expect.objectContaining({ type: "error", message: expect.stringMatching(/source run/i) }),
    ]);
    expect(writeMessage).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it.each(["read_bot_updates", "consult_teammate"])(
    "%s forbids room or child runs from reading private history",
    async (tool) => {
      for (const sourceRun of [
        { groupChatId: "room-1" },
        { task: { id: "task-source", prompt: "scoped", parentTaskId: "parent-task" } },
      ]) {
        const { connector } = harness({ sourceRun });
        const result = await execute(connector, tool, { bot_id: "bot-target" });
        expect(result).toEqual([
          expect.objectContaining({
            type: "error",
            message: expect.stringMatching(/read_task_result/),
          }),
        ]);
      }
    },
  );

  it.each(["read_bot_updates", "consult_teammate"])(
    "%s validates the source run owner, workspace and bot",
    async (tool) => {
      for (const sourceRun of [
        null,
        { workspaceId: "other-workspace" },
        { userId: "other-user" },
        { botId: "other-bot" },
      ]) {
        const { connector } = harness({ sourceRun });
        const result = await execute(connector, tool, { bot_id: "bot-target" });
        expect(result).toEqual([
          expect.objectContaining({ type: "error", message: expect.stringMatching(/source run/i) }),
        ]);
      }
    },
  );

  it("stops outbound collaboration when the per-run send budget is exhausted", async () => {
    const { connector, writeMessage, jobs } = harness({ effectCount: MAX_PEER_SENDS_PER_RUN + 1 });
    const result = await execute(connector, "message_bot", {
      bot_id: "bot-target",
      message: "One more ping",
    });

    expect(result).toEqual([
      expect.objectContaining({ type: "error", message: expect.stringMatching(/send budget/i) }),
    ]);
    expect(writeMessage).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("stops recursive peer-trigger chains at the hop limit", async () => {
    const { connector, writeMessage, jobs } = harness({ hop: MAX_PEER_HOPS });
    const result = await execute(connector, "delegate_to_bot", {
      bot_id: "bot-target",
      task: "Bounce this back again",
    });

    expect(result).toEqual([
      expect.objectContaining({ type: "error", message: expect.stringMatching(/hop limit/i) }),
    ]);
    expect(writeMessage).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("reads recent teammate updates without starting another run", async () => {
    const { connector, jobs } = harness();
    const result = await execute(connector, "read_bot_updates", {
      bot_id: "bot-target",
      limit: 5,
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: "result",
        data: expect.objectContaining({
          botId: "bot-target",
          messages: [expect.objectContaining({ text: "Found three venues." })],
        }),
      }),
    ]);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});
