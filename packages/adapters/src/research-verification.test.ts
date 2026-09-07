import { describe, expect, it } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import {
  buildVerificationQueries,
  classifyResearchVerificationNeed,
  researchVerificationInstruction,
} from "./research-verification.js";

describe("research verification v2", () => {
  it("distinguishes standard current, volatile entity, and deep research requests", () => {
    expect(classifyResearchVerificationNeed("What is the latest news today?")).toBe(
      "standard-current",
    );
    expect(
      classifyResearchVerificationNeed(
        "Is Senator Example still serving and running for reelection today?",
      ),
    ).toBe("volatile-entity");
    expect(
      classifyResearchVerificationNeed(
        "Deep research this topic, fact-check it, and cross-check contradictions.",
      ),
    ).toBe("deep-research");
    expect(classifyResearchVerificationNeed("Write a short poem about rain.")).toBe("none");
  });

  it("builds a bounded status and contradiction query bundle for a named entity", () => {
    const queries = buildVerificationQueries({
      claim: "Lindsey Graham faces a South Carolina election challenge",
      entity: "Lindsey Graham",
      currentDate: "2026-08-26",
    });
    expect(queries.length).toBeGreaterThanOrEqual(3);
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(queries.join("\n")).toMatch(/current status|latest status/i);
    expect(queries.join("\n")).toMatch(/death|obituary|succession/i);
    expect(queries.join("\n")).toContain("2026-08-26");
  });

  it("requires contradiction checks before volatile current-person synthesis", () => {
    const text = researchVerificationInstruction("volatile-entity", "2026-08-26");
    expect(text).toMatch(/contradiction/i);
    expect(text).toMatch(/primary|official/i);
    expect(text).toMatch(/independent|second source|corrobor/i);
    expect(text).toMatch(/death|office|election/i);
  });

  it("exposes verify_current_claim as a built-in keyless research tool", () => {
    const tool = builtinAgentTools.find((entry) => entry.name === "verify_current_claim");
    expect(tool).toBeTruthy();
    expect(tool?.inputSchema).toMatchObject({ type: "object", required: ["claim"] });
  });
});
