import { ref } from 'vue'
import { db, type DownloadTask } from '../db'
import { logger } from '../services/logger'

const tasks = ref<DownloadTask[]>([])
const isInitialized = ref(false)
let isListenersInitialized = false
const notifiedErrorTaskIds = new Set<string>()

export const useDownloads = () => {
  const loadTasks = async () => {
    logger.info('Downloads', `[Renderer] loadTasks starting...`)
    try {
      const allTasks = await db.downloads.toArray()
      logger.info('Downloads', `[Renderer] loadTasks: Found ${allTasks.length} tasks in Dexie database.`)
      
      // Auto-pause active downloading tasks & check file existence on startup
      for (const t of allTasks) {
        if (t.status === 'downloading' || t.status === 'processing' || t.status === 'resolving') {
          t.status = 'paused'
          t.speed = 0
          await db.downloads.put(t)
        } else if (t.savePath && window.electronAPI && window.electronAPI.fileExists) {
          try {
            const exists = await window.electronAPI.fileExists(t.savePath)
            if (!exists && t.status === 'completed') {
              t.status = 'file_removed'
              t.speed = 0
              await db.downloads.put(t)
              logger.info('Downloads', `[Startup Check] Task "${t.name}" file missing, updated status to file_removed.`)
            } else if (exists && (t.status === 'file_removed' || t.status === 'file_corrupted')) {
              t.status = 'completed'
              t.progress = 100
              t.speed = 0
              await db.downloads.put(t)
              logger.info('Downloads', `[Startup Check] Task "${t.name}" file found, restored status to completed.`)
            }
          } catch (err: any) {
            logger.error('Downloads', `[Startup Check] Failed to check file for task ${t.id}: ${err.message}`)
          }
        }
      }
      tasks.value = await db.downloads.orderBy('createdAt').reverse().toArray()
      isInitialized.value = true
      logger.info('Downloads', `[Renderer] loadTasks finished. tasks.value loaded. size: ${tasks.value.length}`)
      initListeners()
    } catch (err: any) {
      logger.error('Downloads', `[Renderer] ERROR in loadTasks: ${err.message}`)
    }
  }

  const initListeners = () => {
    if (isListenersInitialized) {
      logger.info('Downloads', `[Renderer] initListeners skipped: already initialized.`)
      return
    }
    
    logger.info('Downloads', `[Renderer] initListeners binding to onDownloadProgress...`)
    isListenersInitialized = true

    // Start frontend speed calculation timer
    setInterval(() => {
      tasks.value.forEach(t => {
        if (t.status === 'downloading') {
          const current = t.receivedBytes || 0;
          const last = (t as any)._lastReceivedBytes ?? current;
          t.speed = Math.max(0, current - last);
          (t as any)._lastReceivedBytes = current;
        } else {
          t.speed = 0;
          delete (t as any)._lastReceivedBytes;
        }
      });
    }, 1000);


    if (window.electronAPI && window.electronAPI.onDownloadProgress) {
      window.electronAPI.onDownloadProgress(async (data: any) => {
        logger.info('Downloads', `[Renderer] Received IPC progress message. ID: ${data.id}, status: ${data.status}, receivedBytes: ${data.receivedBytes}, totalBytes: ${data.totalBytes}`)
        
        const index = tasks.value.findIndex(t => t.id === data.id)
        logger.info('Downloads', `[Renderer] tasks.value search index: ${index}. current tasks list size: ${tasks.value.length}`)

        if (index !== -1) {
          const t = tasks.value[index]
          const prevStatus = t.status
          
          if (data.status) {
            t.status = data.status
            if (t.status !== 'error') {
              delete t.errorMsg
            }
          }
          if (data.totalBytes !== undefined) t.totalBytes = data.totalBytes
          if (data.receivedBytes !== undefined) t.receivedBytes = data.receivedBytes
          // if (data.speed !== undefined) t.speed = data.speed (Frontend calculation instead)
          if (data.downloadedSegments !== undefined) t.downloadedSegments = data.downloadedSegments
          if (data.totalSegments !== undefined) t.totalSegments = data.totalSegments
          if (data.errorMsg) {
            t.errorMsg = data.errorMsg
          } else if (t.status !== 'error') {
            delete t.errorMsg
          }

          if (t.totalSegments && t.totalSegments > 0) {
            t.progress = Math.min(100, Math.round((t.downloadedSegments! / t.totalSegments!) * 100))
          } else if (t.totalBytes > 0) {
            t.progress = Math.min(100, Math.round((t.receivedBytes / t.totalBytes) * 100))
          }

          t.updatedAt = Date.now()
          await db.downloads.put(JSON.parse(JSON.stringify(t)))
          
          logger.info('Downloads', `[Renderer] Local database & task status updated. status: ${t.status}, progress: ${t.progress}%`)
          
          // Reset error notification flag when task starts downloading
          if (t.status === 'downloading' || t.status === 'resolving' || t.status === 'processing') {
            notifiedErrorTaskIds.delete(t.id)
          }

          // Trigger notifications
          if ((prevStatus === 'downloading' || prevStatus === 'processing' || prevStatus === 'resolving') && t.status === 'completed') {
            notifiedErrorTaskIds.delete(t.id)
            const { useNotification } = await import('./useNotification')
            useNotification().showNotification({
              type: 'success',
              title: '下载完成',
              message: t.name,
              sourceRoute: '/'
            })
          } else if ((prevStatus === 'downloading' || prevStatus === 'processing' || prevStatus === 'resolving') && t.status === 'error') {
            if (!notifiedErrorTaskIds.has(t.id)) {
              notifiedErrorTaskIds.add(t.id)
              const { useNotification } = await import('./useNotification')
              useNotification().showNotification({
                type: 'error',
                title: '下载失败',
                message: t.name,
                detail: t.errorMsg,
                sourceRoute: '/'
              })
            }
          }
        }
      })
    }
  }

  const addDownload = async (url: string, name: string, savePath: string, customReferer?: string): Promise<boolean> => {
    logger.info('Downloads', `[Renderer] addDownload invoked. url: ${url}, name: ${name}, savePath: ${savePath}`)
    try {
      const existingTask = tasks.value.find(t => t.savePath === savePath)
      const fileExists = window.electronAPI ? await window.electronAPI.fileExists(savePath) : false
      
      if (existingTask || fileExists) {
        const { useConfirm } = await import('./useConfirm')
        const confirmed = await useConfirm().confirm({
          title: '文件或任务已存在',
          message: `在当前下载目录或任务列表中已经存在名为 "${name}" 的项。\n要将其覆盖并重新开始全新的下载吗？`,
          confirmText: '覆盖下载',
          cancelText: '跳过',
          type: 'warning'
        })
        
        if (confirmed) {
          if (existingTask) {
            logger.info('Downloads', `[Renderer] User chose to overwrite. Removing existing task ID: ${existingTask.id}`)
            if (window.electronAPI) {
              window.electronAPI.cancelDownload(existingTask.id)
            }
            tasks.value = tasks.value.filter(t => t.id !== existingTask.id)
            await db.downloads.delete(existingTask.id)
          }
          try {
            if (window.electronAPI && window.electronAPI.deleteFile) {
              await window.electronAPI.deleteFile(savePath)
            }
          } catch (e) {
            logger.warn('Downloads', `[Renderer] Failed to delete existing file: ${e}`)
          }
        } else {
          logger.info('Downloads', `[Renderer] addDownload canceled: Task or file already exists and user skipped.`)
          return false // Skip download
        }
      }

      let finalReferer = customReferer;
      if (finalReferer) {
        try {
          const u = new URL(finalReferer);
          if (u.origin && u.origin !== 'null') finalReferer = u.origin;
        } catch {}
      }

      const id = crypto.randomUUID()
      const task: DownloadTask = {
        id,
        url,
        name,
        savePath,
        status: 'waiting',
        progress: 0,
        receivedBytes: 0,
        totalBytes: 0,
        speed: 0,
        referer: finalReferer,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      
      logger.info('Downloads', `[Renderer] addDownload: Persisting task ID ${id} to Dexie...`)
      await db.downloads.add(task)
      logger.info('Downloads', `[Renderer] addDownload: Task ID ${id} persisted. unshifting task to tasks.value...`)
      tasks.value.unshift(task)
      
      if (window.electronAPI) {
        logger.info('Downloads', `[Renderer] addDownload: Triggering startDownload IPC for ID: ${id}`)
        window.electronAPI.startDownload({ id, url, savePath, startBytes: 0, referer: task.referer })
      }
      
      return true
    } catch (err: any) {
      logger.error('Downloads', `[Renderer] ERROR in addDownload: ${err.message}`)
      throw err
    }
  }

  const pauseTask = async (id: string) => {
    if (window.electronAPI) window.electronAPI.pauseDownload(id)
    const t = tasks.value.find(t => t.id === id)
    if (t) {
      t.status = 'paused'
      t.speed = 0
      delete t.errorMsg
      await db.downloads.put(JSON.parse(JSON.stringify(t)))
    }
  }

  const resumeTask = async (id: string) => {
    const t = tasks.value.find(t => t.id === id)
    if (t && window.electronAPI) {
      delete t.errorMsg
      const exists = await window.electronAPI.fileExists(t.savePath);
      if (exists) {
        t.status = 'completed';
        t.progress = 100;
        await db.downloads.put(JSON.parse(JSON.stringify(t)));
        return;
      }

      if (t.status === 'file_removed' || t.status === 'file_corrupted') {
        t.receivedBytes = 0
        t.progress = 0
      }
      t.status = 'downloading'
      await db.downloads.put(JSON.parse(JSON.stringify(t)))
      window.electronAPI.startDownload({ 
        id, 
        url: t.url, 
        savePath: t.savePath, 
        startBytes: t.receivedBytes,
        downloadedSegments: t.downloadedSegments,
        referer: t.referer
      })
    }
  }

  const updateTaskDb = async (task: DownloadTask) => {
    await db.downloads.put(JSON.parse(JSON.stringify(task)))
  }

  const deleteTask = async (id: string, deleteFile = false) => {
    const t = tasks.value.find(t => t.id === id)
    if (t) {
      if (t.status === 'downloading' || t.status === 'processing' || t.status === 'resolving') {
        if (window.electronAPI) window.electronAPI.cancelDownload(id)
      }
      const isUnfinished = t.status !== 'completed';
      const shouldDeleteFile = deleteFile || isUnfinished;
      if (shouldDeleteFile && window.electronAPI) {
        await window.electronAPI.deleteFile(t.savePath)
      }
      await db.downloads.delete(id)
      tasks.value = tasks.value.filter(task => task.id !== id)
    }
  }

  const auditDiskFiles = async () => {
    let updatedCount = 0;
    if (!window.electronAPI || !window.electronAPI.fileExists) return 0;
    for (const t of tasks.value) {
      if (t.savePath) {
        try {
          const exists = await window.electronAPI.fileExists(t.savePath);
          if (!exists && t.status === 'completed') {
            t.status = 'file_removed';
            t.speed = 0;
            delete t.errorMsg;
            await db.downloads.put(JSON.parse(JSON.stringify(t)));
            updatedCount++;
          } else if (exists && (t.status === 'file_removed' || t.status === 'file_corrupted')) {
            t.status = 'completed';
            t.progress = 100;
            t.speed = 0;
            delete t.errorMsg;
            await db.downloads.put(JSON.parse(JSON.stringify(t)));
            updatedCount++;
          }
        } catch (e) {}
      }
    }
    return updatedCount;
  };

  return {
    tasks,
    isInitialized,
    loadTasks,
    initListeners,
    addDownload,
    pauseTask,
    resumeTask,
    deleteTask,
    updateTaskDb,
    auditDiskFiles
  }
}
