import { describe, expect, it } from "vitest";
import {
  applyBotSteeringProfile,
  BOT_ROLE_PRESETS,
  botSteeringInstructions,
  botSteeringSelection,
  type BotSteeringProfile,
} from "./bot-personality.js";

const profile: BotSteeringProfile = {
  initiative: "proactive",
  expressiveness: "natural",
  challenge: "skeptical",
  collaboration: "team-first",
  research: "verify-current",
  depth: "exhaustive",
};

describe("bot steering profiles", () => {
  it("adds stronger role presets without removing the original roles", () => {
    expect(Object.keys(BOT_ROLE_PRESETS)).toEqual(
      expect.arrayContaining([
        "Developer",
        "Researcher",
        "Employee",
        "Friend",
        "Coach",
        "Analyst",
        "Builder",
        "Creative",
        "Operator",
        "Research Lead",
        "Custom",
      ]),
    );
  });

  it("round-trips all six steering axes without damaging user instructions", () => {
    const userOwned = "Keep release notes short.\nNever modify production without approval.";
    const stored = applyBotSteeringProfile(userOwned, profile);
    expect(stored).toContain(userOwned);
    expect(stored.match(/flowbots-steering:v2/g)).toHaveLength(1);
    expect(botSteeringSelection(stored)).toEqual(profile);

    const changed = applyBotSteeringProfile(stored, { ...profile, depth: "brief" });
    expect(changed).toContain(userOwned);
    expect(changed.match(/flowbots-steering:v2/g)).toHaveLength(1);
    expect(botSteeringSelection(changed).depth).toBe("brief");
  });

  it("turns the selected posture into deterministic behavior while preserving authority boundaries", () => {
    const prompt = botSteeringInstructions(profile);
    expect(prompt).toMatch(/proactive/i);
    expect(prompt).toMatch(/team|teammate|collaborat/i);
    expect(prompt).toMatch(/web_search|current|verify/i);
    expect(prompt).toMatch(/skeptical|challenge|question/i);
    expect(prompt).toMatch(/exhaustive|depth|thorough/i);
    expect(prompt).toMatch(/permission|authority/i);
    expect(prompt).toMatch(/truth|verify|claim/i);
    expect(botSteeringInstructions(profile)).toBe(prompt);
  });
});
