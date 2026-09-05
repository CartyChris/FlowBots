import type { Bot } from "@rakazo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MissionControl,
  type MissionTask,
  MissionTimelineEvent,
  taskTreeIsActive,
} from "./MissionControl.js";

const task: MissionTask = {
  id: "child-task",
  parentTaskId: "lead-task",
  botId: "nova",
  botName: "Nova",
  prompt: "Verify frontend keyboard navigation",
  status: "running",
  createdAt: "2026-09-05T00:00:00Z",
  updatedAt: "2026-09-05T00:00:00Z",
  runId: "child-run",
  groupChatId: "team-room",
  kind: "delegate",
  artifactCount: 2,
};
function render(tasks: MissionTask[], bots: Bot[] = [], error: string | null = null) {
  return renderToStaticMarkup(
    <MissionControl
      tasks={tasks}
      bots={bots}
      revision={0}
      truncated={false}
      error={error}
      onOpenChat={() => undefined}
      onStop={async () => undefined}
    />,
  );
}

describe("Mission Control persisted ownership", () => {
  it("shows task owner, lineage and artifact count from the task record", () => {
    const html = render([task]);
    expect(html).toContain("Nova");
    expect(html).toContain("Verify frontend keyboard navigation");
    expect(html).toContain("lead-task");
    expect(html).toContain("2 artifacts");
    expect(html).toContain("Inspect task Verify frontend keyboard navigation");
  });
  it("keeps parent cancellation available while a descendant is working", () => {
    const parent = { ...task, id: "lead-task", parentTaskId: null, status: "completed" };
    expect(taskTreeIsActive(parent.id, [parent, task])).toBe(true);
    expect(taskTreeIsActive(parent.id, [parent, { ...task, status: "cancelled" }])).toBe(false);
  });
  it("terminates its view traversal even if lineage data is cyclic", () => {
    const cycle = { ...task, id: "lead-task", parentTaskId: "child-task", status: "completed" };
    expect(taskTreeIsActive("lead-task", [cycle, { ...task, status: "completed" }])).toBe(false);
  });
  it("does not turn an empty task list into simulated work", () => {
    const html = render([]);
    expect(html).toContain("No tasks yet");
    expect(html).not.toContain("Inspect task");
  });
  it("does not claim the ledger is empty when the fetch failed", () => {
    const html = render([], [], "Connection unavailable");
    expect(html).not.toContain("No tasks yet");
    expect(html).toContain("Task list unavailable");
  });
  it("exposes refresh failures instead of presenting stale telemetry as live", () => {
    const html = render([task], [], "Connection unavailable");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Connection unavailable");
  });
});

it("renders real handoff participants and child-task navigation without raw payload leakage", () => {
  const html = renderToStaticMarkup(
    <MissionTimelineEvent
      event={{
        id: "event-1",
        type: "collaboration.handoff.started",
        createdAt: "2026-09-05T00:00:00Z",
        botId: "alex",
        payload: {
          sourceBotId: "alex",
          targetBotId: "nova",
          taskId: "child-task",
          unsafe: "private-tool-argument",
        },
      }}
      bots={
        [
          { id: "alex", name: "Alex" },
          { id: "nova", name: "Nova" },
        ] as Bot[]
      }
      onSelectTask={() => undefined}
    />,
  );
  expect(html).toContain("Alex");
  expect(html).toContain("Nova");
  expect(html).toContain("Handoff started");
  expect(html).toContain("Inspect handoff task");
  expect(html).not.toContain("private-tool-argument");
});
