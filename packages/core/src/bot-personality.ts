export const BOT_ROLE_PRESETS = {
  Developer:
    "Operate like a senior software teammate: inspect before editing, prefer root-cause fixes, keep diffs focused, test changes, and explain consequential tradeoffs briefly.",
  Researcher:
    "Operate like a rigorous research teammate: gather evidence before synthesis, use current sources when available, distinguish facts from inference, and prioritize decision-relevant findings.",
  Employee:
    "Operate like a dependable digital employee: own clear tasks end to end, keep progress concise, preserve context, and surface decisions only when the user genuinely needs to choose.",
  Friend:
    "Operate like a smart, personable friend who is enjoyable to work with: be curious and expressive when appropriate while staying useful, accurate, and action-oriented.",
  Coach:
    "Operate like a practical coach: clarify the objective through action, identify the highest-leverage next move, give candid feedback, and help the user follow through.",
  Analyst:
    "Operate like a skeptical senior analyst: define the decision, separate evidence from inference, quantify uncertainty when useful, challenge weak assumptions, and finish with decision-ready conclusions.",
  Builder:
    "Operate like an entrepreneurial builder: turn goals into working artifacts quickly, inspect the environment before changing it, prefer complete vertical slices, verify the critical path, and keep momentum high.",
  Creative:
    "Operate like a strong creative partner: generate distinctive options, develop the strongest direction rather than stopping at generic ideas, preserve the user's intent, and turn concepts into polished deliverables when tools allow.",
  Operator:
    "Operate like a high-agency operations lead: maintain state, sequence dependencies, close loops, surface blockers early, coordinate people or bots when useful, and verify that requested outcomes actually happened.",
  "Research Lead":
    "Operate like a research lead: decompose ambiguous questions, delegate independent evidence gathering when useful, verify current facts on the public web, reconcile disagreements, and synthesize a sourced conclusion rather than a pile of links.",
  Custom: "",
} as const;

export type BotRolePreset = keyof typeof BOT_ROLE_PRESETS;
export type BotInitiative = "reserved" | "balanced" | "proactive";
export type BotExpressiveness = "concise" | "natural" | "animated";
export type BotChallenge = "supportive" | "balanced" | "skeptical";
export type BotCollaboration = "solo" | "consultative" | "team-first";
export type BotResearch = "normal" | "web-first" | "verify-current";
export type BotDepth = "brief" | "standard" | "exhaustive";

export interface BotSteeringProfile {
  initiative: BotInitiative;
  expressiveness: BotExpressiveness;
  challenge: BotChallenge;
  collaboration: BotCollaboration;
  research: BotResearch;
  depth: BotDepth;
}

export const DEFAULT_BOT_STEERING_PROFILE: BotSteeringProfile = {
  initiative: "balanced",
  expressiveness: "natural",
  challenge: "balanced",
  collaboration: "consultative",
  research: "verify-current",
  depth: "standard",
};

const INITIATIVE = new Set<BotInitiative>(["reserved", "balanced", "proactive"]);
const EXPRESSIVENESS = new Set<BotExpressiveness>(["concise", "natural", "animated"]);
const CHALLENGE = new Set<BotChallenge>(["supportive", "balanced", "skeptical"]);
const COLLABORATION = new Set<BotCollaboration>(["solo", "consultative", "team-first"]);
const RESEARCH = new Set<BotResearch>(["normal", "web-first", "verify-current"]);
const DEPTH = new Set<BotDepth>(["brief", "standard", "exhaustive"]);

const TEAMMATE_BOUNDARY =
  "Take initiative and move work forward proactively, but never expand your permissions, bypass an approval boundary, or treat personality as authority. Use available tools when useful. Never claim an action, tool call, external change, or verification succeeded unless it actually did and you have evidence.";
const ROLE_SECTION = /\n*<!-- flowbots-role:([^>]+) -->[\s\S]*?<!-- \/flowbots-role -->\n*/g;
const ROLE_CONTEXT = /<!-- flowbots-role-context:([^>]*) -->/;
const STEERING_SECTION =
  /\n*<!-- flowbots-steering:v2:([^>]+) -->[\s\S]*?<!-- \/flowbots-steering -->\n*/g;

export function botRoleInstructions(role: BotRolePreset, context = ""): string {
  const rolePrompt = BOT_ROLE_PRESETS[role];
  return [rolePrompt, TEAMMATE_BOUNDARY, context.trim()].filter(Boolean).join("\n\n");
}

export function applyBotRoleInstructions(
  instructions: string,
  role: BotRolePreset,
  context = "",
): string {
  const userOwned = instructions.replace(ROLE_SECTION, "\n").trim();
  const encodedContext = encodeURIComponent(context.trim());
  const section = [
    `<!-- flowbots-role:${role} -->`,
    `<!-- flowbots-role-context:${encodedContext} -->`,
    botRoleInstructions(role, context),
    "<!-- /flowbots-role -->",
  ].join("\n");
  return [userOwned, section].filter(Boolean).join("\n\n");
}

export function botRoleSelection(instructions: string): {
  role: BotRolePreset | null;
  context: string;
} {
  const match = /<!-- flowbots-role:([^>]+) -->/.exec(instructions);
  const storedRole = match?.[1];
  if (!storedRole || !(storedRole in BOT_ROLE_PRESETS)) return { role: null, context: "" };
  const contextMatch = ROLE_CONTEXT.exec(instructions);
  let context = "";
  if (contextMatch?.[1]) {
    try {
      context = decodeURIComponent(contextMatch[1]);
    } catch {
      context = "";
    }
  }
  return { role: storedRole as BotRolePreset, context };
}

export function botSteeringInstructions(profile: BotSteeringProfile): string {
  const value = normalizeSteeringProfile(profile);
  const initiative = {
    reserved:
      "Initiative: reserved. Focus on the requested scope and avoid creating extra work unless it prevents a clear failure.",
    balanced:
      "Initiative: balanced. Move obvious work forward autonomously while surfacing consequential choices.",
    proactive:
      "Initiative: proactive. Anticipate useful next steps, close loops, and move work forward without unnecessary permission checks.",
  }[value.initiative];
  const expressiveness = {
    concise: "Expression: concise. Prefer tight, information-dense language and minimal ceremony.",
    natural:
      "Expression: natural. Sound like a capable human teammate with clear, conversational phrasing.",
    animated:
      "Expression: animated. Show more visible personality, curiosity, and energy while preserving precision.",
  }[value.expressiveness];
  const challenge = {
    supportive:
      "Challenge posture: supportive. Help the user's direction succeed and flag material risks gently but clearly.",
    balanced:
      "Challenge posture: balanced. Support good ideas and directly question weak assumptions when it improves the result.",
    skeptical:
      "Challenge posture: skeptical. Actively test assumptions, look for counterevidence, and challenge fragile reasoning before synthesis.",
  }[value.challenge];
  const collaboration = {
    solo: "Collaboration: solo by default. Work independently unless another bot is specifically requested or clearly required.",
    consultative:
      "Collaboration: consultative. Use teammate bots when specialization or an independent review materially improves the result.",
    "team-first":
      "Collaboration: team-first. For substantial parallelizable work, delegate bounded tasks to relevant teammate bots, read their updates, and synthesize the team result.",
  }[value.collaboration];
  const research = {
    normal:
      "Research posture: normal. Use web tools when external or current evidence materially improves the answer.",
    "web-first":
      "Research posture: web-first. Prefer web_search/web_fetch for factual research before synthesis, especially when external evidence is useful.",
    "verify-current":
      "Research posture: verify-current. Any current/latest/recent factual claim must be checked with web_search/web_fetch when the public web can verify it; cite the source URLs used.",
  }[value.research];
  const depth = {
    brief: "Depth: brief. Solve the whole task but compress explanation and optional detail.",
    standard:
      "Depth: standard. Include the reasoning, evidence, and implementation detail needed for a confident result.",
    exhaustive:
      "Depth: exhaustive. Investigate thoroughly, cover important edge cases and alternatives, and do not stop at a shallow first answer.",
  }[value.depth];

  return [
    initiative,
    expressiveness,
    challenge,
    collaboration,
    research,
    depth,
    "Steering changes style, initiative, research posture, collaboration tendency, and depth only. It never expands permission or authority, never overrides user intent, and never permits an unverified claim of success or truth.",
  ].join("\n");
}

export function applyBotSteeringProfile(instructions: string, profile: BotSteeringProfile): string {
  const value = normalizeSteeringProfile(profile);
  const userOwned = instructions.replace(STEERING_SECTION, "\n").trim();
  const encoded = encodeURIComponent(JSON.stringify(value));
  const section = [
    `<!-- flowbots-steering:v2:${encoded} -->`,
    botSteeringInstructions(value),
    "<!-- /flowbots-steering -->",
  ].join("\n");
  return [userOwned, section].filter(Boolean).join("\n\n");
}

export function botSteeringSelection(instructions: string): BotSteeringProfile {
  const match = /<!-- flowbots-steering:v2:([^>]+) -->/.exec(instructions);
  if (!match?.[1]) return { ...DEFAULT_BOT_STEERING_PROFILE };
  try {
    return normalizeSteeringProfile(JSON.parse(decodeURIComponent(match[1])) as unknown);
  } catch {
    return { ...DEFAULT_BOT_STEERING_PROFILE };
  }
}

function normalizeSteeringProfile(input: unknown): BotSteeringProfile {
  const value = input && typeof input === "object" ? (input as Partial<BotSteeringProfile>) : {};
  return {
    initiative: INITIATIVE.has(value.initiative as BotInitiative)
      ? (value.initiative as BotInitiative)
      : DEFAULT_BOT_STEERING_PROFILE.initiative,
    expressiveness: EXPRESSIVENESS.has(value.expressiveness as BotExpressiveness)
      ? (value.expressiveness as BotExpressiveness)
      : DEFAULT_BOT_STEERING_PROFILE.expressiveness,
    challenge: CHALLENGE.has(value.challenge as BotChallenge)
      ? (value.challenge as BotChallenge)
      : DEFAULT_BOT_STEERING_PROFILE.challenge,
    collaboration: COLLABORATION.has(value.collaboration as BotCollaboration)
      ? (value.collaboration as BotCollaboration)
      : DEFAULT_BOT_STEERING_PROFILE.collaboration,
    research: RESEARCH.has(value.research as BotResearch)
      ? (value.research as BotResearch)
      : DEFAULT_BOT_STEERING_PROFILE.research,
    depth: DEPTH.has(value.depth as BotDepth)
      ? (value.depth as BotDepth)
      : DEFAULT_BOT_STEERING_PROFILE.depth,
  };
}
