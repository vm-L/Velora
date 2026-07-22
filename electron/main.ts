import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session, clipboard, net, dialog, protocol } from 'electron'
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
import { downloader, logToFile } from './downloader'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVDhPY/iPBoB0AOP///8xpE2D0RgagEEoMIIGRA8MA2EwhgbgNQChwAhgBwMDAB1eF1y5w6OaAAAAAElFTkSuQmCC'

const clearPrivacyData = async () => {
  try {
    await session.defaultSession.clearCache()
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'websql', 'cachestorage', 'serviceworkers']
    })
    logToFile('[Privacy] Browser cache and storage data (excluding IndexedDB) cleared successfully.')
  } catch (e: any) {
    logToFile(`[Privacy] Failed to clear privacy data: ${e.message}`)
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    resizable: true,
    title: "Velora",
    autoHideMenuBar: true,
    frame: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#FDFBF7',
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

  ipcMain.handle('open-file', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, code: 'NOT_FOUND' };
      }
      const err = await shell.openPath(filePath);
      if (err) {
        return { success: false, code: 'OPEN_FAILED', error: err };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, code: 'ERROR', error: e.message };
    }
  })

  ipcMain.handle('fetch-image-base64', async (_, url: string) => {
    try {
      const response = await net.fetch(url, { headers: { 'Referer': '' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      let contentType = response.headers.get('content-type') || 'image/x-icon'
      if (contentType.includes(';')) contentType = contentType.split(';')[0]
      const base64 = Buffer.from(buffer).toString('base64')
      return `data:${contentType};base64,${base64}`
    } catch (e: any) {
      console.error('Failed to fetch image base64:', e)
      return null
    }
  })

  ipcMain.handle('fetch-url', async (_, url: string) => {
    try {
      const response = await net.fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    } catch (e: any) {
      console.error('Failed to fetch url:', e)
      return { success: false, error: e.message }
    }
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
  
  ipcMain.on('write-log', (_, message: string) => {
    logToFile(message)
  })
  
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

  // Network Sniffer - Early detection for cached media via extension
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        return callback({});
      }

      let url = details.url;
      let pathname = '';
      try {
        pathname = new URL(url).pathname.toLowerCase();
      } catch {
        pathname = url.split('?')[0].toLowerCase();
      }
      let type = '';

      if (pathname.endsWith('.m4s') || pathname.endsWith('.mpd') || pathname.endsWith('.ts')) {
        return callback({});
      }

      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|mkv|avi)$/i);

      if (isAudioExt) type = 'audio';
      else if (isVideoExt) type = 'video';

      if (type && mainWindow) {
        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        });
      }

      callback({});
    }
  )

  // Network Sniffer - Catch by Headers
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*/*'] },
    (details, callback) => {
      if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame' || details.resourceType === 'script' || details.resourceType === 'stylesheet') {
        return callback({});
      }

      let url = details.url;
      let pathname = '';
      try {
        pathname = new URL(url).pathname.toLowerCase();
      } catch {
        pathname = url.split('?')[0].toLowerCase();
      }
      let type = '';

      const isImageExt = pathname.match(/\.(png|jpe?g|gif|webp|svg|ico)$/i);
      const isAudioExt = pathname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
      const isVideoExt = pathname.match(/\.(mp4|webm|m3u8|flv|mkv|avi)$/i);

      // Require a whitelisted suffix, otherwise block/ignore from sniffing
      if (!isImageExt && !isAudioExt && !isVideoExt) {
        return callback({});
      }

      if (pathname.endsWith('.m4s') || pathname.endsWith('.mpd') || pathname.endsWith('.ts')) {
        return callback({});
      }

      let contentType = '';
      if (details.responseHeaders) {
        for (const key in details.responseHeaders) {
          if (key.toLowerCase() === 'content-type') {
            contentType = details.responseHeaders[key][0].toLowerCase();
            break;
          }
        }
      }

      const audioMimeWhitelist = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/mp4'];
      const videoMimeWhitelist = ['video/mp4', 'video/webm', 'video/x-flv', 'video/avi', 'video/mpeg', 'application/x-mpegurl', 'application/vnd.apple.mpegurl'];
      const imageMimeWhitelist = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];

      if (isImageExt && (details.resourceType === 'image' || imageMimeWhitelist.some(mime => contentType.startsWith(mime)))) {
        type = 'image';
      } else if (isAudioExt && audioMimeWhitelist.some(mime => contentType.startsWith(mime))) {
        type = 'audio';
      } else if (isVideoExt && videoMimeWhitelist.some(mime => contentType.startsWith(mime) || contentType.includes('mpegurl'))) {
        type = 'video';
      }

      if (type === 'image') {
        // 保留 query 参数，但去除 @ 后的缩放等特殊后缀
        try {
          const parsed = new URL(url);
          url = parsed.origin + parsed.pathname;
          const atIndex = url.indexOf('@');
          if (atIndex !== -1) url = url.substring(0, atIndex);
          url += parsed.search; // Retain query parameters
        } catch {}
      }

      if (type && mainWindow) {
        mainWindow.webContents.send('media-sniffed', {
          webContentsId: details.webContentsId,
          url,
          type,
          timestamp: Date.now()
        });
      }

      callback({});
    }
  )
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'velora', privileges: { secure: true, bypassCSP: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

app.whenReady().then(async () => {
  protocol.handle('velora', (request) => {
    logToFile(`[Protocol velora] Raw request url: ${request.url}`)
    let prefix = request.url.startsWith('velora://local/') ? 'velora://local/' : 'velora://'
    let filePath = decodeURIComponent(request.url.slice(prefix.length))
    logToFile(`[Protocol velora] Decoded path before processing: ${filePath}`)
    
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1) // Remove leading slash on Windows (e.g. /C:/foo -> C:/foo)
    }
    const { pathToFileURL } = require('url');
    const finalUrl = pathToFileURL(filePath).toString();
    logToFile(`[Protocol velora] Final path: ${filePath} -> File URL: ${finalUrl}`)
    
    return net.fetch(finalUrl)
  })

  await clearPrivacyData()
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

let isQuitting = false
app.on('before-quit', (e) => {
  if (!isQuitting) {
    e.preventDefault()
    isQuitting = true
    clearPrivacyData().finally(() => {
      app.exit(0)
    })
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
