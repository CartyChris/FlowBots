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

function harness(options: { effectCount?: number; hop?: number } = {}) {
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
        task: {
          prompt:
            options.hop == null
              ? "ordinary user task"
              : `${peerHopHeader(options.hop, "bot-parent")}\npeer task`,
        },
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
  } as unknown as PrismaClient;
  const jobs = {
    enqueue: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as JobPublisher;
  const events = {
    append: vi.fn(async () => ({ id: "event-peer" })),
  } as unknown as ThreadEvents;
  const writeMessage = vi.fn(async () => ({ id: "message-peer" }));
  const connector = new PeerConnector({ prisma, jobs, events, writeMessage });
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
  });

  it("writes peer origin into the target thread and queues one bounded follow-up run", async () => {
    const { connector, prisma, jobs, events, writeMessage, target } = harness();
    const result = await execute(connector, "message_bot", {
      bot_id: target.id,
      message: "Please check venue availability.",
    });

    expect(result).toEqual([
      expect.objectContaining({
        type: "result",
        data: expect.objectContaining({ ok: true, botId: target.id, runId: "run-target" }),
      }),
    ]);
    expect(writeMessage).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        threadId: target.thread.id,
        role: "system",
        blocks: [
          expect.objectContaining({ kind: "meta", text: expect.stringMatching(/From Chief.*peer/i) }),
          { kind: "text", text: "Please check venue availability." },
        ],
      }),
    );
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        botId: target.id,
        threadId: target.thread.id,
        prompt: expect.stringMatching(/flowbots-peer.*hop=1/i),
      }),
    });
    expect(prisma.run.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ botId: target.id, trigger: "follow_up" }),
    });
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: target.thread.id,
        botId: target.id,
        type: "thread.message.created",
        payload: expect.objectContaining({ sourceBotId: "bot-source", peer: true }),
      }),
    );
  });

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
