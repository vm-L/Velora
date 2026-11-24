import { app, BrowserWindow, nativeImage, session } from 'electron'
import fs from 'fs'
import path from 'path'
import { downloader } from '../downloader'
import { logger } from '../logger'
import { isSitePartition } from '../siteSession'
import { getSplashHtml } from '../splash'
import { resolveAppIcoPath, resolveAppIconPath } from '../utils/fileSystem'
import { setupNetworkInterceptors } from './networkInterceptors'

export interface FileSystemChangeEvent {
  type: 'add' | 'delete' | 'rename' | 'move' | 'overwrite' | 'sync-dir'
  name?: string
  path?: string
  oldPath?: string
  newPath?: string
  isDirectory?: boolean
  dirPath?: string
  files?: Array<{ name: string; path: string }>
}

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let splashStartTime = 0
let isFirstScreenReady = false

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getIsFirstScreenReady(): boolean {
  return isFirstScreenReady
}

export function broadcastFileSystemChange(event: FileSystemChangeEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('file-system-changed', event)
    } catch (err: any) {
      logger.warn('Main', `Failed to broadcast file-system-changed: ${err.message}`)
    }
  }
}

let cachedIconBase64: string | null = null
export const getIconDataUrl = (): string => {
  if (cachedIconBase64) return cachedIconBase64
  const icoPath = resolveAppIcoPath()
  if (icoPath) {
    try {
      const buf = fs.readFileSync(icoPath)
      if (buf && buf.length > 0) {
        cachedIconBase64 = `data:image/x-icon;base64,${buf.toString('base64')}`
        return cachedIconBase64
      }
    } catch {}
  }
  const pngPath = resolveAppIconPath()
  if (pngPath) {
    try {
      const buf = fs.readFileSync(pngPath)
      if (buf && buf.length > 0) {
        cachedIconBase64 = `data:image/png;base64,${buf.toString('base64')}`
        return cachedIconBase64
      }
    } catch {}
  }
  return ''
}

let cachedAppIcon: Electron.NativeImage | null = null
export const getAppIcon = (): Electron.NativeImage => {
  if (cachedAppIcon && !cachedAppIcon.isEmpty()) return cachedAppIcon
  const icoPath = resolveAppIcoPath()
  if (icoPath) {
    const img = nativeImage.createFromPath(icoPath)
    if (!img.isEmpty()) {
      cachedAppIcon = img
      return cachedAppIcon
    }
  }
  const pngPath = resolveAppIconPath()
  if (pngPath) {
    const img = nativeImage.createFromPath(pngPath)
    if (!img.isEmpty()) {
      cachedAppIcon = img
      return cachedAppIcon
    }
  }
  const fallbackUrl = getIconDataUrl()
  const fallbackImg = fallbackUrl ? nativeImage.createFromDataURL(fallbackUrl) : nativeImage.createEmpty()
  if (!fallbackImg.isEmpty()) {
    cachedAppIcon = fallbackImg
  }
  return fallbackImg
}

export function createSplashWindow(theme: string = 'light'): void {
  splashStartTime = Date.now()
  const icoPath = resolveAppIcoPath()
  const appIcon = getAppIcon()
  splashWindow = new BrowserWindow({
    width: 380,
    height: 240,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    backgroundColor: '#00000000',
    icon: (process.platform === 'win32' && icoPath) ? icoPath : appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const iconDataUrl = getIconDataUrl()
  const version = typeof app.getVersion === 'function' ? app.getVersion() : '1.4.3'
  const html = getSplashHtml(theme, iconDataUrl, version)
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed() && !isFirstScreenReady) {
      splashWindow.show()
    }
  })
}

export function updateSplashTheme(theme: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  splashWindow.webContents.executeJavaScript(`
    window.setTheme && window.setTheme(${JSON.stringify(theme)});
  `).catch(() => {})
}

export function finishStartupAndShowMain(): void {
  if (isFirstScreenReady) return
  isFirstScreenReady = true

  const elapsed = Date.now() - splashStartTime
  const minDisplayTime = 300 // 保底展示 300ms
  const remainingWait = Math.max(0, minDisplayTime - elapsed)

  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.executeJavaScript(`
        document.body.classList.add('fade-out');
      `).catch(() => {})

      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.destroy()
          splashWindow = null
        }
      }, 250) // 淡出动画过渡时长
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  }, remainingWait)
}

export function createWindow(): void {
  const icoPath = resolveAppIcoPath()
  const appIcon = getAppIcon()
  const distElectron = process.env.DIST_ELECTRON || path.resolve(__dirname, '..')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    resizable: true,
    title: 'Velora',
    icon: (process.platform === 'win32' && icoPath) ? icoPath : appIcon,
    autoHideMenuBar: true,
    frame: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#FDFBF7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(distElectron, 'preload.js'),
      webviewTag: true
    }
  })

  downloader.setWindow(mainWindow)

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized')
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-unmaximized')
  })

  mainWindow.webContents.on('enter-html-full-screen', () => {
    mainWindow?.setFullScreen(true)
  })

  mainWindow.webContents.on('leave-html-full-screen', () => {
    mainWindow?.setFullScreen(false)
  })

  mainWindow.webContents.on('will-attach-webview', (_event, _webPreferences, params) => {
    if (isSitePartition(params.partition)) {
      setupNetworkInterceptors(session.fromPartition(params.partition))
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    downloader.setWindow(null)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }
}
