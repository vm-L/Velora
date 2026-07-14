import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

// Create a polyfill for __dirname in ESM if needed, though we are compiling via vite-plugin-electron which handles __dirname if we use standard CJS/ESM mixed. 
// However, standard electron vite plugin setup allows CJS. Let's stick to CJS-like paths or use path.join(process.env.DIST, ...)

process.env.DIST_ELECTRON = path.join(__dirname, '..')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

import { storeManager, setupStoreHandlers } from './store'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVDhPY/iPBoB0AOP///8xpE2D0RgagEEoMIIGRA8MA2EwhgbgNQChwAhgBwMDAB1eF1y5w6OaAAAAAElFTkSuQmCC'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    title: "Hello Electron",
    autoHideMenuBar: true,
    frame: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#f5f7fa',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized')
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized')
  })

  ipcMain.on('window-close', async () => {
    const behavior = await storeManager.getSetting('closeBehavior')
    if (behavior === 'tray') {
      mainWindow?.hide()
    } else {
      app.quit()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

app.whenReady().then(() => {
  setupStoreHandlers()
  createWindow()

  const trayIcon = nativeImage.createFromDataURL(iconBase64)
  tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示应用', click: () => { if (mainWindow) mainWindow.show() } },
    { type: 'separator' },
    { label: '完全退出', click: () => { app.quit() } }
  ])
  tray.setToolTip('Hello Electron')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => { if (mainWindow) mainWindow.show() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
