import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
  ConnectorEvent,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { CompositeConnector } from "./composio-connector.js";
import { DestinationEmulator } from "./destination-emulator.js";
import { runWithOutputContinuation } from "./output-continuation.js";
import type { PeerConnector } from "./peer-connector.js";

const context: AdapterContext = {
  operationId: "run-1",
  traceId: "run-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  runId: "run-1",
  signal: new AbortController().signal,
};

const request: AgentRunRequest = {
  botId: "bot-1",
  threadId: "thread-1",
  runId: "run-1",
  prompt: "Write the complete answer.",
  instructions: "test",
  history: [],
  tools: [],
  model: { provider: "test", id: "test" },
};

class SequenceRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  constructor(private readonly rounds: AgentRuntimeEvent[][]) {}

  describe() {
    return {
      id: "sequence",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: { streaming: true, compaction: false, tools: true, scripted: false },
    };
  }

  async abort(): Promise<void> {}

  async *run(next: AgentRunRequest): AsyncIterable<AgentRuntimeEvent> {
    this.requests.push(next);
    for (const event of this.rounds[this.requests.length - 1] ?? []) yield event;
  }
}

async function collectRuntime(
  runtime: AgentRuntime,
): Promise<{ events: AgentRuntimeEvent[]; text: string }> {
  const events: AgentRuntimeEvent[] = [];
  let text = "";
  for await (const event of runWithOutputContinuation(runtime, request, context)) {
    events.push(event);
    if (event.type === "text") text += event.text;
  }
  return { events, text };
}

describe("output continuation integration", () => {
  it("continues only an explicit length stop and preserves every streamed character", async () => {
    const runtime = new SequenceRuntime([
      [
        { type: "text", text: "alpha" },
        { type: "text", text: "-" },
        { type: "done", text: "alpha-", finishReason: "length" },
      ],
      [
        { type: "text", text: "omega" },
        { type: "done", text: "omega", finishReason: "stop" },
      ],
    ]);

    const result = await collectRuntime(runtime);

    expect(result.text).toBe("alpha-omega");
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests[1]?.prompt).toMatch(/continue exactly where/i);
    expect(runtime.requests[1]?.history).toContainEqual({ role: "assistant", content: "alpha-" });
    expect(result.events.filter((event) => event.type === "done")).toHaveLength(1);
    expect(result.events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("does not infer truncation from response size when finish reason is unknown", async () => {
    const runtime = new SequenceRuntime([
      [
        { type: "text", text: "x".repeat(50_000) },
        { type: "done", finishReason: "unknown" },
      ],
      [{ type: "text", text: "must-not-run" }],
    ]);

    const result = await collectRuntime(runtime);

    expect(runtime.requests).toHaveLength(1);
    expect(result.text).toHaveLength(50_000);
  });

  it("caps repeated length continuations at six rounds with a visible incomplete notice", async () => {
    const runtime = new SequenceRuntime(
      Array.from({ length: 7 }, (_, index) => [
        { type: "text", text: String(index + 1) },
        { type: "done", finishReason: "length" },
      ]),
    );

    const result = await collectRuntime(runtime);

    expect(runtime.requests).toHaveLength(6);
    expect(result.text.startsWith("123456")).toBe(true);
    expect(result.text).toMatch(/continuation limit reached/i);
    expect(result.text).toMatch(/incomplete/i);
  });
});

describe("adapter public surface", () => {
  it("exports continuation, team delegation, and run-artifact helpers", async () => {
    const adapters = await import("./index.js");
    expect(adapters.continuationDecision).toBeTypeOf("function");
    expect(adapters.normalizeTeamAssignments).toBeTypeOf("function");
    expect(adapters.selectChangedRunArtifacts).toBeTypeOf("function");
  });
});

describe("executor connector stack web routing", () => {
  it("discovers and executes keyless web built-ins through the peer slot used by the executor", async () => {
    const calls: string[] = [];
    const webTools: ConnectorTool[] = [
      { name: "web_search", description: "search", inputSchema: { type: "object" } },
      { name: "web_fetch", description: "fetch", inputSchema: { type: "object" } },
    ];
    const peer = {
      describe: () => ({
        id: "test-peer",
        contractVersion: "1",
        adapterVersion: "1",
        capabilities: { discover: true, oauth: false, secretsBrokered: false },
      }),
      discoverTools: async () => webTools,
      execute: async function* (call: { tool: string }): AsyncIterable<ConnectorEvent> {
        calls.push(call.tool);
        yield { type: "result", data: { ok: true, via: "peer", tool: call.tool } };
      },
    } as unknown as PeerConnector;
    const connector = new CompositeConnector(new DestinationEmulator(), undefined, undefined, peer);

    const discovered = await connector.discoverTools(context);
    expect(discovered.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["web_search", "web_fetch"]),
    );

    const events: ConnectorEvent[] = [];
    for await (const event of connector.execute(
      { tool: "web_search", args: { query: "FlowBots" }, executionId: "web-1" },
      context,
    )) {
      events.push(event);
    }
    expect(calls).toEqual(["web_search"]);
    expect(events).toEqual([
      { type: "result", data: { ok: true, via: "peer", tool: "web_search" } },
    ]);
  });
});
