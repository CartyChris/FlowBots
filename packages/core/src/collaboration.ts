export interface ContextPacket {
  version: 1;
  objective: string;
  summary: string;
  constraints: string[];
  artifactIds: string[];
  requestedOutput: string;
}

/** Compact data, never authority or a copy of a private conversation. */
export function createContextPacket(input: Record<string, unknown>): ContextPacket {
  const packet: ContextPacket = {
    version: 1,
    objective: boundedText(input.objective, 3000, "objective", true),
    summary: boundedText(input.summary, 4000, "summary"),
    constraints: boundedList(input.constraints, 6, 200, "constraints"),
    artifactIds: [...new Set(boundedList(input.artifactIds, 8, 128, "artifactIds"))],
    requestedOutput: boundedText(input.requestedOutput, 1000, "requestedOutput"),
  };
  if (JSON.stringify(packet).length > 10_000)
    throw new Error("Context packet exceeds 10000 characters");
  return packet;
}

export const MAX_COLLABORATION_DEPTH = 2;
export const MAX_COLLABORATION_CHILDREN = 4;
export const MAX_COLLABORATION_TASKS = 12;

export function assertCollaborationAllowed(input: {
  ancestorBotIds: string[];
  targetBotIds: string[];
  existingChildren: number;
}) {
  if (input.ancestorBotIds.length > MAX_COLLABORATION_DEPTH)
    throw new Error(`Delegation depth limit reached (${MAX_COLLABORATION_DEPTH})`);
  if (!input.targetBotIds.length) throw new Error("At least one teammate is required");
  if (new Set(input.targetBotIds).size !== input.targetBotIds.length)
    throw new Error("Duplicate teammate assignments are not allowed");
  if (input.targetBotIds.some((id) => input.ancestorBotIds.includes(id)))
    throw new Error("Delegation cycle blocked: a teammate already owns an ancestor task");
  if (input.existingChildren + input.targetBotIds.length > MAX_COLLABORATION_CHILDREN)
    throw new Error(
      `Delegation budget exhausted (${MAX_COLLABORATION_CHILDREN} child tasks per task)`,
    );
}

function boundedText(value: unknown, max: number, name: string, required = false): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  const text = value.trim();
  if (required && !text) throw new Error(`${name} is required`);
  if (text.length > max) throw new Error(`${name} exceeds ${max} characters`);
  return text;
}

function boundedList(value: unknown, max: number, itemMax: number, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${name} must contain at most ${max} entries`);
  return value.map((item) => boundedText(item, itemMax, name, true));
}
