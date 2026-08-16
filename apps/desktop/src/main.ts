import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import * as nodePty from "node-pty";
import { startLocalRuntime } from "./local-runtime.js";
import { createNodePtyFactory } from "./node-pty-factory.js";
import {
  launcherDocumentUrl,
  resolveRuntimeResourcePaths,
  trustedRuntimeSender,
  trustedTerminalSender,
} from "./runtime-bootstrap.js";
import { probeRuntimeOrigin } from "./runtime-health.js";
import {
  activateRuntimeProfile,
  normalizeRuntimeProfile,
  type RuntimeProfile,
} from "./runtime-profile.js";
import { DesktopRuntimeSession } from "./runtime-session.js";
import {
  readRuntimeProfile as readRuntimeSettings,
  writeRuntimeProfile as writeRuntimeSettings,
} from "./runtime-settings.js";
import { TerminalSessionManager } from "./terminal-session.js";
import { browserWindowOptions } from "./window-options.js";

const MAX_TERMINAL_WRITE_BYTES = 1024 * 1024;

let mainWindow: BrowserWindow | undefined;
let session: DesktopRuntimeSession | undefined;
let terminalManager: TerminalSessionManager | undefined;
const terminalOwners = new Map<string, number>();
let trustedLauncherUrl = "";
let trustedTerminalOrigin = "";
let stoppingForQuit = false;

function windowFrom(event: Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function developmentIcon() {
  if (app.isPackaged) return undefined;
  const icon = path.join(app.getAppPath(), "assets", "icon.png");
  return existsSync(icon) ? icon : undefined;
}

function runtimeSettingsPath() {
  return path.join(app.getPath("userData"), "runtime-profile.json");
}

function runtimePaths() {
  return resolveRuntimeResourcePaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    userData: app.getPath("userData"),
  });
}

function senderUrl(event: Electron.IpcMainInvokeEvent) {
  return event.senderFrame?.url || event.sender.getURL();
}

function assertTrustedRuntimeSender(event: Electron.IpcMainInvokeEvent) {
  if (!trustedRuntimeSender(senderUrl(event), trustedLauncherUrl)) {
    throw new Error(
      "Runtime controls are available only from the FlowBots local runtime launcher.",
    );
  }
}

function assertTrustedTerminalSender(event: Electron.IpcMainInvokeEvent) {
  if (!trustedTerminalSender(senderUrl(event), trustedTerminalOrigin)) {
    throw new Error(
      "Host terminal access is available only to the active loopback FlowBots runtime.",
    );
  }
}

function requireTerminalManager(): TerminalSessionManager {
  if (!terminalManager) throw new Error("FlowBots terminal service is unavailable.");
  return terminalManager;
}

function assertTerminalOwner(event: Electron.IpcMainInvokeEvent, sessionId: string): void {
  if (terminalOwners.get(sessionId) !== event.sender.id) {
    throw new Error("Terminal session is not owned by this FlowBots window.");
  }
}

function defaultShell(): string {
  const configured = process.env.SHELL;
  if (configured && path.isAbsolute(configured)) return configured;
  if (process.platform === "win32") {
    const comspec = process.env.COMSPEC;
    if (comspec && path.isAbsolute(comspec)) return comspec;
    return "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  }
  return process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}

function terminalEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function installTerminalService(): void {
  terminalManager = new TerminalSessionManager({
    factory: createNodePtyFactory(nodePty),
    allowedRoots: [app.getPath("home")],
    defaultShell: defaultShell(),
    homeDir: app.getPath("home"),
    env: terminalEnvironment(),
    onActivity: (activity) => {
      if (activity.type !== "terminal.started") terminalOwners.delete(activity.sessionId);
      const win = mainWindow;
      if (win && !win.isDestroyed()) win.webContents.send("desktop.terminal.activity", activity);
    },
  });
}

async function createWindow() {
  const icon = developmentIcon();
  const win = new BrowserWindow({
    ...browserWindowOptions(process.platform),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = win;

  const paths = runtimePaths();
  const settingsPath = runtimeSettingsPath();
  const nextSession = new DesktopRuntimeSession({
    activate: (profile) =>
      activateRuntimeProfile(profile, {
        startLite: () =>
          startLocalRuntime({
            dataDir: paths.dataDir,
            migrationsDir: paths.migrationsDir,
            webDir: existsSync(paths.webDir) ? paths.webDir : undefined,
          }),
      }),
    probe: (target) => probeRuntimeOrigin(target),
    navigate: async (origin) => {
      const previousTerminalOrigin = trustedTerminalOrigin;
      const previousLauncherUrl = trustedLauncherUrl;
      trustedTerminalOrigin = new URL(origin).origin;
      try {
        await win.loadURL(origin);
        trustedLauncherUrl = "";
      } catch (error) {
        trustedTerminalOrigin = previousTerminalOrigin;
        trustedLauncherUrl = previousLauncherUrl;
        throw error;
      }
    },
    persist: async (profile: RuntimeProfile) => {
      await writeRuntimeSettings(settingsPath, profile);
    },
    showLauncher: async (error) => {
      trustedTerminalOrigin = "";
      trustedLauncherUrl = launcherDocumentUrl(error);
      await win.loadURL(trustedLauncherUrl);
    },
  });
  session = nextSession;

  win.on("closed", () => {
    if (mainWindow !== win) return;
    terminalManager?.closeAll();
    terminalOwners.clear();
    trustedTerminalOrigin = "";
    trustedLauncherUrl = "";
    mainWindow = undefined;
    if (session === nextSession) session = undefined;
    void nextSession.stop();
  });

  await nextSession.start(await readRuntimeSettings(settingsPath));
}

function installApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Runtime…",
          accelerator: "CmdOrCtrl+,",
          click: () => void session?.showLauncher(),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  } else {
    template.push({
      label: "File",
      submenu: [
        {
          label: "Runtime…",
          accelerator: "CmdOrCtrl+,",
          click: () => void session?.showLauncher(),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
  template.push(
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  const icon = developmentIcon();
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);

  installTerminalService();

  ipcMain.handle("desktop.platform", () => process.platform);
  ipcMain.handle("desktop.window.close", (event) => {
    windowFrom(event)?.close();
  });
  ipcMain.handle("desktop.window.minimize", (event) => {
    windowFrom(event)?.minimize();
  });
  ipcMain.handle("desktop.window.toggleMaximize", (event) => {
    const win = windowFrom(event);
    if (!win) return;
    if (win.isMaximized() || win.isFullScreen()) {
      win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.handle("desktop.window.state", (event) => {
    const win = windowFrom(event);
    return {
      minimized: win?.isMinimized() ?? false,
      maximized: win?.isMaximized() ?? false,
      fullScreen: win?.isFullScreen() ?? false,
    };
  });
  ipcMain.handle("desktop.runtime.choose", async (event, raw: unknown) => {
    assertTrustedRuntimeSender(event);
    const profile = normalizeRuntimeProfile((raw ?? {}) as { mode: string; serverUrl?: string });
    if (!session) throw new Error("FlowBots runtime session is unavailable.");
    return session.choose(profile);
  });
  ipcMain.handle("desktop.runtime.showLauncher", async (event) => {
    assertTrustedRuntimeSender(event);
    return session?.showLauncher();
  });
  ipcMain.handle("desktop.terminal.create", (event, raw: unknown) => {
    assertTrustedTerminalSender(event);
    const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const cwd = typeof input.cwd === "string" ? input.cwd : undefined;
    const terminal = requireTerminalManager();
    const info = terminal.create({
      ...(cwd ? { cwd } : {}),
      cols: Number(input.cols),
      rows: Number(input.rows),
    });
    terminalOwners.set(info.id, event.sender.id);
    terminal.subscribe(info.id, (data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("desktop.terminal.data", { sessionId: info.id, data });
      }
    });
    return info;
  });
  ipcMain.handle("desktop.terminal.write", (event, sessionId: unknown, data: unknown) => {
    assertTrustedTerminalSender(event);
    if (typeof sessionId !== "string" || typeof data !== "string") {
      throw new Error("Invalid terminal write request.");
    }
    if (Buffer.byteLength(data, "utf8") > MAX_TERMINAL_WRITE_BYTES) {
      throw new Error("Terminal write exceeds the maximum payload size.");
    }
    assertTerminalOwner(event, sessionId);
    requireTerminalManager().write(sessionId, data);
  });
  ipcMain.handle(
    "desktop.terminal.resize",
    (event, sessionId: unknown, cols: unknown, rows: unknown) => {
      assertTrustedTerminalSender(event);
      if (typeof sessionId !== "string") throw new Error("Invalid terminal resize request.");
      assertTerminalOwner(event, sessionId);
      requireTerminalManager().resize(sessionId, Number(cols), Number(rows));
    },
  );
  ipcMain.handle("desktop.terminal.interrupt", (event, sessionId: unknown) => {
    assertTrustedTerminalSender(event);
    if (typeof sessionId !== "string") throw new Error("Invalid terminal interrupt request.");
    assertTerminalOwner(event, sessionId);
    requireTerminalManager().interrupt(sessionId);
  });
  ipcMain.handle("desktop.terminal.close", (event, sessionId: unknown) => {
    assertTrustedTerminalSender(event);
    if (typeof sessionId !== "string") throw new Error("Invalid terminal close request.");
    assertTerminalOwner(event, sessionId);
    const closed = requireTerminalManager().close(sessionId);
    if (closed) terminalOwners.delete(sessionId);
    return closed;
  });

  installApplicationMenu();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", (event) => {
  terminalManager?.closeAll();
  terminalOwners.clear();
  trustedTerminalOrigin = "";
  trustedLauncherUrl = "";
  if (stoppingForQuit || !session) return;
  event.preventDefault();
  stoppingForQuit = true;
  void session.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  terminalManager?.closeAll();
  terminalOwners.clear();
  trustedTerminalOrigin = "";
  trustedLauncherUrl = "";
  if (process.platform !== "darwin") app.quit();
});
