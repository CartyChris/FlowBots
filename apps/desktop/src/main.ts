import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, clipboard, ipcMain, Menu } from "electron";
import {
  type ConnectionSettings,
  defaultWebUrl,
  isTrustedConnectionCenterDocument,
  normalizeWebUrl,
  rememberWebUrl,
} from "./connection.js";
import { type ConnectionHealth, probeConnectionHealth } from "./connection-health.js";
import { readConnectionSettings, writeConnectionSettings } from "./connection-settings.js";
import { attemptNavigation, shouldAutoRetry } from "./navigation.js";
import {
  type ConnectionCenterMode,
  diagnosticsText,
  type RecoveryPageModel,
  recoveryPageHtml,
} from "./recovery-page.js";
import { browserWindowOptions } from "./window-options.js";

const LOCAL_WEB_URL = "http://127.0.0.1:5173";
const SETTINGS_FILENAME = "connection-settings.json";
const AUTO_RETRY_MS = 5000;

let mainWindow: BrowserWindow | null = null;
let connectionSettings: ConnectionSettings = { recentUrls: [] };
let settingsPath = "";
let currentTarget = LOCAL_WEB_URL;
let lastError = "";
let health: ConnectionHealth = { webStatus: "checking", apiStatus: "checking" };
let connected = false;
let connecting = false;
let centerMode: ConnectionCenterMode = "recovery";
let retryTimer: ReturnType<typeof setInterval> | undefined;
let navigationId = 0;
let healthProbe: Promise<ConnectionHealth> | null = null;
let healthProbeTarget = "";
let trustedConnectionCenterUrl = "";

function windowFrom(event: Electron.IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

function requireConnectionCenterSender(event: Electron.IpcMainInvokeEvent) {
  if (!isTrustedConnectionCenterDocument(event.sender.getURL(), trustedConnectionCenterUrl)) {
    throw new Error("Desktop connection controls are only available from Connection Center.");
  }
}

function developmentIcon() {
  if (app.isPackaged) return undefined;
  const icon = path.join(app.getAppPath(), "assets", "icon.png");
  return existsSync(icon) ? icon : undefined;
}

function platformLabel() {
  return `${process.platform} ${process.arch}`;
}

function stopAutoRetry() {
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = undefined;
}

function recoveryModel(mode: ConnectionCenterMode = centerMode): RecoveryPageModel {
  return {
    currentUrl: currentTarget,
    error: lastError,
    recentUrls: connectionSettings.recentUrls,
    appVersion: app.getVersion(),
    platform: platformLabel(),
    webStatus: health.webStatus,
    apiStatus: health.apiStatus,
    mode,
  };
}

async function refreshHealth(): Promise<ConnectionHealth> {
  const target = currentTarget;
  if (healthProbe && healthProbeTarget === target) return healthProbe;

  healthProbeTarget = target;
  healthProbe = probeConnectionHealth(target)
    .then((next) => {
      if (target === currentTarget) health = next;
      return next;
    })
    .finally(() => {
      if (healthProbeTarget === target) {
        healthProbe = null;
        healthProbeTarget = "";
      }
    });
  return healthProbe;
}

async function showConnectionCenter(mode: ConnectionCenterMode, error = lastError) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;

  centerMode = mode;
  connected = false;
  lastError = error;
  if (mode === "settings") stopAutoRetry();
  const html = recoveryPageHtml(recoveryModel(mode));
  const documentUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  trustedConnectionCenterUrl = documentUrl;
  await win.loadURL(documentUrl);
  trustedConnectionCenterUrl = win.webContents.getURL();

  if (mode === "recovery") startAutoRetry();
  void refreshHealth();
}

async function connectToTarget() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;

  const target = currentTarget;
  const attemptId = ++navigationId;
  connecting = true;
  trustedConnectionCenterUrl = "";
  stopAutoRetry();
  health = {
    webStatus: "checking",
    apiStatus:
      target.startsWith("http://127.0.0.1") || target.startsWith("http://localhost")
        ? "checking"
        : "not-applicable",
  };

  const result = await attemptNavigation((url) => win.loadURL(url), target);
  if (attemptId !== navigationId || target !== currentTarget) return;

  connecting = false;
  if (result.ok) {
    connected = true;
    lastError = "";
    centerMode = "settings";
    health = { ...health, webStatus: "online" };
    stopAutoRetry();
    return;
  }

  connected = false;
  lastError = result.error;
  await showConnectionCenter("recovery", result.error);
}

async function autoRetryTick() {
  const win = mainWindow;
  const windowDestroyed = !win || win.isDestroyed();
  if (centerMode !== "recovery" || connecting || !shouldAutoRetry({ connected, windowDestroyed })) {
    if (windowDestroyed || connected || centerMode !== "recovery") stopAutoRetry();
    return;
  }

  const next = await refreshHealth();
  if (next.webStatus === "online" && centerMode === "recovery" && !connecting) {
    await connectToTarget();
  }
}

function startAutoRetry() {
  stopAutoRetry();
  retryTimer = setInterval(() => {
    void autoRetryTick();
  }, AUTO_RETRY_MS);
}

async function saveAndConnect(value: string) {
  try {
    const normalized = normalizeWebUrl(value);
    const nextSettings = rememberWebUrl(connectionSettings, normalized);
    await writeConnectionSettings(settingsPath, nextSettings);
    connectionSettings = nextSettings;
    currentTarget = normalized;
    lastError = "";
    health = { webStatus: "checking", apiStatus: "checking" };
    void connectToTarget();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save this connection.";
    lastError = message;
    await showConnectionCenter(centerMode, message);
    return { ok: false, error: message };
  }
}

async function resetToLocal() {
  return saveAndConnect(LOCAL_WEB_URL);
}

async function openConnectionSettings() {
  navigationId += 1;
  connecting = false;
  lastError = "";
  centerMode = "settings";
  stopAutoRetry();
  health = { webStatus: "checking", apiStatus: "checking" };
  await showConnectionCenter("settings", "");
}

async function copyConnectionDiagnostics() {
  await refreshHealth();
  clipboard.writeText(diagnosticsText(recoveryModel()));
  return { ok: true };
}

function registerIpc() {
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

  ipcMain.handle("desktop.connection.retry", async (event) => {
    requireConnectionCenterSender(event);
    void connectToTarget();
    return { ok: true };
  });
  ipcMain.handle("desktop.connection.setUrl", (event, value: unknown) => {
    requireConnectionCenterSender(event);
    return saveAndConnect(typeof value === "string" ? value : "");
  });
  ipcMain.handle("desktop.connection.reset", (event) => {
    requireConnectionCenterSender(event);
    return resetToLocal();
  });
  ipcMain.handle("desktop.connection.useRecent", (event, value: unknown) => {
    requireConnectionCenterSender(event);
    return saveAndConnect(typeof value === "string" ? value : "");
  });
  ipcMain.handle("desktop.connection.copyDiagnostics", (event) => {
    requireConnectionCenterSender(event);
    return copyConnectionDiagnostics();
  });
  ipcMain.handle("desktop.connection.status", (event) => {
    requireConnectionCenterSender(event);
    return refreshHealth();
  });
}

function installMenu() {
  const connectionItem: Electron.MenuItemConstructorOptions = {
    label: "Connection…",
    accelerator: "CmdOrCtrl+,",
    click: () => {
      void openConnectionSettings();
    },
  };

  const template: Electron.MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        connectionItem,
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
      submenu: [connectionItem, { type: "separator" }, { role: "quit" }],
    });
  }
  template.push({ role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
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
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    connected = false;
    connecting = false;
    navigationId += 1;
    trustedConnectionCenterUrl = "";
    stopAutoRetry();
  });
  void connectToTarget();
}

async function resolveInitialTarget() {
  settingsPath = path.join(app.getPath("userData"), SETTINGS_FILENAME);
  connectionSettings = await readConnectionSettings(settingsPath);
  if (connectionSettings.activeUrl) {
    currentTarget = connectionSettings.activeUrl;
    return;
  }

  try {
    currentTarget = defaultWebUrl(process.env);
  } catch {
    currentTarget = LOCAL_WEB_URL;
    lastError = "RAKAZO_WEB_URL is invalid; using the local Rakazo origin instead.";
  }
}

app.whenReady().then(async () => {
  const icon = developmentIcon();
  if (process.platform === "darwin" && icon) app.dock?.setIcon(icon);
  registerIpc();
  installMenu();
  await resolveInitialTarget();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  trustedConnectionCenterUrl = "";
  stopAutoRetry();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
