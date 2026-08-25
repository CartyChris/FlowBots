export const MAX_TEAM_ASSIGNMENTS = 4;

export interface TeamAssignmentInput {
  bot_id?: unknown;
  botId?: unknown;
  name?: unknown;
  task?: unknown;
}

export interface TeamAssignment {
  botId?: string;
  name?: string;
  task: string;
}

export function normalizeTeamAssignments(input: unknown): TeamAssignment[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("delegate_team requires at least one assignment");
  }
  if (input.length > MAX_TEAM_ASSIGNMENTS) {
    throw new Error(`delegate_team accepts a maximum of ${MAX_TEAM_ASSIGNMENTS} assignments`);
  }

  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`assignment ${index + 1} is invalid`);
    const value = raw as TeamAssignmentInput;
    const botId = cleanOptional(value.bot_id ?? value.botId);
    const name = cleanOptional(value.name);
    const task = cleanOptional(value.task);
    if (!botId && !name) throw new Error(`assignment ${index + 1} requires bot_id or name`);
    if (!task) throw new Error(`assignment ${index + 1} requires a task`);
    const key = botId ? `id:${botId}` : `name:${name!.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`duplicate team target in assignment ${index + 1}`);
    seen.add(key);
    return { botId, name, task };
  });
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}
