import { ActivityLedger } from "@rakazo/core";
import { describe, expect, test, vi } from "vitest";
import { ActivityBus } from "./activity-bus.js";

describe("Glass Pane activity bus", () => {
  test("publishes immutable snapshots to subscribers in activity order", () => {
    const ledger = new ActivityLedger({ now: () => 10 });
    const bus = new ActivityBus(ledger);
    const seen: string[][] = [];
    const unsubscribe = bus.subscribe((spans) => seen.push(spans.map((span) => span.name)));

    bus.start({ name: "root", kind: "orchestrator", coverage: "managed" });
    bus.start({ name: "observer", kind: "process", coverage: "observed" });
    unsubscribe();
    bus.start({ name: "after", kind: "tool", coverage: "managed" });

    expect(seen).toEqual([["root"], ["root", "observer"]]);
  });

  test("cancellation routes only to the managed session Rakazo owns", async () => {
    const ledger = new ActivityLedger();
    const bus = new ActivityBus(ledger);
    const managed = bus.start({ name: "Claude Code", kind: "cli", coverage: "managed" });
    const abort = vi.fn(async () => undefined);
    bus.attachManagedSession(managed.spanId, { abort });

    await expect(bus.cancel(managed.spanId)).resolves.toEqual({ cancelled: true });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(bus.snapshot().find((span) => span.spanId === managed.spanId)?.state).toBe("cancelled");
  });

  test("observed external activity cannot be cancelled through Rakazo", async () => {
    const ledger = new ActivityLedger();
    const bus = new ActivityBus(ledger);
    const observed = bus.start({ name: "external python", kind: "process", coverage: "observed" });
    const abort = vi.fn(async () => undefined);

    expect(() => bus.attachManagedSession(observed.spanId, { abort })).toThrow(/managed/i);
    await expect(bus.cancel(observed.spanId)).resolves.toMatchObject({
      cancelled: false,
      reason: expect.stringMatching(/observed|not managed/i),
    });
    expect(abort).not.toHaveBeenCalled();
  });

  test("a managed span without an attached controller reports limited control instead of faking cancellation", async () => {
    const ledger = new ActivityLedger();
    const bus = new ActivityBus(ledger);
    const span = bus.start({ name: "API request", kind: "api", coverage: "managed" });

    await expect(bus.cancel(span.spanId)).resolves.toMatchObject({
      cancelled: false,
      reason: expect.stringMatching(/controller|control/i),
    });
    expect(bus.snapshot().find((item) => item.spanId === span.spanId)?.state).toBe("running");
  });

  test("managed controller failure is surfaced and does not falsely mark the span cancelled", async () => {
    const ledger = new ActivityLedger();
    const bus = new ActivityBus(ledger);
    const span = bus.start({ name: "Prime Agent", kind: "rpc", coverage: "managed" });
    bus.attachManagedSession(span.spanId, {
      abort: async () => {
        throw new Error("abort refused");
      },
    });

    await expect(bus.cancel(span.spanId)).resolves.toEqual({
      cancelled: false,
      reason: "abort refused",
    });
    expect(bus.snapshot().find((item) => item.spanId === span.spanId)?.state).toBe("running");
  });
});
