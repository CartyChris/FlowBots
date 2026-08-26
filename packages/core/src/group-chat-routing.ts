export interface GroupRoutingMember {
  botId: string;
  name: string;
  title: string;
  description: string;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "being",
  "could",
  "from",
  "have",
  "into",
  "latest",
  "please",
  "should",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "with",
  "would",
  "your",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5) return a.slice(0, 5) === b.slice(0, 5);
  return false;
}

export function extractGroupMentions(
  prompt: string,
  members: readonly GroupRoutingMember[],
): string[] {
  const lower = prompt.toLowerCase();
  return members
    .filter((member) => {
      const escaped = member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\s)@${escaped}(?=\\s|[,.!?;:]|$)`, "i").test(lower);
    })
    .map((member) => member.botId);
}

function wholeTeamRequested(prompt: string): boolean {
  return /(^|\s)@(all|team)(?=\s|[,.!?;:]|$)|\b(everyone|all of you|whole team|entire team)\b/i.test(
    prompt,
  );
}

export function resolveGroupResponders(
  prompt: string,
  members: readonly GroupRoutingMember[],
): string[] {
  const explicit = extractGroupMentions(prompt, members);
  if (explicit.length > 0) return explicit.slice(0, 4);
  if (wholeTeamRequested(prompt)) return members.slice(0, 4).map((member) => member.botId);

  const promptTokens = tokens(prompt);
  const scored = members
    .map((member, index) => {
      const profileTokens = tokens(`${member.name} ${member.title} ${member.description}`);
      let score = 0;
      for (const wanted of promptTokens) {
        for (const candidate of profileTokens) {
          if (tokenMatches(wanted, candidate)) {
            score += wanted.length >= 7 ? 3 : 2;
            break;
          }
        }
      }
      return { member, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((entry) => entry.member.botId);

  if (scored.length > 0) return scored;
  return members.slice(0, 2).map((member) => member.botId);
}
