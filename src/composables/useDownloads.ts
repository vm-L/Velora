import { db, type DownloadTask } from '@/db'
import { logger } from '@/services/logger'
import { useFileDeduplication } from '@/composables/useFileDeduplication'
import {
  tasks,
  isInitialized,
  dirtyTaskIds,
  clonePanContext,
  serializeTaskForDb,
  releaseUnusedCleanupDirs
} from '@/composables/downloads/persistence'
import { createDownloadSync } from '@/composables/downloads/useDownloadSync'
import { createDownloadCreation } from '@/composables/downloads/useDownloadCreation'

export type { BatchDownloadInput } from '@/composables/downloads/persistence'

let loadTasksPromise: Promise<void> | null = null

export const useDownloads = () => {
  const { recordFile, removeFile, getExactMatches } = useFileDeduplication()

  const pauseTask = async (id: string) => {
    if (window.electronAPI) window.electronAPI.pauseDownload(id)
    const t = tasks.value.find(t => t.id === id)
    if (t) {
      t.status = 'paused'
      t.speed = 0
      delete t.errorMsg
      dirtyTaskIds.delete(t.id)
      await db.downloads.put(serializeTaskForDb(t))
    }
  }

  const resumeTask = async (id: string) => {
    const t = tasks.value.find(t => t.id === id)
    if (t && window.electronAPI) {
      delete t.errorMsg
      delete t.canSkipFailedSegments
      delete t.failedSegmentsCount
      delete t.skippedSegments

      if (t.status === 'file_removed' || t.status === 'file_corrupted') {
        t.receivedBytes = 0
        t.progress = 0
        delete t.downloadedSegments
      }
      t.status = 'downloading'
      dirtyTaskIds.delete(t.id)
      await db.downloads.put(serializeTaskForDb(t))
      window.electronAPI.startDownload({
        id,
        url: t.url,
        savePath: t.savePath,
        startBytes: t.receivedBytes,
        downloadedSegments: t.downloadedSegments,
        totalSegments: t.totalSegments,
        referer: t.referer,
        headers: t.headers,
        totalBytes: t.totalBytes,
        panContext: clonePanContext(t.panContext)
      })
    }
  }

  const { addDownload, addDownloadsBatch } = createDownloadCreation({
    recordFile,
    removeFile,
    getExactMatches
  })

  const updateTaskDb = async (task: DownloadTask) => {
    dirtyTaskIds.delete(task.id)
    await db.downloads.put(serializeTaskForDb(task))
  }

  let deleteTaskRef: ((id: string, deleteFile?: boolean) => Promise<void>) | null = null

  const { initListeners } = createDownloadSync({
    pauseTask,
    resumeTask,
    deleteTask: async (id, deleteFile) => {
      if (deleteTaskRef) await deleteTaskRef(id, deleteFile)
    },
    addDownloadsBatch,
    recordFile,
    removeFile
  })

  const loadTasks = async () => {
    if (isInitialized.value) return
    if (loadTasksPromise) return loadTasksPromise

    loadTasksPromise = (async () => {
      try {
        const allTasks = await db.downloads.orderBy('createdAt').reverse().toArray()

        let needDbUpdate = false
        const updatedTasks = allTasks.map(t => {
          if (t.status === 'compressing' || t.status === 'processing') {
            needDbUpdate = true
            return { ...t, status: 'completed' as const, progress: 100, speed: 0, speedText: undefined, etaSeconds: undefined }
          } else if (t.status === 'downloading' || t.status === 'resolving' || t.status === 'converting') {
            needDbUpdate = true
            return { ...t, status: 'paused' as const, speed: 0, speedText: undefined, etaSeconds: undefined }
          }
          return t
        })

        if (needDbUpdate) {
          await db.downloads.bulkPut(updatedTasks)
        }

        tasks.value = updatedTasks
        isInitialized.value = true
        initListeners()
      } catch (err: any) {
        logger.error('Downloads', `[Renderer] loadTasks failed: ${err.message}`)
      } finally {
        loadTasksPromise = null
      }
    })()

    return loadTasksPromise
  }

  const deleteTask = async (id: string, deleteFile = false) => {
    dirtyTaskIds.delete(id)
    const t = tasks.value.find(t => t.id === id)
    if (t) {
      if (['downloading', 'resolving', 'converting', 'compressing', 'processing', 'waiting'].includes(t.status)) {
        if (window.electronAPI) window.electronAPI.cancelDownload(id)
      }
      const isUnfinished = t.status !== 'completed'
      const shouldDeleteFile = deleteFile || isUnfinished
      if (shouldDeleteFile && window.electronAPI) {
        await window.electronAPI.deleteFile(t.savePath)
        removeFile(t.name, t.savePath)
      }
      await db.downloads.delete(id)
      tasks.value = tasks.value.filter(task => task.id !== id)
      releaseUnusedCleanupDirs([t.panContext])
    }
  }
  deleteTaskRef = deleteTask

  const auditDiskFiles = async () => {
    if (!window.electronAPI) return 0
    const pathList = Array.from(new Set(tasks.value.map(t => t.savePath).filter(Boolean)))
    if (pathList.length === 0) return 0

    let existsMap: Record<string, boolean> = {}
    try {
      if (window.electronAPI.filesExistBatch) {
        existsMap = await window.electronAPI.filesExistBatch(pathList)
      } else if (window.electronAPI.fileExists) {
        for (const p of pathList) {
          existsMap[p] = await window.electronAPI.fileExists(p)
        }
      }
    } catch {
      return 0
    }

    const changedTasks: DownloadTask[] = []
    for (const t of tasks.value) {
      if (!t.savePath) continue
      const exists = !!existsMap[t.savePath]
      if (!exists && t.status === 'completed') {
        t.status = 'file_removed'
        t.speed = 0
        delete t.errorMsg
        changedTasks.push(t)
        removeFile(t.name, t.savePath, true)
      } else if (exists && (t.status === 'file_removed' || t.status === 'file_corrupted')) {
        t.status = 'completed'
        t.progress = 100
        t.speed = 0
        delete t.errorMsg
        changedTasks.push(t)
        recordFile(t.name, t.savePath, true)
      }
    }

    if (changedTasks.length > 0) {
      await db.downloads.bulkPut(changedTasks.map(serializeTaskForDb))
    }
    return changedTasks.length
  }

  const skipFailedSegmentsTask = async (id: string) => {
    const t = tasks.value.find(task => task.id === id)
    if (!t || !window.electronAPI?.skipFailedM3U8Segments) {
      return { success: false, error: '当前环境不支持跳过分片封装' }
    }
    try {
      return await window.electronAPI.skipFailedM3U8Segments({
        id: t.id,
        url: t.url,
        savePath: t.savePath,
        startBytes: t.receivedBytes,
        downloadedSegments: t.downloadedSegments,
        totalSegments: t.totalSegments,
        referer: t.referer,
        headers: t.headers,
        totalBytes: t.totalBytes,
        panContext: clonePanContext(t.panContext)
      })
    } catch (err: any) {
      return { success: false, error: err?.message || '跳过失效分片封装失败' }
    }
  }

  return {
    tasks,
    isInitialized,
    loadTasks,
    initListeners,
    addDownload,
    addDownloadsBatch,
    pauseTask,
    resumeTask,
    skipFailedSegmentsTask,
    deleteTask,
    updateTaskDb,
    auditDiskFiles
  }
}
