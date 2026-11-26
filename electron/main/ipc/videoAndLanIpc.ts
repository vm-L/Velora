import { BrowserWindow, clipboard, ipcMain, nativeImage } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fetchRemoteRuleSource, parseRulesText, saveRuleCacheFile, updateCompiledRules } from '../../adblock'
import { lanServer, type LanDownloadCommand, type LanDownloadCommandResult } from '../../lanServer'
import { logger } from '../../logger'
import { storeManager } from '../../store'
import {
  cancelVideoEdit,
  cancelVideoMerge,
  type EditVideoParams,
  editVideoSegments,
  type MergeVideosParams,
  mergeVideos,
  resolveUniqueOutputPath
} from '../../videoEditor'
import { videoTaskManager, type VideoTaskType } from '../../videoTaskManager'
import { releaseLocalMediaStreams } from '../mediaStreamServer'
import { broadcastFileSystemChange, getMainWindow } from '../windowManager'

const pendingLanDownloadCommands = new Map<
  string,
  { resolve: (res: LanDownloadCommandResult) => void; timer: NodeJS.Timeout }
>()

const dispatchLanDownloadCommandToRenderer = (
  command: LanDownloadCommand
): Promise<LanDownloadCommandResult> => {
  const win = getMainWindow() || BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (!win || win.isDestroyed()) {
    return Promise.resolve({ success: false, error: '桌面主窗口未就绪，无法下发下载指令' })
  }
  const reqId = `lan_dl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingLanDownloadCommands.delete(reqId)
      resolve({ success: false, error: '桌面端处理下载指令超时' })
    }, 10000)
    pendingLanDownloadCommands.set(reqId, { resolve, timer })
    win.webContents.send('lan-download-command', { reqId, command })
  })
}

export const getMountedLocalResources = async () => {
  const localRes = await storeManager.getSetting('localResources')
  if (Array.isArray(localRes)) {
    return localRes.map((r: any) => ({ id: r.id, name: r.name, path: r.path }))
  }
  return []
}

export const initOrRestartLanServer = async () => {
  lanServer.setFileSystemChangeCallback(broadcastFileSystemChange)
  lanServer.setReleaseMediaStreamsCallback(releaseLocalMediaStreams)
  lanServer.setDownloadCommandCallback(dispatchLanDownloadCommandToRenderer)
  const enabled = await storeManager.getSetting('lanShareEnabled')
  if (!enabled) {
    await lanServer.stop()
    return { success: true, running: false }
  }
  const port = (await storeManager.getSetting('lanSharePort')) || 8899
  const password = (await storeManager.getSetting('lanSharePassword')) || ''
  const allowEdit = (await storeManager.getSetting('lanShareAllowEdit')) || false
  return await lanServer.start({
    enabled: true,
    port,
    password,
    allowEdit
  }, getMountedLocalResources, broadcastFileSystemChange)
}

export function registerVideoAndLanIpc(): void {
  ipcMain.handle('get-lan-share-status', async () => {
    return lanServer.getStatus()
  })

  ipcMain.handle('restart-lan-server', async () => {
    return await initOrRestartLanServer()
  })

  ipcMain.handle('stop-lan-server', async () => {
    await lanServer.stop()
    return { success: true }
  })

  ipcMain.on('lan-sync-download-tasks', (_event, tasks: any[]) => {
    lanServer.updateDownloadTasksSnapshot(Array.isArray(tasks) ? tasks : [])
  })

  ipcMain.on('lan-download-command-result', (_event, payload: { reqId: string; result: LanDownloadCommandResult }) => {
    const reqId = payload?.reqId
    if (!reqId) return
    const pending = pendingLanDownloadCommands.get(reqId)
    if (!pending) return
    clearTimeout(pending.timer)
    pendingLanDownloadCommands.delete(reqId)
    pending.resolve(payload.result || { success: false, error: '未知执行结果' })
  })

  // 全局视频任务队列监听与多端广播
  videoTaskManager.onStateChange((state) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('video-queue-state-changed', state)
      }
    })
    lanServer.broadcastTaskQueueState(state)
  })

  videoTaskManager.onTaskFinish((task, success, outputPath) => {
    if (success && outputPath) {
      broadcastFileSystemChange({
        type: task.extra?.mode === 'replace' ? 'overwrite' : 'add',
        path: outputPath,
        name: path.basename(outputPath)
      })
    }

    // 向所有 PC 客户端窗口广播任务终态通知
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('video-task-finished', {
          task,
          success,
          outputPath
        })
      }
    })

    // 向局域网各客户端广播任务终态通知
    lanServer.broadcastTaskFinished({
      task,
      success,
      outputPath
    })
  })

  // 全局视频队列 IPC 接口
  ipcMain.handle('get-video-queue-state', () => {
    return videoTaskManager.getQueueState()
  })

  ipcMain.handle('enqueue-video-task', (_event, params: {
    id?: string
    type: VideoTaskType
    title: string
    payload: any
    extra?: any
  }) => {
    return videoTaskManager.enqueueTask(params)
  })

  ipcMain.handle('save-video-screenshot', async (_event, params: {
    dataUrl: string
    sourcePath?: string
    timestampSec?: number
    copyToClipboard?: boolean
  }) => {
    try {
      const rawDataUrl = String(params?.dataUrl || '')
      const base64Match = rawDataUrl.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/i)
      if (!base64Match) {
        return { success: false, error: '无效的截帧图像数据' }
      }
      const buffer = Buffer.from(base64Match[1], 'base64')
      if (buffer.length === 0) {
        return { success: false, error: '截帧图像数据为空' }
      }

      let copied = false
      if (params?.copyToClipboard !== false) {
        try {
          const img = nativeImage.createFromBuffer(buffer)
          if (!img.isEmpty()) {
            clipboard.writeImage(img)
            copied = true
          }
        } catch (err: any) {
          logger.warn('Screenshot', `写入剪贴板失败: ${err?.message || err}`)
        }
      }

      let savedPath: string | undefined
      const sourcePath = (params?.sourcePath || '').trim()
      if (sourcePath && fs.existsSync(sourcePath)) {
        const dir = path.dirname(sourcePath)
        const baseName = path.basename(sourcePath, path.extname(sourcePath))
        const totalSec = Math.max(0, Math.floor(Number(params?.timestampSec) || 0))
        const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0')
        const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
        const ss = String(totalSec % 60).padStart(2, '0')
        const stamp = hh !== '00' ? `${hh}-${mm}-${ss}` : `${mm}-${ss}`
        const targetPath = resolveUniqueOutputPath(dir, `${baseName}_截帧_${stamp}`, '.png')
        const tempPath = `${targetPath}.~tmp_${Date.now()}`
        try {
          fs.writeFileSync(tempPath, buffer)
          fs.renameSync(tempPath, targetPath)
          savedPath = targetPath
          broadcastFileSystemChange({
            type: 'add',
            path: targetPath,
            name: path.basename(targetPath)
          })
        } catch (writeErr: any) {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
          if (!copied) {
            throw writeErr
          }
          logger.warn('Screenshot', `本地截帧落盘失败: ${writeErr?.message || writeErr}`)
        }
      }

      if (!savedPath && !copied) {
        return { success: false, error: '截帧保存与复制均失败' }
      }
      return { success: true, savedPath, copied }
    } catch (err: any) {
      logger.error('Screenshot', `save-video-screenshot failed: ${err?.message || err}`)
      return { success: false, error: err?.message || '截帧保存失败' }
    }
  })

  ipcMain.handle('cancel-video-task', (_event, taskId: string) => {
    return videoTaskManager.cancelTask(taskId)
  })

  ipcMain.handle('edit-video-segments', async (event, params: EditVideoParams) => {
    const sender = event.sender
    const result = await editVideoSegments(params, (percent, text) => {
      if (!sender.isDestroyed()) {
        sender.send(`video-edit-progress-${params.taskId}`, { percent, text })
      }
    })
    if (result.success && result.outputPath) {
      broadcastFileSystemChange({
        type: params.mode === 'replace' ? 'overwrite' : 'add',
        path: result.outputPath,
        name: path.basename(result.outputPath)
      })
    }
    return result
  })

  ipcMain.handle('cancel-video-edit', async (_event, taskId: string) => {
    return cancelVideoEdit(taskId)
  })

  ipcMain.handle('merge-videos', async (event, params: MergeVideosParams) => {
    const sender = event.sender
    const result = await mergeVideos(params, (percent, text) => {
      if (!sender.isDestroyed()) {
        sender.send(`video-merge-progress-${params.taskId}`, { percent, text })
      }
    })
    if (result.success && result.outputPath) {
      broadcastFileSystemChange({
        type: 'add',
        path: result.outputPath,
        name: path.basename(result.outputPath)
      })
    }
    return result
  })

  ipcMain.handle('cancel-video-merge', async (_event, taskId: string) => {
    return cancelVideoMerge(taskId)
  })

  ipcMain.handle('sync-adblock-source', async (_event, url: string, sourceId?: string) => {
    try {
      const text = await fetchRemoteRuleSource(url)
      const { count } = parseRulesText(text)
      if (sourceId) {
        await saveRuleCacheFile(sourceId, text)
        return { success: true, count }
      }
      return { success: true, count, content: text }
    } catch (err: any) {
      logger.error('AdBlock', `Failed to sync source ${url}: ${err.message}`)
      return { success: false, count: 0, error: err.message }
    }
  })

  ipcMain.handle('compile-adblock-rules', async (_event, sourcesOrIds: Record<string, string> | string[]) => {
    return await updateCompiledRules(sourcesOrIds)
  })
}
