import { ref } from 'vue'
import { db, type DownloadTask } from '../db'
import { logger } from '../services/logger'

const tasks = ref<DownloadTask[]>([])
const isInitialized = ref(false)
let isListenersInitialized = false

export const useDownloads = () => {
  const loadTasks = async () => {
    logger.info('Downloads', `[Renderer] loadTasks starting...`)
    try {
      const allTasks = await db.downloads.toArray()
      logger.info('Downloads', `[Renderer] loadTasks: Found ${allTasks.length} tasks in Dexie database.`)
      
      // Auto-pause downloading tasks on startup
      for (const t of allTasks) {
        if (t.status === 'downloading' || t.status === 'processing') {
          t.status = 'paused'
          t.speed = 0
          await db.downloads.put(t)
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

    if (window.electronAPI && window.electronAPI.onDownloadProgress) {
      window.electronAPI.onDownloadProgress(async (data: any) => {
        logger.info('Downloads', `[Renderer] Received IPC progress message. ID: ${data.id}, status: ${data.status}, receivedBytes: ${data.receivedBytes}, totalBytes: ${data.totalBytes}`)
        
        const index = tasks.value.findIndex(t => t.id === data.id)
        logger.info('Downloads', `[Renderer] tasks.value search index: ${index}. current tasks list size: ${tasks.value.length}`)

        if (index !== -1) {
          const t = tasks.value[index]
          const prevStatus = t.status
          
          if (data.status) t.status = data.status
          if (data.totalBytes !== undefined) t.totalBytes = data.totalBytes
          if (data.receivedBytes !== undefined) t.receivedBytes = data.receivedBytes
          if (data.speed !== undefined) t.speed = data.speed
          if (data.downloadedSegments !== undefined) t.downloadedSegments = data.downloadedSegments
          if (data.totalSegments !== undefined) t.totalSegments = data.totalSegments
          if (data.errorMsg) t.errorMsg = data.errorMsg

          if (t.totalSegments && t.totalSegments > 0) {
            t.progress = Math.min(100, Math.round((t.downloadedSegments! / t.totalSegments!) * 100))
          } else if (t.totalBytes > 0) {
            t.progress = Math.min(100, Math.round((t.receivedBytes / t.totalBytes) * 100))
          }

          t.updatedAt = Date.now()
          await db.downloads.put(JSON.parse(JSON.stringify(t)))
          
          logger.info('Downloads', `[Renderer] Local database & task status updated. status: ${t.status}, progress: ${t.progress}%`)
          
          // Trigger notifications
          if ((prevStatus === 'downloading' || prevStatus === 'processing') && t.status === 'completed') {
            const { useNotification } = await import('./useNotification')
            useNotification().showNotification({
              type: 'success',
              title: '下载完成',
              message: t.name,
              sourceRoute: '/'
            })
          } else if ((prevStatus === 'downloading' || prevStatus === 'processing') && t.status === 'error') {
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
      })
    }
  }

  const addDownload = async (url: string, name: string, savePath: string): Promise<boolean> => {
    logger.info('Downloads', `[Renderer] addDownload invoked. url: ${url}, name: ${name}, savePath: ${savePath}`)
    try {
      const fileExists = window.electronAPI ? await window.electronAPI.fileExists(savePath) : false
      
      if (fileExists) {
        const { useConfirm } = await import('./useConfirm')
        const confirmed = await useConfirm().confirm({
          title: '文件已存在',
          message: `在当前下载目录中已经存在名为 "${name}" 的文件。\n要覆盖原文件并重新开始下载吗？`,
          confirmText: '覆盖下载',
          cancelText: '跳过',
          type: 'warning'
        })
        
        if (confirmed) {
          const existingTask = tasks.value.find(t => t.savePath === savePath)
          if (existingTask) {
            await deleteTask(existingTask.id, true)
          } else if (window.electronAPI) {
            await window.electronAPI.deleteFile(savePath)
          }
        } else {
          logger.info('Downloads', `[Renderer] addDownload canceled: File already exists and user skipped.`)
          return false // Skip download
        }
      }

      const id = crypto.randomUUID()
      const task: DownloadTask = {
        id,
        url,
        name,
        savePath,
        status: 'downloading',
        progress: 0,
        receivedBytes: 0,
        totalBytes: 0,
        speed: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      
      logger.info('Downloads', `[Renderer] addDownload: Persisting task ID ${id} to Dexie...`)
      await db.downloads.add(task)
      logger.info('Downloads', `[Renderer] addDownload: Task ID ${id} persisted. unshifting task to tasks.value...`)
      tasks.value.unshift(task)
      
      if (window.electronAPI) {
        logger.info('Downloads', `[Renderer] addDownload: Triggering startDownload IPC for ID: ${id}`)
        window.electronAPI.startDownload({ id, url, savePath, startBytes: 0 })
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
      await db.downloads.put(JSON.parse(JSON.stringify(t)))
    }
  }

  const resumeTask = async (id: string) => {
    const t = tasks.value.find(t => t.id === id)
    if (t && window.electronAPI) {
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
        downloadedSegments: t.downloadedSegments
      })
    }
  }

  const updateTaskDb = async (task: DownloadTask) => {
    await db.downloads.put(JSON.parse(JSON.stringify(task)))
  }

  const deleteTask = async (id: string, deleteFile = false) => {
    const t = tasks.value.find(t => t.id === id)
    if (t) {
      if (t.status === 'downloading' || t.status === 'processing') {
        if (window.electronAPI) window.electronAPI.cancelDownload(id)
      }
      if (deleteFile && window.electronAPI) {
        await window.electronAPI.deleteFile(t.savePath)
      }
      await db.downloads.delete(id)
      tasks.value = tasks.value.filter(task => task.id !== id)
    }
  }

  return {
    tasks,
    isInitialized,
    loadTasks,
    initListeners,
    addDownload,
    pauseTask,
    resumeTask,
    deleteTask,
    updateTaskDb
  }
}
