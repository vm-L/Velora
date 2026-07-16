import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session, clipboard, net, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Create a polyfill for __dirname in ESM if needed, though we are compiling via vite-plugin-electron which handles __dirname if we use standard CJS/ESM mixed. 
// However, standard electron vite plugin setup allows CJS. Let's stick to CJS-like paths or use path.join(process.env.DIST, ...)

process.env.DIST_ELECTRON = path.join(__dirname, '..')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

import { storeManager, setupStoreHandlers } from './store'
import { downloader } from './downloader'

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
      webviewTag: true
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

  ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url)
  })

  ipcMain.on('show-item-in-folder', (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('copy-image', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: { 'Referer': '' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      const image = nativeImage.createFromBuffer(Buffer.from(buffer))
      clipboard.writeImage(image)
      return true
    } catch (e: any) {
      console.error('Failed to copy image:', e)
      return false
    }
  })

  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (canceled) return undefined
    return filePaths[0]
  })

  ipcMain.handle('save-images', async (_, dirPath: string, files: { url: string, name: string }[]) => {
    const results = []
    for (const file of files) {
      try {
        const response = await net.fetch(file.url, { headers: { 'Referer': '' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await response.arrayBuffer()
        const savePath = path.join(dirPath, file.name)
        await fs.promises.writeFile(savePath, Buffer.from(buffer))
        results.push({ url: file.url, success: true, path: savePath })
      } catch (e: any) {
        console.error('Failed to save image:', file.url, e)
        results.push({ url: file.url, success: false, error: e.message })
      }
    }
    return results
  })

  // Downloader IPCs
  downloader.setWindow(mainWindow)
  
  ipcMain.on('start-download', (_, cmd) => {
    downloader.startDownload(cmd)
  })

  ipcMain.on('pause-download', (_, id: string) => {
    downloader.pauseDownload(id)
  })

  ipcMain.on('cancel-download', (_, id: string) => {
    downloader.cancelDownload(id)
  })

  ipcMain.handle('delete-file', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
        return true
      }
    } catch (e) {
      console.error('Failed to delete file:', e)
    }
    return false
  })

  ipcMain.handle('file-exists', async (_, filePath: string) => {
    return fs.existsSync(filePath)
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

  // Network Sniffer
  session.defaultSession.webRequest.onResponseStarted(
    { urls: ['*://*/*'] },
    (details) => {
      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') return;

      let url = details.url;
      const lowerUrl = url.toLowerCase();
      let type = '';

      const isImage = details.resourceType === 'image' || lowerUrl.match(/\.(png|jpe?g|gif|webp|svg|ico)(\?.*)?$/i);
      const isVideo = details.resourceType === 'media' || lowerUrl.match(/\.(mp4|webm|ogg|m3u8|ts|flv|mp3|wav)(\?.*)?$/i);

      let contentType = '';
      if (details.responseHeaders) {
        for (const key in details.responseHeaders) {
          if (key.toLowerCase() === 'content-type') {
            contentType = details.responseHeaders[key][0].toLowerCase();
            break;
          }
        }
      }

      if (isImage || contentType.startsWith('image/')) type = 'image';
      else if (isVideo || contentType.startsWith('video/') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegurl') || contentType.includes('application/vnd.apple.mpegurl')) type = 'video';

      if (type === 'image') {
        // 去除 query 参数、fragment 和 @ 后的内容，只保留最短可访问地址
        try {
          const parsed = new URL(url);
          url = parsed.origin + parsed.pathname;
        } catch {}
        const atIndex = url.indexOf('@');
        if (atIndex !== -1) url = url.substring(0, atIndex);
      }

      if (type && mainWindow) {
        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        });
      }
    }
  )
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

app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler((details) => {
      mainWindow?.webContents.send('webview-new-window', details.url)
      return { action: 'deny' }
    })

    contents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'F5') {
          contents.reload()
          e.preventDefault()
        } else if (input.key === 'F12') {
          if (contents.isDevToolsOpened()) {
            contents.closeDevTools()
          } else {
            contents.openDevTools()
          }
          e.preventDefault()
        }
      }
    })
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
