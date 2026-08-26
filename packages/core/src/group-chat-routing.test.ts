import { describe, expect, test } from "vitest";
import { extractGroupMentions, resolveGroupResponders } from "./group-chat-routing.js";

const members = [
  {
    botId: "bottie",
    name: "Bottie",
    title: "Chief of staff",
    description: "Coordinates plans, priorities, and team handoffs.",
  },
  {
    botId: "randy",
    name: "Randy",
    title: "Research specialist",
    description: "Finds current evidence, news, sources, and facts.",
  },
  {
    botId: "susie",
    name: "Susie",
    title: "Builder specialist",
    description: "Builds apps, websites, interfaces, and code.",
  },
  {
    botId: "vera",
    name: "Vera",
    title: "Verifier",
    description: "Checks claims, contradictions, and source quality.",
  },
  {
    botId: "max",
    name: "Max",
    title: "Analyst",
    description: "Analyzes numbers and tradeoffs.",
  },
] as const;

describe("group chat routing", () => {
  test("extracts explicit bot mentions case-insensitively", () => {
    expect(extractGroupMentions("@randy and @SUSIE please compare notes", members)).toEqual([
      "randy",
      "susie",
    ]);
  });

  test("@all targets the room but remains bounded to four responders", () => {
    expect(resolveGroupResponders("@all weigh in", members)).toEqual([
      "bottie",
      "randy",
      "susie",
      "vera",
    ]);
  });

  test("explicit mentions take precedence over smart routing", () => {
    expect(resolveGroupResponders("@Susie build a web app about breaking news", members)).toEqual([
      "susie",
    ]);
  });

  test("smart routing prefers relevant specialists", () => {
    const selected = resolveGroupResponders(
      "Research the latest news, verify the claims, and cite current sources",
      members,
    );
    expect(selected).toContain("randy");
    expect(selected).toContain("vera");
    expect(selected).not.toContain("susie");
    expect(selected.length).toBeLessThanOrEqual(3);
  });

  test("falls back to the first two members when no specialty matches", () => {
    expect(resolveGroupResponders("say hello", members)).toEqual(["bottie", "randy"]);
  });
});
