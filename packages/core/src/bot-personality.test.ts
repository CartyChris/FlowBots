import { describe, expect, it } from "vitest";
import {
  BOT_ROLE_PRESETS,
  botRoleInstructions,
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
});
