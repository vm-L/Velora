"use strict";
const electron = require("electron");
const path = require("path");
class StoreManager {
  constructor() {
    this.store = null;
    this.initPromise = this.init();
  }
  async init() {
    const { default: Store } = await Promise.resolve().then(() => require("./index-DkEF5WSi.js"));
    this.store = new Store({
      defaults: {
        closeBehavior: "tray",
        cmsResources: [],
        externalSites: []
      }
    });
  }
  async getSetting(key) {
    await this.initPromise;
    return this.store.get(key);
  }
  async setSetting(key, value) {
    await this.initPromise;
    this.store.set(key, value);
  }
}
const storeManager = new StoreManager();
function setupStoreHandlers() {
  electron.ipcMain.handle("get-setting", async (_, key) => {
    return await storeManager.getSetting(key);
  });
  electron.ipcMain.on("set-setting", async (_, key, value) => {
    await storeManager.setSetting(key, value);
  });
}
process.env.DIST_ELECTRON = path.join(__dirname, "..");
process.env.DIST = path.join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? path.join(process.env.DIST_ELECTRON, "../public") : process.env.DIST;
let tray = null;
let mainWindow = null;
const iconBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVDhPY/iPBoB0AOP///8xpE2D0RgagEEoMIIGRA8MA2EwhgbgNQChwAhgBwMDAB1eF1y5w6OaAAAAAElFTkSuQmCC";
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    title: "Hello Electron",
    autoHideMenuBar: true,
    frame: false,
    hasShadow: false,
    show: false,
    backgroundColor: "#f5f7fa",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true
    }
  });
  electron.ipcMain.on("window-minimize", () => {
    mainWindow == null ? void 0 : mainWindow.minimize();
  });
  electron.ipcMain.on("window-maximize", () => {
    if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
  });
  mainWindow.on("maximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window-maximized");
  });
  mainWindow.on("unmaximize", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("window-unmaximized");
  });
  electron.ipcMain.on("window-close", async () => {
    const behavior = await storeManager.getSetting("closeBehavior");
    if (behavior === "tray") {
      mainWindow == null ? void 0 : mainWindow.hide();
    } else {
      electron.app.quit();
    }
  });
  electron.ipcMain.on("open-external", (_, url) => {
    electron.shell.openExternal(url);
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST, "index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
}
electron.app.whenReady().then(() => {
  setupStoreHandlers();
  createWindow();
  const trayIcon = electron.nativeImage.createFromDataURL(iconBase64);
  tray = new electron.Tray(trayIcon);
  const contextMenu = electron.Menu.buildFromTemplate([
    { label: "显示应用", click: () => {
      if (mainWindow) mainWindow.show();
    } },
    { type: "separator" },
    { label: "完全退出", click: () => {
      electron.app.quit();
    } }
  ]);
  tray.setToolTip("Hello Electron");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) mainWindow.show();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("web-contents-created", (event, contents) => {
  if (contents.getType() === "webview") {
    contents.setWindowOpenHandler((details) => {
      mainWindow == null ? void 0 : mainWindow.webContents.send("webview-new-window", details.url);
      return { action: "deny" };
    });
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
