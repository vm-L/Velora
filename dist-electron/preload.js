"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => electron.ipcRenderer.send("window-minimize"),
  maximize: () => electron.ipcRenderer.send("window-maximize"),
  close: () => electron.ipcRenderer.send("window-close"),
  onWindowMaximized: (callback) => electron.ipcRenderer.on("window-maximized", () => callback()),
  onWindowUnmaximized: (callback) => electron.ipcRenderer.on("window-unmaximized", () => callback()),
  setSetting: (key, value) => electron.ipcRenderer.send("set-setting", key, value),
  getSetting: (key) => electron.ipcRenderer.invoke("get-setting", key),
  setCloseBehavior: (behavior) => electron.ipcRenderer.send("set-setting", "closeBehavior", behavior),
  getCloseBehavior: () => electron.ipcRenderer.invoke("get-setting", "closeBehavior"),
  onWebviewNewWindow: (callback) => {
    electron.ipcRenderer.removeAllListeners("webview-new-window");
    electron.ipcRenderer.on("webview-new-window", (_event, url) => callback(url));
  }
});
