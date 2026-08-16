import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("desktop preload bridge", () => {
  it("exposes platform, window operations, and only the narrow runtime-selection operation", async () => {
    const invoke = vi.fn(async (channel: string, payload?: unknown) => ({ channel, payload }));
    const exposeInMainWorld = vi.fn();
    const source = readFileSync(path.join(import.meta.dirname, "preload.cjs"), "utf8");

    vm.runInNewContext(source, {
      process: { platform: "linux" },
      require(moduleName: string) {
        if (moduleName !== "electron") throw new Error(`Unexpected preload import: ${moduleName}`);
        return { contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke } };
      },
    });

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [globalName, bridge] = exposeInMainWorld.mock.calls[0] as [
      string,
      {
        platform: string;
        window: Record<string, () => Promise<unknown>>;
        runtime: { choose(profile: unknown): Promise<unknown>; showLauncher(): Promise<unknown> };
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

    await bridge.window.close();
    await bridge.window.minimize();
    await bridge.window.toggleMaximize();
    await bridge.window.state();
    await bridge.runtime.choose({ mode: "lite" });
    await bridge.runtime.showLauncher();
    expect(invoke.mock.calls).toEqual([
      ["desktop.window.close"],
      ["desktop.window.minimize"],
      ["desktop.window.toggleMaximize"],
      ["desktop.window.state"],
      ["desktop.runtime.choose", { mode: "lite" }],
      ["desktop.runtime.showLauncher"],
    ]);
  });
});
