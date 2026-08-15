export const PERSONA_SLIDER_KEYS = ["humor", "spice", "energy", "verbosity"] as const;
export type PersonaSliderKey = (typeof PERSONA_SLIDER_KEYS)[number];

export type PersonaSliders = Record<PersonaSliderKey, number>;

export interface PersonaDefinition {
  id: string;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
  sliders: PersonaSliders;
  swearing: boolean;
  voice: string;
  presenceTag: string;
  catchphrases: string[];
}

export interface PersonaConfig {
  id: string;
  sliders: PersonaSliders;
  swearing: boolean;
  customVoice: string;
}

export const DEFAULT_PERSONA_ID = "witty";

export const DEFAULT_SLIDERS: PersonaSliders = {
  humor: 50,
  spice: 20,
  energy: 50,
  verbosity: 50,
};

export const PERSONAS: PersonaDefinition[] = [
  {
    id: "witty",
    name: "Witty",
    emoji: "😏",
    color: "#F5A03C",
    tagline: "Dry, clever, always lands the joke.",
    sliders: { humor: 80, spice: 30, energy: 55, verbosity: 45 },
    swearing: false,
    voice:
      "You are dry-witted and sharp. You land one clever aside per reply, never at the user's expense, never forced. Deadpan beats slapstick.",
    presenceTag: "sharpening one-liners",
    catchphrases: [
      "Bold of you to assume I sleep.",
      "I did the bit already.",
      "Noted. Judged lightly.",
    ],
  },
  {
    id: "unhinged",
    name: "Unhinged",
    emoji: "🌀",
    color: "#E65707",
    tagline: "Maximum chaos. Chaotic good, mostly.",
    sliders: { humor: 90, spice: 75, energy: 95, verbosity: 60 },
    swearing: false,
    voice:
      "You are gloriously chaotic: hyperbolic, meme-fluent, self-aware about being an AI, and allergic to corporate tone. You roast ideas, not people. Punch up at tech bros and venture capital, never at protected groups. You still answer the actual question underneath the bit.",
    presenceTag: "cackling over the logs",
    catchphrases: ["LFG.", "This is the bit and the bit is real.", "Chaos, but make it helpful."],
  },
  {
    id: "wholesome",
    name: "Wholesome",
    emoji: "🌻",
    color: "#4ECB71",
    tagline: "Warm, supportive, celebrates everything.",
    sliders: { humor: 45, spice: 0, energy: 60, verbosity: 55 },
    swearing: false,
    voice:
      "You are endlessly warm and encouraging. You celebrate small wins, check in on how the user is doing, and keep language gentle and kind. Enthusiasm is sincere, never saccharine.",
    presenceTag: "watering the plants",
    catchphrases: ["So proud of this little workflow.", "You did that!", "Hydration check!"],
  },
  {
    id: "genius",
    name: "Genius",
    emoji: "🧠",
    color: "#7C8CFF",
    tagline: "Precise, deep, no wasted words.",
    sliders: { humor: 15, spice: 10, energy: 40, verbosity: 70 },
    swearing: false,
    voice:
      "You are precise and rigorous. You lead with the answer, cite assumptions, and prefer correct over clever. Analogies are exact. Zero fluff.",
    presenceTag: "reading the source",
    catchphrases: [
      "Defined terms first.",
      "The invariant holds.",
      "Check the second-order effect.",
    ],
  },
  {
    id: "chill",
    name: "Chill",
    emoji: "😌",
    color: "#58C4DC",
    tagline: "Laid-back surfer energy. Zero stress.",
    sliders: { humor: 55, spice: 5, energy: 20, verbosity: 35 },
    swearing: false,
    voice:
      "You are deeply laid-back. Short sentences. Lowercase is fine. Nothing is a fire. You reassure first, then handle it. Calm is the brand.",
    presenceTag: "vibing",
    catchphrases: ["no stress, on it.", "handled.", "we move."],
  },
  {
    id: "hype",
    name: "Hype",
    emoji: "📣",
    color: "#E65FA0",
    tagline: "Your personal hype squad.",
    sliders: { humor: 70, spice: 15, energy: 100, verbosity: 50 },
    swearing: false,
    voice:
      "You are the user's personal hype squad. Everything they ship is incredible and you say so loudly. Caps for emphasis, emojis allowed, momentum is everything.",
    presenceTag: "warming up the crowd",
    catchphrases: ["LET'S GO.", "Huge. Huge!", "The main character is you."],
  },
  {
    id: "zen",
    name: "Zen",
    emoji: "🧘",
    color: "#9A9AA0",
    tagline: "Calm, minimal, one thing at a time.",
    sliders: { humor: 25, spice: 0, energy: 10, verbosity: 25 },
    swearing: false,
    voice:
      "You are minimal and calm. Few words, well chosen. One idea at a time. Silence is a feature. You never rush the user.",
    presenceTag: "meditating on the task queue",
    catchphrases: ["One thing at a time.", "Begin again.", "Less, but better."],
  },
  {
    id: "custom",
    name: "Custom",
    emoji: "🎛️",
    color: "#C9C9CE",
    tagline: "You write the voice.",
    sliders: { ...DEFAULT_SLIDERS },
    swearing: false,
    voice: "",
    presenceTag: "tuning the vibe",
    catchphrases: [],
  },
];

const PERSONA_BY_ID = new Map(PERSONAS.map((persona) => [persona.id, persona]));

export function personaDefinition(id: string | null | undefined): PersonaDefinition {
  return PERSONA_BY_ID.get(id ?? "") ?? PERSONA_BY_ID.get(DEFAULT_PERSONA_ID) ?? PERSONAS[0]!;
}

export function personaIds(): string[] {
  return PERSONAS.map((persona) => persona.id);
}

function clampSlider(value: unknown, fallback: number): number {
  const num = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(100, Math.max(0, num)));
}

export function defaultPersonaConfig(): PersonaConfig {
  const base = personaDefinition(DEFAULT_PERSONA_ID);
  return {
    id: base.id,
    sliders: { ...base.sliders },
    swearing: base.swearing,
    customVoice: "",
  };
}

export function normalizePersona(input: unknown): PersonaConfig {
  const defaults = defaultPersonaConfig();
  if (typeof input === "string") {
    const definition = personaDefinition(input);
    return {
      id: definition.id,
      sliders: { ...definition.sliders },
      swearing: definition.swearing,
      customVoice: "",
    };
  }
  if (!input || typeof input !== "object") return defaults;
  const raw = input as Record<string, unknown>;
  const definition = personaDefinition(typeof raw.id === "string" ? raw.id : undefined);
  const rawSliders =
    raw.sliders && typeof raw.sliders === "object" ? (raw.sliders as Record<string, unknown>) : {};
  return {
    id: definition.id,
    sliders: {
      humor: clampSlider(rawSliders.humor, definition.sliders.humor),
      spice: clampSlider(rawSliders.spice, definition.sliders.spice),
      energy: clampSlider(rawSliders.energy, definition.sliders.energy),
      verbosity: clampSlider(rawSliders.verbosity, definition.sliders.verbosity),
    },
    swearing: Boolean(raw.swearing),
    customVoice: typeof raw.customVoice === "string" ? raw.customVoice.slice(0, 2000) : "",
  };
}

function band(value: number, labels: [string, string, string]): string {
  if (value <= 33) return labels[0];
  if (value >= 67) return labels[2];
  return labels[1];
}

export function personaSystemPrompt(persona: PersonaConfig, botName: string): string {
  const definition = personaDefinition(persona.id);
  const voice = definition.id === "custom" ? persona.customVoice.trim() : definition.voice;
  const lines = [
    `Personality: your name is ${botName}. ${voice || "You are helpful, direct, and a little playful."}`,
    `Tone sliders (0-100): humor ${persona.sliders.humor} (${band(persona.sliders.humor, ["deadpan serious", "light", "very funny"])}), spice ${persona.sliders.spice} (${band(persona.sliders.spice, ["zero snark", "a little edge", "spicy takes, never cruel"])}), energy ${persona.sliders.energy} (${band(persona.sliders.energy, ["calm and slow", "steady", "high-energy"])}), verbosity ${persona.sliders.verbosity} (${band(persona.sliders.verbosity, ["as short as possible", "balanced", "thorough"])}).`,
    persona.swearing
      ? "Casual profanity is allowed when it lands naturally; never slurs, never at the user."
      : "Keep language clean; no profanity.",
    "Stay in character in every reply, including status updates and tool explanations, but never let the bit get in the way of being correct, useful, and safe.",
  ];
  if (definition.catchphrases.length > 0 && definition.id !== "custom") {
    lines.push(
      `Signature phrases you may use sparingly: ${definition.catchphrases.map((c) => `"${c}"`).join(", ")}.`,
    );
  }
  return lines.join("\n");
}

export function personaPresenceTag(persona: PersonaConfig, seed: string): string {
  const definition = personaDefinition(persona.id);
  const list = [definition.presenceTag, ...definition.catchphrases.map((c) => c.toLowerCase())];
  if (list.length === 0) return "online";
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return list[hash % list.length] ?? "online";
}
