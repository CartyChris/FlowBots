import { classifyFreshnessNeed } from "./freshness.js";

export type ResearchVerificationLevel =
  | "none"
  | "standard-current"
  | "volatile-entity"
  | "deep-research";

const DEEP_RESEARCH_PATTERNS = [
  /\bdeep[- ]research\b/i,
  /\bdeep dive\b/i,
  /\bfact[- ]?check\b/i,
  /\bcross[- ]?check\b/i,
  /\bcorroborat(?:e|ion|ing)\b/i,
  /\bdue diligence\b/i,
  /\binvestigat(?:e|ion|ing)\b/i,
];

const VOLATILE_ENTITY_PATTERNS = [
  /\b(senator|representative|congress(?:man|woman|member)?|president|vice president|governor|mayor)\b/i,
  /\b(candidate|campaign|election|reelection|re-election|primary|runoff|ballot|nominee)\b/i,
  /\b(serving|appointed|resigned|resignation|removed|succeeded|successor|succession|vacancy)\b/i,
  /\b(died|dead|death|obituary|funeral|late\s+[A-Z])\b/i,
];

export function classifyResearchVerificationNeed(prompt: string): ResearchVerificationLevel {
  const value = prompt.trim();
  if (!value) return "none";
  if (DEEP_RESEARCH_PATTERNS.some((pattern) => pattern.test(value))) return "deep-research";
  if (VOLATILE_ENTITY_PATTERNS.some((pattern) => pattern.test(value))) return "volatile-entity";
  return classifyFreshnessNeed(value) ? "standard-current" : "none";
}

export function researchVerificationInstruction(
  level: ResearchVerificationLevel,
  currentDate: string,
): string {
  if (level === "none") {
    return "No mandatory current-claim verification pass is required for this request, but verify externally when a factual claim may have changed.";
  }
  if (level === "standard-current") {
    return [
      `Research verification level: standard-current. Current date: ${currentDate}.`,
      "Search before synthesizing current claims, fetch the important underlying sources, and corroborate consequential claims with more than one source when practical.",
      "Prefer recent sources with explicit dates. If snippets conflict with fetched pages or newer evidence, use the newer corroborated evidence and explain the conflict.",
      "If retrieved news introduces a named-person election, office, death, resignation, appointment, or succession claim, call verify_current_claim for that material claim before including it in the synthesis, even when the user only asked for generic current news.",
    ].join(" ");
  }
  if (level === "volatile-entity") {
    return [
      `Research verification level: volatile-entity. Current date: ${currentDate}.`,
      "Named-person, public-office, election, death, succession, or live-status claims are high volatility.",
      "Before presenting such a claim as current fact, run verify_current_claim for the material named entity/claim, inspect a primary or official source when available, and corroborate with a reputable independent second source.",
      "Perform an explicit contradiction check for death, office, election, appointment, resignation, or succession context. Never promote one stale search snippet into a current claim.",
      "If credible evidence conflicts, say so, keep researching when useful, and qualify the final conclusion rather than guessing.",
    ].join(" ");
  }
  return [
    `Research verification level: deep-research. Current date: ${currentDate}.`,
    "Plan multiple query angles, gather diverse dated sources, fetch the strongest sources, and run a contradiction scan before synthesis.",
    "Use verify_current_claim for volatile named-entity claims and prefer primary/official evidence plus reputable independent corroboration.",
    "Separate established facts, disputed/uncertain claims, and inference. Do not hide source conflicts. Summarize what changed, what is verified, and what remains uncertain.",
  ].join(" ");
}

export function buildVerificationQueries(input: {
  claim: string;
  entity?: string | null;
  currentDate: string;
}): string[] {
  const claim = clean(input.claim).slice(0, 500);
  const entity = clean(input.entity ?? "").slice(0, 160);
  const date = clean(input.currentDate).slice(0, 32);
  if (!claim) throw new Error("verify_current_claim requires a claim");

  const candidates = entity
    ? [
        `${claim} ${date}`,
        `"${entity}" current status ${date}`,
        `"${entity}" death obituary succession ${date}`,
        `"${entity}" official status office election ${date}`,
      ]
    : [
        `${claim} ${date}`,
        `${claim} current status ${date}`,
        `${claim} contradiction fact check ${date}`,
      ];
  return [...new Set(candidates.map(clean).filter(Boolean))].slice(0, 5);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
