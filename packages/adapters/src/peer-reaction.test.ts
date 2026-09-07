import type { JobPublisher } from "@rakazo/adapter-kit";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { PeerConnector } from "./peer-connector.js";

function context() {
  return {
    operationId: "run-source",
    traceId: "run-source",
    workspaceId: "workspace-1",
    userId: "user-1",
    botId: "bot-source",
    runId: "run-source",
    signal: new AbortController().signal,
  };
}

function harness(effectCount = 1) {
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
  const reactionRows: Array<{ kind: string; actorKey: string }> = [];
  const prisma = {
    bot: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === source.id ? source : where.id === target.id ? target : null,
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === target.id || where.name === target.name) return [target];
        return [];
      }),
    },
    externalEffect: {
      count: vi.fn(async () => effectCount),
    },
    run: {
      findUnique: vi.fn(async () => ({
        id: "run-source",
        workspaceId: "workspace-1",
        userId: "user-1",
        botId: "bot-source",
        groupChatId: null,
        task: { id: "task-source", prompt: "ordinary user task", parentTaskId: null },
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
    message: {
      findMany: vi.fn(async () => [
        {
          id: "message-target",
          role: "bot",
          blocks: [{ kind: "text", text: "Found three venues." }],
          createdAt: new Date("2026-08-20T00:00:00Z"),
        },
      ]),
    },
    $queryRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.includes('FROM "messages" m')) return [{ messageId: params[0] }];
      if (sql.includes('FROM "message_reactions"')) return [...reactionRows];
      return [];
    }),
    $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith("INSERT")) {
        const actorKey = String(params[3]);
        const kind = String(params[4]);
        if (!reactionRows.some((row) => row.actorKey === actorKey && row.kind === kind)) {
          reactionRows.push({ actorKey, kind });
        }
        return 1;
      }
      if (sql.startsWith("DELETE")) {
        const actorKey = String(params[1]);
        const kind = String(params[2]);
        const index = reactionRows.findIndex(
          (row) => row.actorKey === actorKey && row.kind === kind,
        );
        if (index >= 0) reactionRows.splice(index, 1);
        return index >= 0 ? 1 : 0;
      }
      return 0;
    }),
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
    seq: 1,
    role: input.role,
    blocks: input.blocks,
    runId: input.runId ?? null,
    createdAt: new Date("2026-08-20T00:00:00Z"),
  }));
  return {
    connector: new PeerConnector({ prisma, jobs, events, writeMessage }),
    jobs,
    reactionRows,
  };
}

async function execute(connector: PeerConnector, tool: string, args: Record<string, unknown>) {
  const rows = [];
  for await (const event of connector.execute(
    { tool, args, executionId: `${tool}-execution` },
    context(),
  )) {
    rows.push(event);
  }
  return rows;
}

describe("bot social reactions", () => {
  it("discovers an explicit bot reaction tool", async () => {
    const { connector } = harness();
    const names = (await connector.discoverTools(context())).map((tool) => tool.name);
    expect(names).toContain("react_to_message");
  });

  it("stores reactions under the bot identity without waking another bot", async () => {
    const { connector, jobs, reactionRows } = harness();
    const result = await execute(connector, "react_to_message", {
      message_id: "message-target",
      kind: "fire",
      active: true,
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: "result",
        data: expect.objectContaining({
          ok: true,
          messageId: "message-target",
          kind: "fire",
        }),
      }),
    ]);
    expect(reactionRows).toEqual([{ actorKey: "bot:bot-source", kind: "fire" }]);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("returns message ids from read_bot_updates so a bot can react explicitly", async () => {
    const { connector } = harness();
    const result = await execute(connector, "read_bot_updates", { bot_id: "bot-target" });
    expect(result).toEqual([
      expect.objectContaining({
        type: "result",
        data: expect.objectContaining({
          messages: [expect.objectContaining({ messageId: "message-target" })],
        }),
      }),
    ]);
  });

  it("blocks a fifth reaction effect for the same source run", async () => {
    const { connector, jobs, reactionRows } = harness(5);
    const result = await execute(connector, "react_to_message", {
      message_id: "message-target",
      kind: "eyes",
      active: true,
    });
    expect(result).toEqual([
      expect.objectContaining({
        type: "error",
        message: expect.stringMatching(/reaction budget/i),
      }),
    ]);
    expect(reactionRows).toEqual([]);
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });
});
