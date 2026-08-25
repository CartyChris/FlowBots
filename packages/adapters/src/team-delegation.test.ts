import { describe, expect, it } from "vitest";
import { builtinAgentTools, DELEGATION_TOOL_NAMES } from "./builtin-tools.js";
import { normalizeTeamAssignments } from "./team-delegation.js";

describe("team delegation", () => {
  it("exposes delegate_team as a bounded collaboration tool", () => {
    const tool = builtinAgentTools.find((entry) => entry.name === "delegate_team");
    expect(tool).toBeTruthy();
    expect(DELEGATION_TOOL_NAMES.has("delegate_team")).toBe(true);
    expect(tool?.inputSchema).toMatchObject({ type: "object" });
  });

  it("normalizes unique concrete assignments while preserving bot id/name targeting", () => {
    expect(
      normalizeTeamAssignments([
        { bot_id: "bot-a", task: "Research the current release." },
        { name: "Reviewer", task: "Check the evidence and challenge weak claims." },
      ]),
    ).toEqual([
      { botId: "bot-a", name: undefined, task: "Research the current release." },
      { botId: undefined, name: "Reviewer", task: "Check the evidence and challenge weak claims." },
    ]);
  });

  it("rejects empty, duplicate, and unbounded fan-out", () => {
    expect(() => normalizeTeamAssignments([])).toThrow(/assignment/i);
    expect(() =>
      normalizeTeamAssignments([
        { bot_id: "bot-a", task: "one" },
        { bot_id: "bot-a", task: "two" },
      ]),
    ).toThrow(/duplicate/i);
    expect(() =>
      normalizeTeamAssignments(
        Array.from({ length: 5 }, (_, index) => ({
          bot_id: `bot-${index}`,
          task: `task ${index}`,
        })),
      ),
    ).toThrow(/4|four|maximum/i);
  });
});
