interface EffectIdentity {
  workspaceId: string;
  runId: string;
  kind: string;
  request: unknown;
}

/** An idempotency key identifies one request, never authority to retrieve another result. */
export function assertEffectIdentity(stored: EffectIdentity, expected: EffectIdentity): void {
  if (
    stored.workspaceId !== expected.workspaceId ||
    stored.runId !== expected.runId ||
    stored.kind !== expected.kind ||
    canonicalJson(stored.request) !== canonicalJson(expected.request)
  )
    throw new Error("Tool execution identity was reused with a different request");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    return item;
  });
}
