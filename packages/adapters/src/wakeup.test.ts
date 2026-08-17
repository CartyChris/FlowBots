import type { BackgroundJobHandlers } from "@rakazo/adapter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryJobQueue } from "./wakeup.js";

const MAX_TIMEOUT_MS = 2_147_483_647;

function handlers(): BackgroundJobHandlers {
  return {
    "run.continue": vi.fn(async () => undefined),
    "routine.wakeup": vi.fn(async () => undefined),
    "computer.sleep": vi.fn(async () => undefined),
  };
}

describe("InMemoryJobQueue", () => {
  afterEach(() => vi.useRealTimers());

  it("delivers delayed jobs", async () => {
    vi.useFakeTimers();
    const queue = new InMemoryJobQueue();
    const target = handlers();
    await queue.start(target);
    await queue.enqueue({
      name: "run.continue",
      payload: { runId: "run-1" },
      availableAt: new Date(Date.now() + 1_000),
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(target["run.continue"]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(target["run.continue"]).toHaveBeenCalledWith({ runId: "run-1" });
    await queue.close();
  });

  it("chunks delays that exceed Node's maximum safe timeout", async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const queue = new InMemoryJobQueue();
    const target = handlers();
    const availableAt = new Date(Date.now() + MAX_TIMEOUT_MS + 10_000);
    const scheduledFor = availableAt.toISOString();
    await queue.start(target);
    await queue.enqueue({
      name: "routine.wakeup",
      payload: { routineId: "routine-1", scheduledFor },
      availableAt,
      replaceKey: "routine.wakeup:routine-1",
    });

    expect(timeoutSpy.mock.calls.at(-1)?.[1]).toBe(MAX_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    expect(target["routine.wakeup"]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(target["routine.wakeup"]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(target["routine.wakeup"]).toHaveBeenCalledTimes(1);
    expect(target["routine.wakeup"]).toHaveBeenCalledWith({
      routineId: "routine-1",
      scheduledFor,
    });
    await queue.close();
    timeoutSpy.mockRestore();
  });

  it("replaces and cancels keyed jobs", async () => {
    vi.useFakeTimers();
    const queue = new InMemoryJobQueue();
    const target = handlers();
    await queue.start(target);
    await queue.enqueue({
      name: "computer.sleep",
      payload: { botId: "old" },
      availableAt: new Date(Date.now() + 1_000),
      replaceKey: "computer.sleep:1",
    });
    await queue.enqueue({
      name: "computer.sleep",
      payload: { botId: "new" },
      availableAt: new Date(Date.now() + 1_000),
      replaceKey: "computer.sleep:1",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(target["computer.sleep"]).toHaveBeenCalledTimes(1);
    expect(target["computer.sleep"]).toHaveBeenCalledWith({ botId: "new" });

    await queue.enqueue({
      name: "computer.sleep",
      payload: { botId: "cancelled" },
      availableAt: new Date(Date.now() + 1_000),
      replaceKey: "computer.sleep:2",
    });
    await queue.cancel("computer.sleep:2");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(target["computer.sleep"]).toHaveBeenCalledTimes(1);
    await queue.close();
  });
});
