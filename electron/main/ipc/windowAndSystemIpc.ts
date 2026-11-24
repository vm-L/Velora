import { app, BrowserWindow, dialog, ipcMain, shell, webContents } from 'electron'
import fs from 'fs'
import { logger } from '../../logger'
import { clearSiteSessionData, type SiteCacheClearScope } from '../../siteSession'
import { storeManager } from '../../store'
import { getMediaServerToken, getStreamServerPort } from '../mediaStreamServer'
import { finishStartupAndShowMain, getMainWindow } from '../windowManager'

export function registerWindowAndSystemIpc(): void {
  ipcMain.on('window-minimize', () => {
    getMainWindow()?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    const win = getMainWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window-close', async () => {
    const behavior = await storeManager.getSetting('closeBehavior')
    if (behavior === 'tray') {
      getMainWindow()?.hide()
    } else {
      app.quit()
    }
  })

  ipcMain.on('app-first-screen-ready', () => {
    finishStartupAndShowMain()
  })

  ipcMain.on('open-external', (_, url) => {
    try {
      const parsed = new URL(String(url || ''))
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(parsed.toString())
      } else {
        logger.warn('Security', `Blocked openExternal with disallowed protocol: ${parsed.protocol}`)
      }
    } catch {}
  })

  ipcMain.on('show-item-in-folder', (_, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('pause-webview', (_, id) => {
    const wc = webContents.fromId(id)
    if (wc) {
      wc.mainFrame.frames.forEach(frame => {
        frame.executeJavaScript('document.querySelectorAll("video").forEach(v => v.pause())').catch(() => {})
      })
    }
  })

  ipcMain.handle('resume-webview', (_, id) => {
    const wc = webContents.fromId(id)
    if (wc) {
      wc.mainFrame.frames.forEach(frame => {
        frame.executeJavaScript('document.querySelectorAll("video").forEach(v => v.play())').catch(() => {})
      })
    }
  })

  ipcMain.handle('get-server-port', () => getStreamServerPort())
  ipcMain.handle('get-server-info', () => ({ port: getStreamServerPort(), token: getMediaServerToken() }))

  ipcMain.handle('open-file', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, code: 'NOT_FOUND' }
      }
      const err = await shell.openPath(filePath)
      if (err) {
        return { success: false, code: 'OPEN_FAILED', error: err }
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, code: 'ERROR', error: e.message }
    }
  })

  ipcMain.handle('select-directory', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (canceled) return undefined
    return filePaths[0]
  })

  ipcMain.handle('show-save-dialog', async (event, options: { defaultPath?: string; title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      return await dialog.showSaveDialog(options)
    }
    return await dialog.showSaveDialog(win, options)
  })

  ipcMain.on('log-message', (_, { level, scope, message }: { level: 'info' | 'warn' | 'error' | 'perf'; scope: string; message: string }) => {
    logger[level || 'info'](scope || 'Renderer', message || '')
  })

  ipcMain.handle('export-resources-json', async (_event, data: any) => {
    try {
      const defaultFilename = data?.type === 'velora-config-backup'
        ? `velora-config-backup-${new Date().toISOString().slice(0, 10)}.json`
        : `velora-resources-backup-${new Date().toISOString().slice(0, 10)}.json`

      const { filePath } = await dialog.showSaveDialog({
        title: '导出 Velora 配置文件',
        defaultPath: defaultFilename,
        filters: [{ name: 'JSON 备份文件 (*.json)', extensions: ['json'] }]
      })
      if (!filePath) return { success: false, cancelled: true }
      const jsonStr = JSON.stringify(data, null, 2)
      await fs.promises.writeFile(filePath, jsonStr, 'utf-8')
      return { success: true, filePath }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  ipcMain.handle('import-resources-json', async () => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: '选择要导入的 Velora JSON 备份文件',
        filters: [{ name: 'JSON 备份文件 (*.json)', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, cancelled: true }
      }
      const content = await fs.promises.readFile(filePaths[0], 'utf-8')
      const data = JSON.parse(content)
      if (!data || (data.type !== 'velora-resource-backup' && data.type !== 'velora-config-backup')) {
        return { success: false, error: '无效的备份文件：缺失 velora-config-backup / velora-resource-backup 校验标识' }
      }
      return { success: true, data }
    } catch (err: any) {
      return { success: false, error: `读取解析备份文件失败: ${err.message || String(err)}` }
    }
  })

  ipcMain.handle('clear-site-cache', async (_event, resourceId: string, scopes: SiteCacheClearScope[]) => {
    return await clearSiteSessionData(resourceId, scopes)
  })

  ipcMain.handle('silent-parse-html', async (_event, targetUrl: string, scripts?: string[], evalExprs?: string[]) => {
    try {
      if (!targetUrl) {
        return { success: false, error: '目标链接不能为空' }
      }
      let parsedTarget: URL
      try {
        parsedTarget = new URL(String(targetUrl))
      } catch {
        return { success: false, error: '目标链接格式无效' }
      }
      if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
        return { success: false, error: `不支持的协议: ${parsedTarget.protocol}` }
      }

      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webSecurity: false
        }
      })

      let isResolved = false

      return new Promise<{ success: boolean; html?: string; evaluatedVars?: Record<string, any>; error?: string }>((resolve) => {
        const cleanup = () => {
          if (!win.isDestroyed()) {
            win.destroy()
          }
        }

        const timer = setTimeout(() => {
          if (!isResolved) {
            isResolved = true
            cleanup()
            resolve({ success: false, error: '页面加载超时 (15s)' })
          }
        }, 15000)

        win.webContents.on('did-finish-load', async () => {
          if (isResolved) return
          try {
            // 匹配并顺序执行传入的 JS 脚本
            if (Array.isArray(scripts) && scripts.length > 0) {
              for (const scriptCode of scripts) {
                if (scriptCode && scriptCode.trim()) {
                  try {
                    await win.webContents.executeJavaScript(scriptCode)
                  } catch (scriptErr: any) {
                    logger.error('Parser', `[silent-parse-html] 执行自定义 JS 脚本发生错误: ${scriptErr?.message || scriptErr}`)
                  }
                }
              }
            }

            // 求值全局变量表达式
            const evaluatedVars: Record<string, any> = {}
            if (Array.isArray(evalExprs) && evalExprs.length > 0) {
              for (const expr of evalExprs) {
                if (expr && expr.trim()) {
                  try {
                    evaluatedVars[expr] = await win.webContents.executeJavaScript(expr)
                  } catch {
                    evaluatedVars[expr] = null
                  }
                }
              }
            }

            const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
            isResolved = true
            clearTimeout(timer)
            cleanup()
            resolve({ success: true, html, evaluatedVars })
          } catch (err: any) {
            if (!isResolved) {
              isResolved = true
              clearTimeout(timer)
              cleanup()
              resolve({ success: false, error: err.message })
            }
          }
        })

        win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
          if (isResolved) return
          if (errorCode === -3) return // ignore ABORTED
          isResolved = true
          clearTimeout(timer)
          cleanup()
          resolve({ success: false, error: `加载失败: ${errorDescription} (${errorCode})` })
        })

        win.loadURL(targetUrl).catch((err) => {
          if (!isResolved) {
            isResolved = true
            clearTimeout(timer)
            cleanup()
            resolve({ success: false, error: err.message })
          }
        })
      })
    } catch (err: any) {
      logger.error('Main', `Silent parse error for ${targetUrl}: ${err.message}`)
      return { success: false, error: err.message }
    }
  })
}
