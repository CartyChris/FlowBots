import { existsSync } from "node:fs";
import path from "node:path";
import { startLocalRuntime } from "@rakazo/local-runtime";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import {
  launcherDocumentUrl,
  resolveRuntimeResourcePaths,
  trustedRuntimeSender,
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
import { browserWindowOptions } from "./window-options.js";

let mainWindow: BrowserWindow | undefined;
let session: DesktopRuntimeSession | undefined;
let trustedLauncherUrl = "";
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
    throw new Error("Runtime controls are available only from Rakazo's local runtime launcher.");
  }
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
      await win.loadURL(origin);
    },
    persist: async (profile: RuntimeProfile) => {
      await writeRuntimeSettings(settingsPath, profile);
    },
    showLauncher: async (error) => {
      trustedLauncherUrl = launcherDocumentUrl(error);
      await win.loadURL(trustedLauncherUrl);
    },
  });
  session = nextSession;

  win.on("closed", () => {
    if (mainWindow !== win) return;
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
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, ...(process.platform === "darwin" ? [{ type: "separator" as const }, { role: "front" as const }] : [{ role: "close" as const }])] },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  const icon = developmentIcon();
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);

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
    if (!session) throw new Error("Rakazo runtime session is unavailable.");
    return session.choose(profile);
  });
  ipcMain.handle("desktop.runtime.showLauncher", async (event) => {
    assertTrustedRuntimeSender(event);
    return session?.showLauncher();
  });

  installApplicationMenu();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", (event) => {
  if (stoppingForQuit || !session) return;
  event.preventDefault();
  stoppingForQuit = true;
  void session.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
