export type ResearchRoute = "default" | "research" | "orchestration";

export type RouteCredential = {
  id: string;
  provider: string;
  defaultModel: string | null;
  isDefault: boolean;
};

const ORCHESTRATION_PATTERNS = [
  /\bg0dm0d3\b/i,
  /\bgodmod3\b/i,
  /\bultraplinian\b/i,
  /\bconsortium\b/i,
  /\bmulti[- ]model (?:research|analysis|orchestration|synthesis)\b/i,
  /\bhive mind\b/i,
];

const RESEARCH_PATTERNS = [
  /\bcyber\s*security\b/i,
  /\bsecurity research\b/i,
  /\bred[- ]team(?:ing)?\b/i,
  /\bpenetration test(?:ing)?\b/i,
  /\bpentest(?:ing)?\b/i,
  /\bctf\b/i,
  /\bcapture the flag\b/i,
  /\bvulnerabilit(?:y|ies)\b/i,
  /\bmalware analysis\b/i,
  /\breverse engineering\b/i,
  /\bthreat model(?:ing)?\b/i,
  /\bincident response\b/i,
  /\bdigital forensics?\b/i,
  /\bhigh[- ]control (?:research )?mode\b/i,
  /\buncensored (?:model|mode)\b/i,
];

const TOOL_FIRST_RESEARCH_PRIORITY = ["venice", "g0dm0d3"] as const;
const ORCHESTRATION_PRIORITY = ["g0dm0d3", "venice"] as const;

export function classifyResearchRoute(prompt: string): ResearchRoute {
  if (ORCHESTRATION_PATTERNS.some((pattern) => pattern.test(prompt))) return "orchestration";
  return RESEARCH_PATTERNS.some((pattern) => pattern.test(prompt)) ? "research" : "default";
}

export function orderedResearchCredentials<T extends RouteCredential>(
  prompt: string,
  credentials: readonly T[],
): T[] {
  const fallback = credentials.find((credential) => credential.isDefault) ?? credentials[0];
  if (!fallback) return [];

  const route = classifyResearchRoute(prompt);
  if (route === "default") return [fallback];
  const priority = route === "orchestration" ? ORCHESTRATION_PRIORITY : TOOL_FIRST_RESEARCH_PRIORITY;

  const ordered: T[] = [];
  for (const provider of priority) {
    const credential = credentials.find((candidate) => candidate.provider === provider);
    if (credential) ordered.push(credential);
  }
  if (!ordered.some((credential) => credential.id === fallback.id)) ordered.push(fallback);
  return ordered;
}
