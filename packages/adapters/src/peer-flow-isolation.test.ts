import type { JobPublisher } from "@rakazo/adapter-kit";
import { applyFlowMembership } from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { PeerConnector } from "./peer-connector.js";

function makeConnector(options: { sourceIsolated?: boolean; targetIsolated?: boolean } = {}) {
  const source = {
    id: "bot-source",
    name: "Bottie",
    title: "Coordinator",
    description: "Coordinates the Flow.",
    instructions: options.sourceIsolated ? applyFlowMembership("", "isolated") : "",
    workspaceId: "workspace-1",
    userId: "user-1",
    thread: { id: "thread-source" },
  };
  const target = {
    id: "bot-target",
    name: "Susie",
    title: "Builder",
    description: "Builds apps and prototypes.",
    instructions: options.targetIsolated ? applyFlowMembership("", "isolated") : "",
    workspaceId: "workspace-1",
    userId: "user-1",
    thread: { id: "thread-target" },
  };
  const prisma = {
    bot: {
      findUnique: vi.fn(async () => source),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === target.id || where.name === target.name) return [target];
        return [];
      }),
    },
    message: {
      findMany: vi.fn(async () => [
        {
          id: "message-1",
          role: "bot",
          blocks: [{ kind: "text", text: "I built Atlas Notes and TinyBoard." }],
          createdAt: new Date("2026-08-25T20:00:00Z"),
        },
      ]),
    },
    artifact: {
      findMany: vi.fn(async () => [
        {
          id: "artifact-1",
          name: "atlas-notes.html",
          mimeType: "text/html",
          size: 1200,
          createdAt: new Date("2026-08-25T19:00:00Z"),
        },
      ]),
    },
  } as unknown as PrismaClient;
  const jobs = { enqueue: vi.fn(), cancel: vi.fn(), close: vi.fn() } as unknown as JobPublisher;
  const events = { append: vi.fn() } as unknown as ThreadEvents;
  return {
    connector: new PeerConnector({ prisma, jobs, events }),
    target,
  };
}

function context() {
  return {
    operationId: "run-1",
    traceId: "run-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    botId: "bot-source",
    runId: "run-1",
    signal: new AbortController().signal,
  };
}

async function execute(connector: PeerConnector, tool: string, args: Record<string, unknown>) {
  const result = [];
  for await (const event of connector.execute(
    { tool, args, executionId: `${tool}-1` },
    context(),
  )) {
    result.push(event);
  }
  return result;
}

describe("Flow-aware peer collaboration", () => {
  it("discovers a non-waking consult_teammate tool", async () => {
    const { connector } = makeConnector();
    const names = (await connector.discoverTools(context())).map((tool) => tool.name);
    expect(names).toContain("consult_teammate");
  });

  it("consults a connected teammate with profile, recent messages, and artifacts", async () => {
    const { connector } = makeConnector();
    const result = await execute(connector, "consult_teammate", { name: "Susie", limit: 6 });
    expect(result).toEqual([
      expect.objectContaining({
        type: "result",
        data: expect.objectContaining({
          name: "Susie",
          title: "Builder",
          description: "Builds apps and prototypes.",
          messages: [expect.objectContaining({ text: expect.stringContaining("Atlas Notes") })],
          artifacts: [expect.objectContaining({ name: "atlas-notes.html" })],
        }),
      }),
    ]);
  });

  it("rejects automatic access to a teammate separated from the Flow", async () => {
    const { connector } = makeConnector({ targetIsolated: true });
    const result = await execute(connector, "read_bot_updates", { name: "Susie" });
    expect(result).toEqual([
      expect.objectContaining({
        type: "error",
        message: expect.stringMatching(/separated.*Flow/i),
      }),
    ]);
  });

  it("prevents an isolated source bot from automatically entering the shared Flow", async () => {
    const { connector } = makeConnector({ sourceIsolated: true });
    const result = await execute(connector, "read_bot_updates", { name: "Susie" });
    expect(result).toEqual([
      expect.objectContaining({
        type: "error",
        message: expect.stringMatching(/separated.*Flow/i),
      }),
    ]);
  });
});
