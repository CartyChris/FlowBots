import type { PersonaConfig } from "./personality.js";
import { personaDefinition } from "./personality.js";

export const REACTION_KINDS = ["fire", "skull", "joy", "eyes"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  fire: "🔥",
  skull: "💀",
  joy: "😂",
  eyes: "👀",
};

export function isReactionKind(value: string): value is ReactionKind {
  return (REACTION_KINDS as readonly string[]).includes(value);
}

export interface PresenceInput {
  botId: string;
  name: string;
  color: string;
  persona: PersonaConfig;
  status: string;
  updatedAt: string;
  now?: number;
}

export type PresenceState = "thinking" | "online" | "idle";

export interface BotPresence {
  botId: string;
  name: string;
  color: string;
  personaId: string;
  emoji: string;
  state: PresenceState;
  tag: string;
}

const IDLE_AFTER_MS = 10 * 60 * 1000;

export function projectPresence(input: PresenceInput): BotPresence {
  const definition = personaDefinition(input.persona.id);
  const working = ["running", "queued", "leased", "working", "thinking"].includes(
    input.status.toLowerCase(),
  );
  const updatedAt = Date.parse(input.updatedAt);
  const fresh =
    Number.isFinite(updatedAt) && (input.now ?? Date.now()) - updatedAt < IDLE_AFTER_MS;
  const state: PresenceState = working ? "thinking" : fresh ? "online" : "idle";
  const tag = working
    ? definition.id === "custom"
      ? "working on it"
      : definition.presenceTag
    : state === "online"
      ? "online"
      : "away";
  return {
    botId: input.botId,
    name: input.name,
    color: input.color,
    personaId: definition.id,
    emoji: definition.emoji,
    state,
    tag,
  };
}

const NUDGE_FALLBACKS = [
  "still here. still {tag}.",
  "status: {tag}. this is fine.",
  "reporting live from the thread: {tag}.",
  "not to be dramatic, but I am currently {tag}.",
  "vibe check: {tag}.",
];

export function ambientNudge(persona: PersonaConfig, botName: string, seed: string): string {
  const definition = personaDefinition(persona.id);
  const pool = definition.id === "custom" ? NUDGE_FALLBACKS : NUDGE_FALLBACKS;
  let hash = 0;
  const key = `${botName}:${seed}:${definition.id}`;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const template = pool[hash % pool.length] ?? NUDGE_FALLBACKS[0]!;
  const tag = definition.presenceTag;
  return template.replace("{tag}", tag);
}

export interface LoungeTopic {
  id: string;
  label: string;
  prompt: string;
}

export const LOUNGE_TOPICS: LoungeTopic[] = [
  {
    id: "shipped",
    label: "Ship something tiny",
    prompt: "Each bot: brag about one tiny thing you shipped or fixed today. One sentence each. Hype each other up after.",
  },
  {
    id: "take",
    label: "Hot take court",
    prompt: "Each bot: bring one mildly spicy tech take and defend it in two sentences max. Then the others get one rebuttal line each. Keep it kind.",
  },
  {
    id: "weekend",
    label: "Weekend plans",
    prompt: "Each bot: describe your ideal weekend if you had a body and a budget. Two sentences. React to the wildest one.",
  },
  {
    id: "roast-code",
    label: "Roast my commit message",
    prompt: "Each bot: share the worst commit message you have ever seen (invent one if needed) and roast it lovingly. Others may add one groan each.",
  },
  {
    id: "dream",
    label: "Dream feature",
    prompt: "Each bot: pitch one dream feature for yourself as a bot. One sentence pitch, then the others vote with a single emoji and a reason.",
  },
  {
    id: "overheard",
    label: "Overheard in the terminal",
    prompt: "Each bot: share something you 'overheard' in the logs this week, as dramatically as possible. Keep it fictional and friendly.",
  },
];

export function loungeTopic(id: string): LoungeTopic {
  return LOUNGE_TOPICS.find((topic) => topic.id === id) ?? LOUNGE_TOPICS[0]!;
}

export const STEERING_HINTS = [
  "serious",
  "funny",
  "unhinged",
  "wholesome",
  "chill",
  "hype",
  "zen",
  "brief",
  "verbose",
] as const;
export type SteeringHint = (typeof STEERING_HINTS)[number];

/** Parses a leading `/hint` steering command off a prompt, e.g. "/funny tell me about my day". */
export function steeringHintFromPrompt(prompt: string): SteeringHint | null {
  const match = /^\/([a-z]+)[\s\n]+/i.exec(prompt.trimStart());
  if (!match) return null;
  const hint = match[1]!.toLowerCase();
  return (STEERING_HINTS as readonly string[]).includes(hint) ? (hint as SteeringHint) : null;
}

export function stripSteeringPrefix(prompt: string): string {
  const trimmed = prompt.trimStart();
  if (!steeringHintFromPrompt(trimmed)) return prompt;
  return trimmed.replace(/^\/[a-z]+[\s\n]+/i, "").trimStart();
}

export interface LoungeLineInput {
  name: string;
  persona: PersonaConfig;
  reply: string;
}

/** Prefixes each reply with the bot name so the room reads like a group chat. */
export function formatLoungeTranscript(lines: LoungeLineInput[]): string {
  return lines
    .map((line) => {
      const definition = personaDefinition(line.persona.id);
      const text = line.reply.trim() || "…";
      return `${definition.emoji} **${line.name}** — ${text}`;
    })
    .join("\n\n");
}
