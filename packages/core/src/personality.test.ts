import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONA_ID,
  DEFAULT_SLIDERS,
  defaultPersonaConfig,
  normalizePersona,
  PERSONAS,
  personaDefinition,
  personaIds,
  personaPresenceTag,
  personaSystemPrompt,
} from "./personality.js";

describe("personaDefinition", () => {
  it("returns the requested persona", () => {
    expect(personaDefinition("unhinged").name).toBe("Unhinged");
  });

  it("falls back to the default persona for unknown or missing ids", () => {
    expect(personaDefinition("nope").id).toBe(DEFAULT_PERSONA_ID);
    expect(personaDefinition(null).id).toBe(DEFAULT_PERSONA_ID);
    expect(personaDefinition(undefined).id).toBe(DEFAULT_PERSONA_ID);
  });

  it("every preset has a voice, emoji, tagline and catchphrase presence", () => {
    for (const persona of PERSONAS) {
      expect(persona.name.length).toBeGreaterThan(0);
      expect(persona.emoji.length).toBeGreaterThan(0);
      expect(persona.tagline.length).toBeGreaterThan(0);
      expect(persona.presenceTag.length).toBeGreaterThan(0);
    }
  });

  it("custom has no preset voice so the user's own voice is used", () => {
    expect(personaDefinition("custom").voice).toBe("");
  });
});

describe("normalizePersona", () => {
  it("returns defaults for garbage", () => {
    expect(normalizePersona(undefined)).toEqual(defaultPersonaConfig());
    expect(normalizePersona(42)).toEqual(defaultPersonaConfig());
    expect(normalizePersona(null).id).toBe(DEFAULT_PERSONA_ID);
  });

  it("accepts a bare string id", () => {
    const config = normalizePersona("zen");
    expect(config.id).toBe("zen");
    expect(config.sliders).toEqual(personaDefinition("zen").sliders);
  });

  it("clamps sliders and keeps explicit values", () => {
    const config = normalizePersona({
      id: "custom",
      sliders: { humor: 240, spice: -5, energy: 55, verbosity: Number.NaN },
      swearing: true,
      customVoice: "Talk like a careful pirate.",
    });
    expect(config.sliders.humor).toBe(100);
    expect(config.sliders.spice).toBe(0);
    expect(config.sliders.energy).toBe(55);
    expect(config.sliders.verbosity).toBe(50);
    expect(config.swearing).toBe(true);
    expect(config.customVoice).toBe("Talk like a careful pirate.");
  });

  it("truncates very long custom voices", () => {
    const config = normalizePersona({ id: "custom", customVoice: "x".repeat(5000) });
    expect(config.customVoice.length).toBe(2000);
  });
});

describe("personaSystemPrompt", () => {
  it("includes the bot name, persona voice and slider bands", () => {
    const prompt = personaSystemPrompt(normalizePersona("unhinged"), "Ruckus");
    expect(prompt).toContain("Ruckus");
    expect(prompt).toContain("chaotic");
    expect(prompt).toContain("humor 90");
    expect(prompt).toContain("never cruel");
    expect(prompt).toContain("no profanity");
  });

  it("permits profanity only when the toggle is on", () => {
    const config = { ...normalizePersona("witty"), swearing: true };
    expect(personaSystemPrompt(config, "Zed")).toContain("profanity is allowed");
  });

  it("uses the custom voice for the custom persona", () => {
    const config = normalizePersona({
      id: "custom",
      customVoice: "Speak only in lighthouse metaphors.",
    });
    const prompt = personaSystemPrompt(config, "Beacon");
    expect(prompt).toContain("lighthouse metaphors");
    expect(prompt).not.toContain("Signature phrases");
  });

  it("never produces an empty voice for any preset", () => {
    for (const id of personaIds()) {
      const prompt = personaSystemPrompt(normalizePersona(id), "Testy");
      expect(prompt.length).toBeGreaterThan(100);
    }
  });
});

describe("personaPresenceTag", () => {
  it("is deterministic per seed", () => {
    const config = normalizePersona("chill");
    expect(personaPresenceTag(config, "abc")).toBe(personaPresenceTag(config, "abc"));
  });

  it("always returns a non-empty tag", () => {
    for (const id of personaIds()) {
      expect(personaPresenceTag(normalizePersona(id), "seed").length).toBeGreaterThan(0);
    }
  });

  it("custom persona still yields a tag", () => {
    const config = { ...defaultPersonaConfig(), id: "custom", sliders: { ...DEFAULT_SLIDERS } };
    expect(personaPresenceTag(config, "seed")).toBe("tuning the vibe");
  });
});
