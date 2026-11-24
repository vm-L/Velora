import './main/bootstrap'
import { app, BrowserWindow, Tray, nativeImage, nativeTheme } from 'electron'
import { exec } from 'child_process'
import path from 'path'
import { downloader } from './downloader'
import { logger } from './logger'
import { panAccountManager } from './pan/accountManager'
import { setupStoreHandlers, storeManager } from './store'
import { setupTrayTooltip, type TrayTooltipGuard } from './trayTooltip'
import { trayWindowManager } from './trayWindow'
import { resolveAppIcoPath } from './utils/fileSystem'
import { cleanupAppTempDir } from './videoEditor'
import { setupIpcHandlers } from './main/ipc'
import { initOrRestartLanServer } from './main/ipc/videoAndLanIpc'
import { releaseLocalMediaStreams, startMediaStreamServer } from './main/mediaStreamServer'
import {
  clientManager,
  setNetworkMainWindowProvider,
  setupNetworkInterceptors,
  trackWebContentsNavigation,
  type VeloraClientConfig
} from './main/networkInterceptors'
import {
  broadcastFileSystemChange,
  createSplashWindow,
  createWindow,
  type FileSystemChangeEvent,
  finishStartupAndShowMain,
  getAppIcon,
  getIconDataUrl,
  getIsFirstScreenReady,
  getMainWindow,
  updateSplashTheme
} from './main/windowManager'

export { releaseLocalMediaStreams, broadcastFileSystemChange, clientManager }
export type { FileSystemChangeEvent, VeloraClientConfig }

process.env.DIST_ELECTRON = __dirname
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

setNetworkMainWindowProvider(getMainWindow)
startMediaStreamServer()

let tray: Tray | null = null
let trayTooltipGuard: TrayTooltipGuard | null = null

app.whenReady().then(async () => {
  // 0. 延迟加载已保存的网盘账号凭据（确保 safeStorage 密钥链已完全就绪），并清理临时目录历史孤儿文件
  panAccountManager.ensureLoaded()
  cleanupAppTempDir()

  // 1. 【最高优先级】瞬间秒开 Splash 悬浮卡片（0ms 阻塞，依据系统明暗色偏好极速呈现）
  const initialTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  createSplashWindow(initialTheme)

  // 2. 初始化核心存储、IPC 通道与网络拦截器
  setupStoreHandlers()
  setupIpcHandlers()
  setupNetworkInterceptors()

  // 3. 读取用户主题配置并平滑同步至 Splash（若与系统偏好不一致）
  storeManager.getSetting('theme').then((savedTheme) => {
    if (savedTheme && savedTheme !== initialTheme) {
      updateSplashTheme(savedTheme)
    }
  }).catch(() => {})

  // 4. 后台非阻塞环境检测与局域网服务
  initOrRestartLanServer().catch((err) => {
    logger.error('Main', `Failed to initialize LAN server: ${err.message}`)
  })

  // 自动检测系统环境变量中是否存在 ffmpeg (异步非阻塞)
  exec('ffmpeg -version', (error) => {
    if (error) {
      logger.warn('System', 'FFmpeg is not detected in system PATH.')
    } else {
      logger.info('System', 'FFmpeg is correctly installed and accessible.')
    }
  })

  // 5. 装载应用主窗口与工作区
  createWindow()

  // 6. 安全熔断保底：若渲染进程因异常未在 5 秒内通知就绪，强制淡出 Splash 展示主窗口
  setTimeout(() => {
    if (!getIsFirstScreenReady()) {
      logger.warn('Main', '首屏就绪通知超时，触发安全熔断保底显示主窗口')
      finishStartupAndShowMain()
    }
  }, 5000)

  const icoPath = resolveAppIcoPath()
  const appIcon = getAppIcon()
  let trayIcon: Electron.NativeImage | string
  if (process.platform === 'win32' && icoPath) {
    trayIcon = icoPath
  } else if (!appIcon.isEmpty()) {
    trayIcon = appIcon.resize({ width: 16, height: 16 })
  } else {
    const fallbackUrl = getIconDataUrl()
    trayIcon = fallbackUrl ? nativeImage.createFromDataURL(fallbackUrl) : nativeImage.createEmpty()
  }
  tray = new Tray(trayIcon)
  trayTooltipGuard = setupTrayTooltip(tray, 'Velora')
  tray.on('click', () => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  const savedUserTheme = (await storeManager.getSetting('theme')) || (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  trayWindowManager.init(tray, {
    onShowApp: () => {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    },
    onResumeAll: () => {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tray-resume-all')
      }
    },
    onPauseAll: () => {
      downloader.pauseAll()
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tray-pause-all')
      }
    },
    onQuitApp: () => {
      app.quit()
    },
    getTaskStats: () => {
      return downloader.getTaskStats()
    }
  }, savedUserTheme)

  // 监听主题配置变更，动态同步至托盘浮窗
  storeManager.onSettingChange((key, value) => {
    if (key === 'theme') {
      trayWindowManager.updateTheme(value)
    }
  })

  // 监听原生系统明暗色偏好变化
  nativeTheme.on('updated', () => {
    storeManager.getSetting('theme').then((t) => {
      if (!t) {
        trayWindowManager.updateTheme(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
      }
    })
  })

  // 托盘动态状态节流调度
  let trayUpdateTimer: NodeJS.Timeout | null = null
  const updateTrayStatsThrottled = () => {
    const stats = downloader.getTaskStats()
    trayWindowManager.updateStats(stats)

    const isBusy = (stats.downloadingCount > 0 || stats.queuedCount > 0 || stats.compressingCount > 0 || stats.speed > 0)
    if (isBusy && !trayUpdateTimer) {
      trayUpdateTimer = setInterval(() => {
        const currentStats = downloader.getTaskStats()
        trayWindowManager.updateStats(currentStats)
        if (currentStats.downloadingCount === 0 && currentStats.queuedCount === 0 && currentStats.compressingCount === 0 && currentStats.speed === 0) {
          if (trayUpdateTimer) {
            clearInterval(trayUpdateTimer)
            trayUpdateTimer = null
          }
        }
      }, 1000)
    }
  }

  downloader.setOnStatsChange(() => {
    updateTrayStatsThrottled()
  })
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
    try {
      trayTooltipGuard?.dispose()
      trayTooltipGuard = null
    } catch {}
    try {
      if (tray && !tray.isDestroyed()) {
        tray.destroy()
      }
    } catch {}
    try {
      storeManager.flushSync()
    } catch {}
    try {
      logger.flushSync()
    } catch {}
    app.exit(0)
  }
})

app.on('web-contents-created', (_, contents) => {
  trackWebContentsNavigation(contents)

  contents.on('before-input-event', (e, input) => {
    if (input.key === 'F12') {
      e.preventDefault()
    }
  })

  if (contents.getType() === 'webview') {
    setupNetworkInterceptors(contents.session)

    contents.on('enter-html-full-screen', () => {
      getMainWindow()?.setFullScreen(true)
    })

    contents.on('leave-html-full-screen', () => {
      getMainWindow()?.setFullScreen(false)
    })

    contents.setWindowOpenHandler((details) => {
      getMainWindow()?.webContents.send('webview-new-window', { url: details.url, webContentsId: contents.id })
      return { action: 'deny' }
    })
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
