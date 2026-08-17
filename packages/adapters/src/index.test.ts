import type { MemoryStore } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { recallMemoryForAgent } from "./executor.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { inferScript, ScriptedAgentRuntime } from "./scripted-runtime.js";
import { EncryptedSecretStore } from "./secrets.js";

describe("secret store", () => {
  it("round-trips and never stores plaintext in ciphertext", async () => {
    const store = new EncryptedSecretStore("test-key");
    const record = await store.put("sk-or-v1-secretvalue", {
      operationId: "1",
      traceId: "1",
      workspaceId: "w",
      userId: "u",
      signal: new AbortController().signal,
    });
    expect(record.ciphertext).not.toContain("sk-or-v1-secretvalue");
    expect(store.load(record.ciphertext)).toBe("sk-or-v1-secretvalue");
  });
});

describe("scripted runtime", () => {
  it("requests takeover for login work", () => {
    const script = inferScript("install the cli and sign in");
    expect(script?.some((t) => t.takeover)).toBe(true);
  });

  it("resumes after takeover without asking again", () => {
    const script = inferScript("install the cli and sign in", "takeover");
    expect(script?.some((t) => t.takeover)).toBe(false);
    expect(script?.some((t) => t.complete)).toBe(true);
  });

  it("routes destination/crm work through the connector", () => {
    const script = inferScript("write this to the destination crm as a note");
    expect(script?.some((t) => t.toolCalls?.some((c) => c.name === "destination.write"))).toBe(
      true,
    );
  });

  it("spawns a named bot", () => {
    const script = inferScript("spawn a bot named Scout to research venues");
    expect(script?.some((t) => t.toolCalls?.some((c) => c.name === "spawn_bot"))).toBe(true);
    expect(script?.some((t) => t.toolCalls?.some((c) => c.args.name === "Scout"))).toBe(true);
  });

  it("runs an in-thread subagent", () => {
    const script = inferScript("run a subagent to summarize the notes");
    expect(script?.some((t) => t.toolCalls?.some((c) => c.name === "run_subagent"))).toBe(true);
  });

  it("asks when it needs a decision", () => {
    const script = inferScript("ask me which city to use");
    expect(script?.some((t) => t.ask?.text.toLowerCase().includes("city"))).toBe(true);
  });

  it("stops hang work when aborted", async () => {
    const runtime = new ScriptedAgentRuntime();
    const ctx = {
      operationId: "1",
      traceId: "1",
      workspaceId: "w",
      userId: "u",
      signal: new AbortController().signal,
    };
    const types: string[] = [];
    const iterating = (async () => {
      for await (const event of runtime.run(
        {
          botId: "b",
          threadId: "t",
          runId: "hang-1",
          prompt: "keep working until I stop you",
          instructions: "",
          history: [],
          tools: [],
          model: { provider: "scripted", id: "scripted" },
        },
        ctx,
      )) {
        types.push(event.type);
        if (event.type === "progress") await runtime.abort("hang-1");
      }
    })();
    await iterating;
    expect(types).toContain("progress");
    expect(types.at(-1)).toBe("done");
  });

  it("deletes a spawned bot by exact name", () => {
    const script = inferScript("delete the bot named Scout");
    expect(
      script?.some((t) =>
        t.toolCalls?.some((c) => c.name === "delete_bot" && c.args.confirm_name === "Scout"),
      ),
    ).toBe(true);
  });
});

describe("builtin tools", () => {
  it("exposes the tools the executor actually applies", async () => {
    const { builtinAgentTools } = await import("./builtin-tools.js");
    expect(builtinAgentTools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "write_file",
        "shell",
        "remember",
        "recall_memory",
        "request_takeover",
        "run_subagent",
        "spawn_bot",
        "delete_bot",
      ]),
    );
  });
});

describe("memory recall", () => {
  it("searches user and current-bot memory through a bounded read-only boundary", async () => {
    const context = {
      operationId: "run-1",
      traceId: "run-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      botId: "bot-1",
      runId: "run-1",
      signal: new AbortController().signal,
    };
    const search = vi.fn(
      async (request: { query: string; scope: "user" | "bot" | "all"; botId?: string }) =>
        Array.from({ length: 6 }, (_, index) => ({
          path: `${request.scope}-${index}.md`,
          snippet: `${request.scope}: ${"x".repeat(600)}`,
          score: 100 - index - (request.scope === "bot" ? 0.5 : 0),
        })),
    );
    const memory: MemoryStore = {
      describe: () => ({
        id: "test-memory",
        contractVersion: "1",
        adapterVersion: "1",
        capabilities: { search: true, revisions: true, markdownPortable: true },
      }),
      read: async () => ({ documents: [] }),
      search,
      commit: async (request) => ({
        id: "revision-1",
        path: request.path,
        revision: 1,
        content: request.content,
      }),
      exportMarkdown: async function* () {},
      importMarkdown: async () => ({
        id: "revision-1",
        path: "MEMORY.md",
        revision: 1,
        content: "",
      }),
    };

    const results = await recallMemoryForAgent(memory, "  roadmap  ", "bot-1", context);

    expect(search).toHaveBeenNthCalledWith(1, { query: "roadmap", scope: "user" }, context);
    expect(search).toHaveBeenNthCalledWith(
      2,
      { query: "roadmap", scope: "bot", botId: "bot-1" },
      context,
    );
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.snippet.length <= 500)).toBe(true);
    expect(new Set(results.map((result) => result.scope))).toEqual(new Set(["user", "bot"]));
    expect(results.map((result) => result.score)).toEqual(
      [...results.map((result) => result.score)].sort((a, b) => b - a),
    );

    search.mockClear();
    expect(await recallMemoryForAgent(memory, "   ", "bot-1", context)).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});

describe("fake sandbox", () => {
  it("provisions isolated computers", async () => {
    const sandbox = new FakeSandboxProvider();
    const ctx = {
      operationId: "1",
      traceId: "1",
      workspaceId: "w",
      userId: "u",
      signal: new AbortController().signal,
    };
    const a = await sandbox.provision({ botId: "a", homePath: "/tmp/a" }, ctx);
    const b = await sandbox.provision({ botId: "b", homePath: "/tmp/b" }, ctx);
    expect(a.id).not.toBe(b.id);
  });
});
