export type ActivityCoverage = "managed" | "observed";
export type ActivityState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ActivityUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}

export interface ActivitySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  coverage: ActivityCoverage;
  state: ActivityState;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  harnessId?: string;
  provider?: string;
  model?: string;
  targetId?: string;
  usage?: ActivityUsage;
  cost: number;
  safeMetadata: Record<string, unknown>;
}

export interface ActivityTreeSpan extends ActivitySpan {
  children: ActivityTreeSpan[];
}

export interface ActivityStartInput {
  name: string;
  kind: string;
  coverage: ActivityCoverage;
  parentSpanId?: string;
  harnessId?: string;
  provider?: string;
  model?: string;
  targetId?: string;
  usage?: ActivityUsage;
  cost?: number;
  metadata?: Record<string, unknown>;
  secrets?: string[];
}

export interface ActivityFinishInput {
  state: Extract<ActivityState, "completed" | "failed" | "cancelled">;
  usage?: ActivityUsage;
  cost?: number;
  metadata?: Record<string, unknown>;
  secrets?: string[];
}

export class ActivityLedger {
  private sequence = 0;
  private traceSequence = 0;
  private readonly spans = new Map<string, ActivitySpan>();
  private readonly order: string[] = [];
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  start(input: ActivityStartInput): ActivitySpan {
    const parent = input.parentSpanId ? this.spans.get(input.parentSpanId) : undefined;
    if (input.parentSpanId && !parent) {
      throw new Error(`Unknown parent activity span ${input.parentSpanId}`);
    }

    const spanId = `activity-${++this.sequence}`;
    const traceId = parent?.traceId ?? `trace-${++this.traceSequence}`;
    const span: ActivitySpan = {
      traceId,
      spanId,
      ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
      name: input.name,
      kind: input.kind,
      coverage: input.coverage,
      state: "running",
      startedAt: this.now(),
      ...(input.harnessId ? { harnessId: input.harnessId } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.usage ? { usage: normalizeUsage(input.usage) } : {}),
      cost: normalizeCost(input.cost),
      safeMetadata: sanitizeActivityMetadata(input.metadata ?? {}, input.secrets ?? []),
    };
    this.spans.set(spanId, span);
    this.order.push(spanId);
    return cloneSpan(span);
  }

  finish(spanId: string, input: ActivityFinishInput): ActivitySpan {
    const current = this.spans.get(spanId);
    if (!current) throw new Error(`Unknown activity span ${spanId}`);
    if (current.endedAt !== undefined) return cloneSpan(current);

    const endedAt = this.now();
    const updated: ActivitySpan = {
      ...current,
      state: input.state,
      endedAt,
      durationMs: Math.max(0, endedAt - current.startedAt),
      ...(input.usage ? { usage: normalizeUsage(input.usage) } : {}),
      ...(input.cost !== undefined ? { cost: normalizeCost(input.cost) } : {}),
      safeMetadata: input.metadata
        ? {
            ...current.safeMetadata,
            ...sanitizeActivityMetadata(input.metadata, input.secrets ?? []),
          }
        : current.safeMetadata,
    };
    this.spans.set(spanId, updated);
    return cloneSpan(updated);
  }

  get(spanId: string): ActivitySpan | undefined {
    const span = this.spans.get(spanId);
    return span ? cloneSpan(span) : undefined;
  }

  snapshot(): ActivitySpan[] {
    return this.order.map((id) => cloneSpan(this.spans.get(id)!));
  }

  tree(): ActivityTreeSpan[] {
    const copies = new Map<string, ActivityTreeSpan>();
    for (const id of this.order) {
      copies.set(id, { ...cloneSpan(this.spans.get(id)!), children: [] });
    }
    const roots: ActivityTreeSpan[] = [];
    for (const id of this.order) {
      const span = copies.get(id)!;
      const parent = span.parentSpanId ? copies.get(span.parentSpanId) : undefined;
      if (parent) parent.children.push(span);
      else roots.push(span);
    }
    return roots;
  }
}

const SENSITIVE_KEY = /(api[-_]?key|authorization|access[-_]?token|refresh[-_]?token|password|secret|cookie)/i;

export function sanitizeActivityMetadata(
  metadata: Record<string, unknown>,
  secrets: readonly string[] = [],
): Record<string, unknown> {
  const knownSecrets = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  return sanitizeObject(metadata, knownSecrets);
}

function sanitizeObject(value: Record<string, unknown>, secrets: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeValue(item, secrets),
    ]),
  );
}

function sanitizeValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") {
    return secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, secrets));
  if (value && typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>, secrets);
  }
  return value;
}

function normalizeUsage(usage: ActivityUsage): ActivityUsage {
  const entries = Object.entries(usage).map(([key, value]) => [
    key,
    Math.max(0, Math.trunc(Number(value) || 0)),
  ]);
  return Object.fromEntries(entries) as ActivityUsage;
}

function normalizeCost(value: number | undefined): number {
  return Math.max(0, Number(value) || 0);
}

function cloneSpan(span: ActivitySpan): ActivitySpan {
  return {
    ...span,
    ...(span.usage ? { usage: { ...span.usage } } : {}),
    safeMetadata: structuredClone(span.safeMetadata),
  };
}
