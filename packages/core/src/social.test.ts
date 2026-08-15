import { describe, expect, it } from "vitest";
import { normalizePersona } from "./personality.js";
import {
  ambientNudge,
  formatLoungeTranscript,
  isReactionKind,
  LOUNGE_TOPICS,
  loungeTopic,
  projectPresence,
  REACTION_EMOJI,
  REACTION_KINDS,
  steeringHintFromPrompt,
  stripSteeringPrefix,
} from "./social.js";

const basePresence = {
  botId: "bot1",
  name: "Ruckus",
  color: "#fff",
  persona: normalizePersona("unhinged"),
  status: "idle",
  updatedAt: new Date().toISOString(),
};

describe("projectPresence", () => {
  it("marks working bots as thinking with the persona tag", () => {
    const presence = projectPresence({ ...basePresence, status: "running" });
    expect(presence.state).toBe("thinking");
    expect(presence.tag).toBe("cackling over the logs");
    expect(presence.emoji).toBe("🌀");
  });

  it("marks recently updated idle bots as online", () => {
    const presence = projectPresence(basePresence);
    expect(presence.state).toBe("online");
    expect(presence.tag).toBe("online");
  });

  it("marks stale bots as idle/away", () => {
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const presence = projectPresence({ ...basePresence, updatedAt: stale });
    expect(presence.state).toBe("idle");
    expect(presence.tag).toBe("away");
  });

  it("handles unparseable timestamps as idle", () => {
    const presence = projectPresence({ ...basePresence, updatedAt: "not-a-date" });
    expect(presence.state).toBe("idle");
  });
});

describe("ambientNudge", () => {
  it("is deterministic and interpolates the persona tag", () => {
    const config = normalizePersona("zen");
    const first = ambientNudge(config, "Moss", "thread-1");
    expect(first).toBe(ambientNudge(config, "Moss", "thread-1"));
    expect(first).toContain("meditating on the task queue");
    expect(first).not.toContain("{tag}");
  });

  it("works for the custom persona", () => {
    const nudge = ambientNudge(normalizePersona("custom"), "Volt", "t2");
    expect(nudge).toContain("tuning the vibe");
  });
});

describe("reactions", () => {
  it("accepts known kinds and rejects others", () => {
    for (const kind of REACTION_KINDS) {
      expect(isReactionKind(kind)).toBe(true);
      expect(REACTION_EMOJI[kind].length).toBeGreaterThan(0);
    }
    expect(isReactionKind("poop")).toBe(false);
    expect(isReactionKind("")).toBe(false);
  });
});

describe("steering hints", () => {
  it("parses a leading /hint", () => {
    expect(steeringHintFromPrompt("/funny tell me about my day")).toBe("funny");
    expect(steeringHintFromPrompt("  /serious\nwhat broke?")).toBe("serious");
  });

  it("returns null for unknown or absent hints", () => {
    expect(steeringHintFromPrompt("hello there")).toBeNull();
    expect(steeringHintFromPrompt("/unknown go")).toBeNull();
    expect(steeringHintFromPrompt("tell me /funny later")).toBeNull();
  });

  it("strips only a valid steering prefix", () => {
    expect(stripSteeringPrefix("/zen breathe and summarize")).toBe("breathe and summarize");
    expect(stripSteeringPrefix("no hint here")).toBe("no hint here");
    expect(stripSteeringPrefix("/unknown keep the slash")).toBe("/unknown keep the slash");
  });
});

describe("lounge", () => {
  it("has 3+ topics with unique ids", () => {
    expect(LOUNGE_TOPICS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(LOUNGE_TOPICS.map((t) => t.id)).size).toBe(LOUNGE_TOPICS.length);
  });

  it("falls back to the first topic for unknown ids", () => {
    expect(loungeTopic("nope").id).toBe(LOUNGE_TOPICS[0]!.id);
    expect(loungeTopic("take").label).toBe("Hot take court");
  });

  it("formats a group-chat transcript with emoji and names", () => {
    const text = formatLoungeTranscript([
      { name: "Ruckus", persona: normalizePersona("unhinged"), reply: "LFG." },
      { name: "Moss", persona: normalizePersona("zen"), reply: "one thing at a time." },
    ]);
    expect(text).toContain("🌀 **Ruckus** — LFG.");
    expect(text).toContain("🧘 **Moss** — one thing at a time.");
  });

  it("keeps empty replies readable", () => {
    const text = formatLoungeTranscript([
      { name: "Moss", persona: normalizePersona("zen"), reply: "   " },
    ]);
    expect(text).toContain("**Moss** — …");
  });
});
