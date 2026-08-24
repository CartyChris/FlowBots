import { describe, expect, it } from "vitest";
import { classifyFreshnessNeed, freshnessInstruction } from "./freshness.js";

describe("freshness routing", () => {
  it.each([
    "What is the latest OpenHands release?",
    "What happened in AI news today?",
    "Check the current price of this product",
    "Is version 4.2 the newest release?",
    "Find the most recent government RFP status",
    "What is available this weekend?",
  ])("requires web evidence for time-sensitive prompt: %s", (prompt) => {
    expect(classifyFreshnessNeed(prompt)).toBe(true);
  });

  it.each([
    "Write a limerick about a robot",
    "Explain binary search",
    "Refactor this function for readability",
    "Summarize the paragraph below",
  ])("does not force web research for timeless prompt: %s", (prompt) => {
    expect(classifyFreshnessNeed(prompt)).toBe(false);
  });

  it("produces an explicit current-date, web-first verification instruction", () => {
    const instruction = freshnessInstruction("2026-08-24");
    expect(instruction).toContain("2026-08-24");
    expect(instruction).toContain("web_search");
    expect(instruction).toContain("web_fetch");
    expect(instruction).toMatch(/untrusted evidence/i);
    expect(instruction).toMatch(/source URL/i);
  });
});
