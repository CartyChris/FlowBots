export type ResearchRoute = "default" | "research";

export type RouteCredential = {
  id: string;
  provider: string;
  defaultModel: string | null;
  isDefault: boolean;
};

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

const RESEARCH_PROVIDER_PRIORITY = ["g0dm0d3", "venice"] as const;

export function classifyResearchRoute(prompt: string): ResearchRoute {
  return RESEARCH_PATTERNS.some((pattern) => pattern.test(prompt)) ? "research" : "default";
}

export function orderedResearchCredentials<T extends RouteCredential>(
  prompt: string,
  credentials: readonly T[],
): T[] {
  const fallback = credentials.find((credential) => credential.isDefault) ?? credentials[0];
  if (!fallback) return [];
  if (classifyResearchRoute(prompt) === "default") return [fallback];

  const ordered: T[] = [];
  for (const provider of RESEARCH_PROVIDER_PRIORITY) {
    const credential = credentials.find((candidate) => candidate.provider === provider);
    if (credential) ordered.push(credential);
  }
  if (!ordered.some((credential) => credential.id === fallback.id)) ordered.push(fallback);
  return ordered;
}
