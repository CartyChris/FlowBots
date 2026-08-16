import { describe, expect, test } from "vitest";
import { ActivityLedger, sanitizeActivityMetadata } from "./activity.js";

describe("Glass Pane activity model", () => {
  test("concurrent child spans retain their explicit parent and trace", () => {
    const ledger = new ActivityLedger({ now: () => 100 });
    const root = ledger.start({ name: "research", kind: "orchestrator", coverage: "managed" });
    const scout = ledger.start({
      name: "scout",
      kind: "subagent",
      coverage: "managed",
      parentSpanId: root.spanId,
    });
    const critic = ledger.start({
      name: "critic",
      kind: "subagent",
      coverage: "managed",
      parentSpanId: root.spanId,
    });

    expect(scout.traceId).toBe(root.traceId);
    expect(critic.traceId).toBe(root.traceId);
    expect(scout.parentSpanId).toBe(root.spanId);
    expect(critic.parentSpanId).toBe(root.spanId);
    expect(ledger.tree()[0]?.children.map((span) => span.spanId)).toEqual([
      scout.spanId,
      critic.spanId,
    ]);
  });

  test("rejects an unknown parent instead of inventing a broken trace", () => {
    const ledger = new ActivityLedger();
    expect(() =>
      ledger.start({
        name: "orphan",
        kind: "subagent",
        coverage: "managed",
        parentSpanId: "missing",
      }),
    ).toThrow(/unknown parent/i);
  });

  test("secret-bearing metadata is recursively redacted before it can be displayed or persisted", () => {
    const secret = "sk-super-secret";
    expect(
      sanitizeActivityMetadata(
        {
          endpoint: `https://example.test?token=${secret}`,
          apiKey: secret,
          nested: { authorization: `Bearer ${secret}`, safe: "openrouter" },
          list: [secret, "visible"],
        },
        [secret],
      ),
    ).toEqual({
      endpoint: "https://example.test?token=[redacted]",
      apiKey: "[redacted]",
      nested: { authorization: "[redacted]", safe: "openrouter" },
      list: ["[redacted]", "visible"],
    });
  });

  test("usage/cost and lifecycle are projected without allowing negative accounting", () => {
    let now = 1_000;
    const ledger = new ActivityLedger({ now: () => now });
    const span = ledger.start({
      name: "model call",
      kind: "model",
      coverage: "managed",
      provider: "openrouter",
      model: "example/model",
      usage: { inputTokens: 10, outputTokens: 4 },
      cost: -3,
    });
    now = 1_250;
    ledger.finish(span.spanId, {
      state: "completed",
      usage: { inputTokens: 10, outputTokens: 8, cachedTokens: 2 },
      cost: 0.004,
    });

    expect(ledger.get(span.spanId)).toMatchObject({
      state: "completed",
      durationMs: 250,
      cost: 0.004,
      usage: { inputTokens: 10, outputTokens: 8, cachedTokens: 2 },
    });
  });

  test("observed external work is explicitly limited coverage", () => {
    const ledger = new ActivityLedger();
    const span = ledger.start({
      name: "external claude process",
      kind: "process",
      coverage: "observed",
      metadata: { pid: 1234 },
    });
    expect(span.coverage).toBe("observed");
    expect(span.safeMetadata).toEqual({ pid: 1234 });
  });
});
