export function mergeModelCatalog(input: {
  defaults?: string[];
  synced?: string[];
  custom?: string[];
}): string[] {
  return [...new Set([...(input.defaults ?? []), ...(input.synced ?? []), ...(input.custom ?? [])])]
    .map((id) => id.trim())
    .filter(Boolean);
}

export interface FeatureEvidence {
  runtimeErrors?: number;
  regressions?: number;
  highSeverityFlags?: number;
  score?: number;
  requiredScore?: number;
}

export function judgeFeatureEvidence(input: FeatureEvidence): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const runtimeErrors = Math.max(0, input.runtimeErrors ?? 0);
  const regressions = Math.max(0, input.regressions ?? 0);
  const high = Math.max(0, input.highSeverityFlags ?? 0);
  const score = Number.isFinite(input.score) ? (input.score ?? 0) : 0;
  const required = input.requiredScore ?? 80;

  if (runtimeErrors) reasons.push(`${runtimeErrors} runtime error(s)`);
  if (regressions) reasons.push(`${regressions} regression(s)`);
  if (high) reasons.push(`${high} high-severity flag(s)`);
  if (score < required) reasons.push(`score ${score} below required ${required}`);
  return { passed: reasons.length === 0, reasons };
}

export function canPromoteCandidate(input: {
  checksPassed: boolean;
  highSeverityFlags?: number;
  humanRequired?: boolean;
  humanApproved?: boolean;
}): boolean {
  if (!input.checksPassed) return false;
  if ((input.highSeverityFlags ?? 0) > 0) return false;
  if (input.humanRequired && !input.humanApproved) return false;
  return true;
}

export function costPerCompletedTask(
  runs: Array<{ cost: number; completed: boolean }>,
): number | null {
  const completed = runs.filter((run) => run.completed).length;
  if (!completed) return null;
  const total = runs.reduce((sum, run) => sum + Math.max(0, Number(run.cost) || 0), 0);
  return total / completed;
}

export interface RunBudgetInput {
  spent: number;
  estimatedNextCost: number;
  calls: number;
  rounds: number;
  subagents: number;
  maxSpend?: number;
  maxCalls?: number;
  maxRounds?: number;
  maxSubagents?: number;
}

export function checkRunBudget(input: RunBudgetInput): { allowed: boolean; reason?: string } {
  if (input.maxSpend !== undefined && input.spent + input.estimatedNextCost > input.maxSpend) {
    return { allowed: false, reason: "run spend limit would be exceeded" };
  }
  if (input.maxCalls !== undefined && input.calls >= input.maxCalls) {
    return { allowed: false, reason: "model call limit reached" };
  }
  if (input.maxRounds !== undefined && input.rounds >= input.maxRounds) {
    return { allowed: false, reason: "round limit reached" };
  }
  if (input.maxSubagents !== undefined && input.subagents >= input.maxSubagents) {
    return { allowed: false, reason: "subagent limit reached" };
  }
  return { allowed: true };
}

export interface RunSpan {
  id: string;
  name: string;
  kind: string;
  parentId?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  error?: string;
  cost: number;
  children: RunSpan[];
}

export function createRunTrace() {
  let seq = 0;
  const spans = new Map<string, RunSpan>();
  const order: string[] = [];

  return {
    start(input: { name: string; kind: string; parentId?: string }): string {
      if (input.parentId && !spans.has(input.parentId)) {
        throw new Error(`unknown parent span ${input.parentId}`);
      }
      const id = `span-${++seq}`;
      spans.set(id, {
        id,
        name: input.name,
        kind: input.kind,
        parentId: input.parentId,
        startedAt: Date.now(),
        cost: 0,
        children: [],
      });
      order.push(id);
      return id;
    },
    end(id: string, input: { error?: string; cost?: number } = {}): void {
      const span = spans.get(id);
      if (!span) throw new Error(`unknown span ${id}`);
      if (span.endedAt !== undefined) return;
      span.endedAt = Date.now();
      span.durationMs = Math.max(0, span.endedAt - span.startedAt);
      span.error = input.error;
      span.cost = Math.max(0, Number(input.cost) || 0);
    },
    tree(): RunSpan[] {
      const copies = new Map<string, RunSpan>();
      for (const id of order) {
        const span = spans.get(id)!;
        copies.set(id, { ...span, children: [] });
      }
      const roots: RunSpan[] = [];
      for (const id of order) {
        const span = copies.get(id)!;
        const parent = span.parentId ? copies.get(span.parentId) : undefined;
        if (parent) parent.children.push(span);
        else roots.push(span);
      }
      return roots;
    },
    snapshot(): RunSpan[] {
      return order.map((id) => ({ ...spans.get(id)!, children: [] }));
    },
  };
}

export function selectStandingFeedback(
  rows: Array<{ good: boolean; note: string; ts: string }>,
  options: { negativeLimit?: number; positiveLimit?: number } = {},
): { negative: string[]; positive: string[] } {
  const negativeLimit = options.negativeLimit ?? 6;
  const positiveLimit = options.positiveLimit ?? 3;
  const ordered = rows
    .filter((row) => row.note.trim())
    .slice()
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return {
    negative: ordered
      .filter((row) => !row.good)
      .slice(0, negativeLimit)
      .map((row) => row.note.trim()),
    positive: ordered
      .filter((row) => row.good)
      .slice(0, positiveLimit)
      .map((row) => row.note.trim()),
  };
}
