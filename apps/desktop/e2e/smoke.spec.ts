import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import type { RakazoDesktop } from "@rakazo/contracts";

test("launches the runtime chooser with a narrow privileged bridge and isolated renderer", async () => {
  const configHome = mkdtempSync(path.join(os.tmpdir(), "flowbots-electron-smoke-"));
  const args = process.platform === "linux" && process.env.CI ? ["--no-sandbox", "."] : ["."];
  console.log("SMOKE_STAGE before-launch", { args, configHome });
  const app = await electron.launch({
    args,
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
    },
  });
  console.log("SMOKE_STAGE after-launch");

  try {
    console.log("SMOKE_STAGE before-first-window");
    const page = await app.firstWindow();
    console.log("SMOKE_STAGE after-first-window", { url: page.url() });
    await expect(page.getByText("How should FlowBots run?")).toBeVisible();
    console.log("SMOKE_STAGE launcher-visible");
    await expect(page).toHaveTitle("Choose how FlowBots runs");
    console.log("SMOKE_STAGE title-ok");

    console.log("SMOKE_STAGE before-renderer-evaluate");
    const renderer = await page.evaluate(async () => {
      const desktop = (window as typeof window & { rakazoDesktop?: RakazoDesktop }).rakazoDesktop;
      let terminalError = "";
      try {
        await desktop?.terminal.create({ cols: 80, rows: 24 });
      } catch (error) {
        terminalError = String(error);
      }

      return {
        bridgeKeys: desktop ? Object.keys(desktop).sort() : [],
        windowKeys: desktop ? Object.keys(desktop.window).sort() : [],
        runtimeKeys: desktop ? Object.keys(desktop.runtime).sort() : [],
        terminalKeys: desktop ? Object.keys(desktop.terminal).sort() : [],
        terminalError,
        platform: desktop?.platform,
        state: await desktop?.window.state(),
        nodeGlobals: {
          require: typeof (window as unknown as { require?: unknown }).require,
          process: typeof (window as unknown as { process?: unknown }).process,
          module: typeof (window as unknown as { module?: unknown }).module,
        },
      };
    });
    console.log("SMOKE_STAGE after-renderer-evaluate", renderer);

    expect(renderer.bridgeKeys).toEqual(["platform", "runtime", "terminal", "window"]);
    expect(renderer.windowKeys).toEqual(["close", "minimize", "state", "toggleMaximize"]);
    expect(renderer.runtimeKeys).toEqual(["choose", "showLauncher"]);
    expect(renderer.terminalKeys).toEqual([
      "close",
      "create",
      "interrupt",
      "onActivity",
      "onData",
      "resize",
      "write",
    ]);
    expect(renderer.terminalError).toMatch(/active loopback FlowBots runtime/i);
    expect(renderer.platform).toBe(process.platform);
    expect(renderer.state).toEqual({ minimized: false, maximized: false, fullScreen: false });
    expect(renderer.nodeGlobals).toEqual({
      require: "undefined",
      process: "undefined",
      module: "undefined",
    });
    console.log("SMOKE_STAGE renderer-assertions-ok");

    console.log("SMOKE_STAGE before-main-evaluate");
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        count: BrowserWindow.getAllWindows().length,
        nodeIntegration: win?.webContents.getLastWebPreferences().nodeIntegration,
        contextIsolation: win?.webContents.getLastWebPreferences().contextIsolation,
        sandbox: win?.webContents.getLastWebPreferences().sandbox,
        state: {
          minimized: win?.isMinimized(),
          maximized: win?.isMaximized(),
          fullScreen: win?.isFullScreen(),
        },
      };
    });
    console.log("SMOKE_STAGE after-main-evaluate", preferences);

    expect(preferences).toEqual({
      count: 1,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      state: renderer.state,
    });
    console.log("SMOKE_STAGE preferences-ok");
  } finally {
    console.log("SMOKE_STAGE before-app-close");
    await app.close();
    console.log("SMOKE_STAGE after-app-close");
    rmSync(configHome, { recursive: true, force: true });
    console.log("SMOKE_STAGE cleanup-done");
  }
});
