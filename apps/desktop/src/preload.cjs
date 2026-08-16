const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rakazoDesktop", {
  platform: process.platform,
  window: {
    close: () => ipcRenderer.invoke("desktop.window.close"),
    minimize: () => ipcRenderer.invoke("desktop.window.minimize"),
    toggleMaximize: () => ipcRenderer.invoke("desktop.window.toggleMaximize"),
    state: () => ipcRenderer.invoke("desktop.window.state"),
  },
  connection: {
    retry: () => ipcRenderer.invoke("desktop.connection.retry"),
    setUrl: (url) => ipcRenderer.invoke("desktop.connection.setUrl", url),
    reset: () => ipcRenderer.invoke("desktop.connection.reset"),
    useRecent: (url) => ipcRenderer.invoke("desktop.connection.useRecent", url),
    copyDiagnostics: () => ipcRenderer.invoke("desktop.connection.copyDiagnostics"),
    status: () => ipcRenderer.invoke("desktop.connection.status"),
  },
});
