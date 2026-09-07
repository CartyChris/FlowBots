import type { AgentRunRequest, AgentRuntimeEvent } from "@rakazo/adapter-kit";
import { expect, it, vi } from "vitest";
import { PiAgentRuntime } from "./pi-runtime.js";

// The external agent SDK is the model/tool-selection boundary. FlowBots' actual
// Pi dispatch, control events, and live authorization callback remain under test.
vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class {
    state: {
      tools: Array<{ execute: (id: string, args: object) => Promise<unknown> }>;
      messages: unknown[];
      errorMessage?: string;
    };
    constructor(options: {
      initialState: {
        tools: Array<{ execute: (id: string, args: object) => Promise<unknown> }>;
        messages: unknown[];
      };
    }) {
      this.state = options.initialState;
    }
    subscribe() {}
    abort() {}
    async waitForIdle() {}
    async prompt() {
      await this.state.tools[0]?.execute("selected-control", {
        reason: "Help",
        name: "Helper",
        task: "Work",
      });
    }
  },
}));

it.each([
  { name: "request_takeover", initiallyAllowed: false },
  { name: "run_subagent", initiallyAllowed: false },
  { name: "run_subagent", initiallyAllowed: true },
])(
  "checks live authorization before dispatching $name (initially allowed: $initiallyAllowed)",
  async ({ name, initiallyAllowed }) => {
    const runtime = new PiAgentRuntime();
    const events: AgentRuntimeEvent[] = [];
    let firstCheck = true;
    const request: AgentRunRequest = {
      botId: "b",
      threadId: "t",
      runId: "r",
      prompt: "Work",
      instructions: "Test",
      history: [],
      model: { provider: "ollama", id: "test" },
      tools: [{ name, description: name, inputSchema: { type: "object" } }],
      allowRuntimeTool: async () => {
        const allowed = firstCheck && initiallyAllowed;
        firstCheck = false;
        return allowed;
      },
    };
    for await (const event of runtime.run(request, {
      operationId: "o",
      traceId: "t",
      workspaceId: "w",
      userId: "u",
      signal: new AbortController().signal,
    }))
      events.push(event);
    expect(events.some((event) => event.type === "takeover" || event.type === "subagent")).toBe(
      false,
    );
    expect(
      events
        .filter((event) => event.type === "text")
        .map((event) => event.text)
        .join(" "),
    ).toMatch(/policy|not permitted/i);
  },
);
