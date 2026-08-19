import { describe, expect, it } from "vitest";
import {
  applyBotRoleInstructions,
  BOT_ROLE_PRESETS,
  botRoleInstructions,
  botRoleSelection,
  type BotRolePreset,
} from "./bot-personality.js";

const roles: BotRolePreset[] = [
  "Developer",
  "Researcher",
  "Employee",
  "Friend",
  "Coach",
  "Custom",
];

describe("bot role presets", () => {
  it("exposes the requested stable role set", () => {
    expect(Object.keys(BOT_ROLE_PRESETS)).toEqual(roles);
  });

  it("adds initiative without changing permission or truthfulness boundaries", () => {
    for (const role of roles.filter((role) => role !== "Custom")) {
      const prompt = botRoleInstructions(role, "Own the launch checklist.");
      expect(prompt).toMatch(/proactive|initiative|move work forward/i);
      expect(prompt).toMatch(/permission|approval/i);
      expect(prompt).toMatch(/never claim|verify/i);
      expect(prompt).toContain("Own the launch checklist.");
    }
  });

  it("keeps Custom literal while preserving the global safety boundary", () => {
    const prompt = botRoleInstructions("Custom", "Be terse and technical.");
    expect(prompt).toContain("Be terse and technical.");
    expect(prompt).toMatch(/permission|approval/i);
    expect(prompt).toMatch(/never claim|verify/i);
  });

  it("adds and replaces a role section without changing user-written instructions", () => {
    const original = "Keep release notes short.\nNever edit generated snapshots by hand.";
    const developer = applyBotRoleInstructions(original, "Developer");
    expect(developer).toContain(original);
    expect(developer).toContain("flowbots-role:Developer");
    expect(developer).toContain(BOT_ROLE_PRESETS.Developer);

    const coach = applyBotRoleInstructions(developer, "Coach");
    expect(coach).toContain(original);
    expect(coach).toContain("flowbots-role:Coach");
    expect(coach).toContain(BOT_ROLE_PRESETS.Coach);
    expect(coach).not.toContain("flowbots-role:Developer");
    expect(coach.match(/flowbots-role:/g)).toHaveLength(1);
  });

  it("persists custom role context and can read the selection back", () => {
    const instructions = applyBotRoleInstructions("User-owned context.", "Custom", "Dry humor. No filler.");
    expect(botRoleSelection(instructions)).toEqual({
      role: "Custom",
      context: "Dry humor. No filler.",
    });
  });

  it("treats untagged legacy instructions as no stored role", () => {
    expect(botRoleSelection("Legacy instructions only.")).toEqual({ role: null, context: "" });
  });
});
