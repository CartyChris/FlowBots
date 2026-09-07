import { describe, expect, it } from "vitest";
import { projectBotPresence } from "./bot-presence.js";

const now = Date.parse("2026-09-05T12:00:00.000Z");
const run = {
  id: "run-a",
  taskId: "task-a",
  status: "running",
  startedAt: new Date(now - 60_000).toISOString(),
  completedAt: null,
  updatedAt: new Date(now - 1_000).toISOString(),
  modelProvider: "ollama",
  modelId: "local-model",
};
const event = (name: unknown, type = "agent.tool.started", runId = run.id) => ({
  runId,
  type,
  createdAt: new Date(now - 500).toISOString(),
  payload: { name },
});

describe("canonical bot presence", () => {
  it("does not invent activity for a bot with no run", () => {
    expect(projectBotPresence({ botId: "bot-a", run: null, now })).toMatchObject({
      state: "idle",
      station: "lounge",
      runId: null,
      taskId: null,
    });
  });

  it("keeps idle timestamps stable while the roster is polled", () => {
    const input = { botId: "bot-a", run: null, updatedAt: "2026-09-01T00:00:00.000Z" };
    expect(projectBotPresence({ ...input, now }).updatedAt).toBe(
      projectBotPresence({ ...input, now: now + 60_000 }).updatedAt,
    );
  });

  it.each([
    ["web_search", "searching", "research"],
    ["web_fetch", "browsing", "research"],
    ["read_file", "reading", "focus"],
    ["write_file", "coding", "development"],
    ["shell", "running_command", "development"],
    ["verify_current_claim", "verifying", "review"],
    ["delegate_to_bot", "delegating", "collaboration"],
    ["delegate_team", "delegating", "collaboration"],
    ["consult_teammate", "collaborating", "collaboration"],
    ["message_bot", "collaborating", "collaboration"],
    ["unknown_extension_tool", "using_tool", "focus"],
  ])("projects actual %s invocation to %s", (name, state, station) => {
    expect(projectBotPresence({ botId: "bot-a", run, event: event(name), now })).toMatchObject({
      state,
      station,
      runId: run.id,
      taskId: run.taskId,
      modelProvider: "ollama",
      modelId: "local-model",
      startedAt: run.startedAt,
    });
  });

  it("does not expire a tool merely because it takes longer than an animation cycle", () => {
    expect(
      projectBotPresence({ botId: "bot-a", run, event: event("shell"), now: now + 30_000 }).state,
    ).toBe("running_command");
  });

  it("tool finish returns to thinking without claiming that the run completed", () => {
    expect(
      projectBotPresence({
        botId: "bot-a",
        run,
        event: event("shell", "agent.tool.finished"),
        now,
      }),
    ).toMatchObject({ state: "thinking", station: "focus" });
  });

  it("does not claim a planned legacy tool call is executing", () => {
    expect(
      projectBotPresence({ botId: "bot-a", run, event: event("shell", "agent.tool.called"), now })
        .state,
    ).toBe("thinking");
  });

  it("a resumed run start supersedes a previous attempt's tool activity", () => {
    expect(
      projectBotPresence({ botId: "bot-a", run, event: event("shell", "run.started"), now }).state,
    ).toBe("thinking");
  });

  it.each([
    ["queued", "queued"],
    ["leased", "queued"],
    ["waiting_input", "needs_user"],
    ["waiting_takeover", "needs_user"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ])("%s lifecycle wins over stale tool activity", (status, state) => {
    expect(
      projectBotPresence({ botId: "bot-a", run: { ...run, status }, event: event("shell"), now })
        .state,
    ).toBe(state);
  });

  it("acknowledges completion briefly then returns to idle deterministically", () => {
    const completed = { ...run, status: "completed", completedAt: new Date(now).toISOString() };
    expect(
      projectBotPresence({ botId: "bot-a", run: completed, event: event("shell"), now }).state,
    ).toBe("complete");
    expect(projectBotPresence({ botId: "bot-a", run: completed, now: now + 10_000 }).state).toBe(
      "idle",
    );
  });

  it.each(["other-run", null])("rejects activity belonging to %s", (runId) => {
    expect(
      projectBotPresence({ botId: "bot-a", run, event: { ...event("shell"), runId }, now }).state,
    ).toBe("thinking");
  });

  it("rejects an event older than the current run start", () => {
    expect(
      projectBotPresence({
        botId: "bot-a",
        run,
        event: {
          ...event("shell"),
          createdAt: new Date(now - 120_000).toISOString(),
        },
        now,
      }).state,
    ).toBe("thinking");
  });

  it("does not expose arbitrary tool names, arguments, text, errors, or private reasoning", () => {
    const secret = "PRIVATE_PROMPT_AND_SECRET";
    const privateRun = { ...run, error: secret };
    const result = projectBotPresence({
      botId: "bot-a",
      run: privateRun,
      event: {
        ...event(secret),
        payload: { name: secret, args: secret, text: secret, reasoning: secret },
      },
      now,
    });
    expect(result.state).toBe("using_tool");
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("handles malformed historical timestamps without an immortal celebration", () => {
    expect(
      projectBotPresence({
        botId: "bot-a",
        run: {
          ...run,
          status: "completed",
          completedAt: "invalid",
          updatedAt: "invalid",
        },
        now,
      }).state,
    ).toBe("idle");
  });
});
