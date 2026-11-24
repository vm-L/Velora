import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fetchRemoteRuleSource, parseRulesText, saveRuleCacheFile, updateCompiledRules } from '../../adblock'
import { lanServer } from '../../lanServer'
import { logger } from '../../logger'
import { storeManager } from '../../store'
import {
  cancelVideoEdit,
  cancelVideoMerge,
  type EditVideoParams,
  editVideoSegments,
  type MergeVideosParams,
  mergeVideos
} from '../../videoEditor'
import { videoTaskManager } from '../../videoTaskManager'
import { releaseLocalMediaStreams } from '../mediaStreamServer'
import { broadcastFileSystemChange } from '../windowManager'

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
    type: 'cut' | 'merge' | 'compress'
    title: string
    payload: any
    extra?: any
  }) => {
    return videoTaskManager.enqueueTask(params)
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
