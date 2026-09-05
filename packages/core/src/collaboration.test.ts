import { describe, expect, it } from "vitest";
import * as policy from "./collaboration.js";

describe("compact collaboration packets", () => {
  it("keeps only declared context and artifact references", () => {
    const packet = policy.createContextPacket({
      objective: "Check the form",
      summary: "Focus on keyboard navigation.",
      artifactIds: ["artifact-1", "artifact-1"],
      constraints: ["Do not send email"],
      requestedOutput: "Findings with evidence",
      history: "private history must not transfer",
    });
    expect(packet).toEqual({
      version: 1,
      objective: "Check the form",
      summary: "Focus on keyboard navigation.",
      artifactIds: ["artifact-1"],
      constraints: ["Do not send email"],
      requestedOutput: "Findings with evidence",
    });
    expect(JSON.stringify(packet)).not.toContain("private history");
  });
  it("rejects empty objectives and oversized packets rather than silently losing requirements", () => {
    expect(() => policy.createContextPacket({ objective: " " })).toThrow();
    expect(() => policy.createContextPacket({ objective: "x".repeat(3001) })).toThrow();
    expect(() =>
      policy.createContextPacket({ objective: "x", summary: "x".repeat(4001) }),
    ).toThrow();
    expect(() =>
      policy.createContextPacket({
        objective: "x",
        artifactIds: Array.from({ length: 9 }, (_, i) => `a${i}`),
      }),
    ).toThrow();
  });
  it("blocks ancestor cycles, depth overflow and fan-out exhaustion", () => {
    expect(() =>
      policy.assertCollaborationAllowed({
        ancestorBotIds: ["alex"],
        targetBotIds: ["nova"],
        existingChildren: 0,
      }),
    ).not.toThrow();
    expect(() =>
      policy.assertCollaborationAllowed({
        ancestorBotIds: ["alex", "nova"],
        targetBotIds: ["alex"],
        existingChildren: 0,
      }),
    ).toThrow(/cycle/i);
    expect(() =>
      policy.assertCollaborationAllowed({
        ancestorBotIds: ["alex", "nova", "atlas"],
        targetBotIds: ["sage"],
        existingChildren: 0,
      }),
    ).toThrow(/depth/i);
    expect(() =>
      policy.assertCollaborationAllowed({
        ancestorBotIds: ["alex"],
        targetBotIds: ["nova", "nova"],
        existingChildren: 0,
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      policy.assertCollaborationAllowed({
        ancestorBotIds: ["alex"],
        targetBotIds: ["nova"],
        existingChildren: 4,
      }),
    ).toThrow(/budget/i);
  });
});
