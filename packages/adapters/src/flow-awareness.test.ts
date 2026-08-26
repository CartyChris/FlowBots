import { describe, expect, it } from "vitest";
import {
  applyFlowMembership,
  buildFlowRoster,
  flowAwarenessInstruction,
  flowMembershipFromInstructions,
} from "./flow-awareness.js";

describe("shared Flow awareness", () => {
  it("defaults to connected and round-trips an explicit isolated membership", () => {
    expect(flowMembershipFromInstructions("Keep answers crisp.")).toBe("connected");
    const isolated = applyFlowMembership("Keep answers crisp.", "isolated");
    expect(flowMembershipFromInstructions(isolated)).toBe("isolated");
    expect(isolated).toContain("Keep answers crisp.");
    const reconnected = applyFlowMembership(isolated, "connected");
    expect(flowMembershipFromInstructions(reconnected)).toBe("connected");
    expect(reconnected).toContain("Keep answers crisp.");
  });

  it("builds a same-user connected roster and excludes isolated teammates", () => {
    const roster = buildFlowRoster(
      { id: "bottie", name: "Bottie", instructions: "" },
      [
        {
          id: "bottie",
          name: "Bottie",
          title: "Coordinator",
          description: "Keeps work moving.",
          instructions: "",
        },
        {
          id: "susie",
          name: "Susie",
          title: "Builder",
          description: "Makes apps and prototypes.",
          instructions: "",
        },
        {
          id: "private",
          name: "Private Bot",
          title: "Private",
          description: "Should not leak into the Flow.",
          instructions: applyFlowMembership("", "isolated"),
        },
      ],
    );
    expect(roster.members.map((member) => member.name)).toEqual(["Bottie", "Susie"]);
    expect(roster.text).toContain("Susie");
    expect(roster.text).toContain("susie");
    expect(roster.text).toContain("Makes apps and prototypes.");
    expect(roster.text).not.toContain("Private Bot");
  });

  it("gives an isolated source no automatic teammate roster", () => {
    const sourceInstructions = applyFlowMembership("", "isolated");
    const roster = buildFlowRoster(
      { id: "solo", name: "Solo", instructions: sourceInstructions },
      [
        { id: "solo", name: "Solo", title: "", description: "", instructions: sourceInstructions },
        { id: "susie", name: "Susie", title: "Builder", description: "Makes apps.", instructions: "" },
      ],
    );
    expect(roster.members).toEqual([]);
    expect(roster.text).toMatch(/separated from the Flow/i);
    expect(roster.text).not.toContain("Susie");
  });

  it("instructs connected bots to resolve teammate names and read teammate work before web search", () => {
    const roster = buildFlowRoster(
      { id: "bottie", name: "Bottie", instructions: "" },
      [
        { id: "bottie", name: "Bottie", title: "Coordinator", description: "", instructions: "" },
        { id: "susie", name: "Susie", title: "Builder", description: "Makes apps.", instructions: "" },
      ],
    );
    const instruction = flowAwarenessInstruction(roster);
    expect(instruction).toMatch(/resolve.*teammate.*name/i);
    expect(instruction).toMatch(/read_bot_updates.*before.*web_search/i);
    expect(instruction).toContain("Susie");
  });
});
