const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld("rakazoDesktop", {
  platform: process.platform,
  window: {
    close: () => ipcRenderer.invoke("desktop.window.close"),
    minimize: () => ipcRenderer.invoke("desktop.window.minimize"),
    toggleMaximize: () => ipcRenderer.invoke("desktop.window.toggleMaximize"),
    state: () => ipcRenderer.invoke("desktop.window.state"),
  },
  runtime: {
    choose: (profile) => ipcRenderer.invoke("desktop.runtime.choose", profile),
    showLauncher: () => ipcRenderer.invoke("desktop.runtime.showLauncher"),
  },
  terminal: {
    create: (input) => ipcRenderer.invoke("desktop.terminal.create", input),
    write: (sessionId, data) => ipcRenderer.invoke("desktop.terminal.write", sessionId, data),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.invoke("desktop.terminal.resize", sessionId, cols, rows),
    interrupt: (sessionId) => ipcRenderer.invoke("desktop.terminal.interrupt", sessionId),
    close: (sessionId) => ipcRenderer.invoke("desktop.terminal.close", sessionId),
    onData: (listener) => subscribe("desktop.terminal.data", listener),
    onActivity: (listener) => subscribe("desktop.terminal.activity", listener),
  },
});
