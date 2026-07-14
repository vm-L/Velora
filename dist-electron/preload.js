"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => electron.ipcRenderer.send("window-minimize"),
  maximize: () => electron.ipcRenderer.send("window-maximize"),
  close: () => electron.ipcRenderer.send("window-close"),
  onWindowMaximized: (callback) => electron.ipcRenderer.on("window-maximized", () => callback()),
  onWindowUnmaximized: (callback) => electron.ipcRenderer.on("window-unmaximized", () => callback()),
  setCloseBehavior: (behavior) => electron.ipcRenderer.send("set-setting", "closeBehavior", behavior),
  getCloseBehavior: () => electron.ipcRenderer.invoke("get-setting", "closeBehavior")
});
