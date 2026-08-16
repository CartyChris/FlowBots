import { describe, expect, test } from "vitest";
import {
  classifyResearchRoute,
  orderedResearchCredentials,
  type RouteCredential,
} from "./research-routing.js";

const defaultCredential: RouteCredential = {
  id: "default",
  provider: "openrouter",
  defaultModel: "anthropic/claude-sonnet-4",
  isDefault: true,
};
const venice: RouteCredential = {
  id: "venice",
  provider: "venice",
  defaultModel: "venice-uncensored",
  isDefault: false,
};
const godmode: RouteCredential = {
  id: "godmode",
  provider: "g0dm0d3",
  defaultModel: "ultraplinian/fast",
  isDefault: false,
};

describe("research routing", () => {
  test("ordinary work stays on the user's default provider", () => {
    expect(classifyResearchRoute("Draft a concise project update for my team.")).toBe("default");
    expect(
      orderedResearchCredentials("Draft a concise project update", [godmode, venice, defaultCredential]),
    ).toEqual([defaultCredential]);
  });

  test("tool-heavy cybersecurity and high-control research prefers Venice, then G0DM0D3, then default", () => {
    const prompts = [
      "Analyze this CTF binary for a buffer overflow vulnerability",
      "Help with an authorized penetration test of my lab",
      "Perform malware analysis on this sample",
      "Use high-control research mode for this reverse engineering task",
      "Use an uncensored model for this security research discussion",
    ];
    for (const prompt of prompts) {
      expect(classifyResearchRoute(prompt)).toBe("research");
      expect(orderedResearchCredentials(prompt, [venice, defaultCredential, godmode])).toEqual([
        venice,
        godmode,
        defaultCredential,
      ]);
    }
  });

  test("explicit multi-model orchestration prefers G0DM0D3, then Venice, then default", () => {
    const prompts = [
      "Use G0DM0D3 for this research task",
      "Run ULTRAPLINIAN fast on this question",
      "Use CONSORTIUM to synthesize multiple model opinions",
      "Do deep multi-model research on these competing hypotheses",
      "Use the hive mind for this analysis",
    ];
    for (const prompt of prompts) {
      expect(classifyResearchRoute(prompt)).toBe("orchestration");
      expect(orderedResearchCredentials(prompt, [venice, defaultCredential, godmode])).toEqual([
        godmode,
        venice,
        defaultCredential,
      ]);
    }
  });

  test("only connected credentials are candidates and the default remains the fallback", () => {
    expect(
      orderedResearchCredentials("cybersecurity research on my own lab", [defaultCredential, venice]),
    ).toEqual([venice, defaultCredential]);
    expect(orderedResearchCredentials("G0DM0D3 this analysis", [defaultCredential, venice])).toEqual([
      venice,
      defaultCredential,
    ]);
    expect(
      orderedResearchCredentials("cybersecurity research on my own lab", [defaultCredential]),
    ).toEqual([defaultCredential]);
  });

  test("keyword substrings do not accidentally reroute unrelated words", () => {
    expect(
      classifyResearchRoute("Write a retrospective about exploiting market opportunities responsibly"),
    ).toBe("default");
    expect(classifyResearchRoute("Summarize a reverse mortgage article")).toBe("default");
  });
});
