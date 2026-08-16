import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("desktop preload bridge", () => {
  it("exposes narrow runtime and terminal operations without shell selection", async () => {
    const invoke = vi.fn(async (channel: string, ...payload: unknown[]) => ({ channel, payload }));
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const on = vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
    });
    const removeListener = vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener);
    });
    const exposeInMainWorld = vi.fn();
    const source = readFileSync(path.join(import.meta.dirname, "preload.cjs"), "utf8");

    vm.runInNewContext(source, {
      process: { platform: "linux" },
      require(moduleName: string) {
        if (moduleName !== "electron") throw new Error(`Unexpected preload import: ${moduleName}`);
        return {
          contextBridge: { exposeInMainWorld },
          ipcRenderer: { invoke, on, removeListener },
        };
      },
    });

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [globalName, bridge] = exposeInMainWorld.mock.calls[0] as [
      string,
      {
        platform: string;
        window: Record<string, () => Promise<unknown>>;
        runtime: { choose(profile: unknown): Promise<unknown>; showLauncher(): Promise<unknown> };
        terminal: {
          create(input: { cwd?: string; cols: number; rows: number }): Promise<unknown>;
          write(sessionId: string, data: string): Promise<unknown>;
          resize(sessionId: string, cols: number, rows: number): Promise<unknown>;
          interrupt(sessionId: string): Promise<unknown>;
          close(sessionId: string): Promise<unknown>;
          onData(listener: (event: unknown) => void): () => void;
          onActivity(listener: (event: unknown) => void): () => void;
        };
      },
    ];
    expect(globalName).toBe("rakazoDesktop");
    expect(bridge.platform).toBe("linux");
    expect(Object.keys(bridge.window).sort()).toEqual([
      "close",
      "minimize",
      "state",
      "toggleMaximize",
    ]);
    expect(Object.keys(bridge.runtime).sort()).toEqual(["choose", "showLauncher"]);
    expect(Object.keys(bridge.terminal).sort()).toEqual([
      "close",
      "create",
      "interrupt",
      "onActivity",
      "onData",
      "resize",
      "write",
    ]);

    const dataListener = vi.fn();
    const activityListener = vi.fn();
    const offData = bridge.terminal.onData(dataListener);
    const offActivity = bridge.terminal.onActivity(activityListener);
    const dataEvent = { sessionId: "terminal-1", data: "hello" };
    const activityEvent = { type: "terminal.started", sessionId: "terminal-1" };
    listeners.get("desktop.terminal.data")?.forEach((listener) => {
      listener({}, dataEvent);
    });
    listeners.get("desktop.terminal.activity")?.forEach((listener) => {
      listener({}, activityEvent);
    });
    expect(dataListener).toHaveBeenCalledWith(dataEvent);
    expect(activityListener).toHaveBeenCalledWith(activityEvent);
    offData();
    offActivity();
    expect(removeListener).toHaveBeenCalledTimes(2);

    await bridge.terminal.create({ cwd: "/tmp", cols: 80, rows: 24 });
    await bridge.terminal.write("terminal-1", "pwd\r");
    await bridge.terminal.resize("terminal-1", 100, 30);
    await bridge.terminal.interrupt("terminal-1");
    await bridge.terminal.close("terminal-1");
    expect(invoke.mock.calls.slice(-5)).toEqual([
      ["desktop.terminal.create", { cwd: "/tmp", cols: 80, rows: 24 }],
      ["desktop.terminal.write", "terminal-1", "pwd\r"],
      ["desktop.terminal.resize", "terminal-1", 100, 30],
      ["desktop.terminal.interrupt", "terminal-1"],
      ["desktop.terminal.close", "terminal-1"],
    ]);
  });
});
