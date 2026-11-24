import { db, type DownloadTask, type PanTaskContext } from '@/db'
import { logger } from '@/services/logger'
import type { useFileDeduplication } from '@/composables/useFileDeduplication'
import {
  tasks,
  clonePanContext,
  serializeTaskForDb,
  releaseUnusedCleanupDirs,
  normalizeReferer,
  type BatchDownloadInput
} from '@/composables/downloads/persistence'

type FileDeduplicationApi = ReturnType<typeof useFileDeduplication>

export interface DownloadCreationDeps {
  recordFile: FileDeduplicationApi['recordFile']
  removeFile: FileDeduplicationApi['removeFile']
  getExactMatches: FileDeduplicationApi['getExactMatches']
}

/**
 * 构建单个与批量下载任务创建器（含本地/队列去重、覆盖确认与 Dexie 持久化）
 */
export const createDownloadCreation = (deps: DownloadCreationDeps) => {
  const { recordFile, removeFile, getExactMatches } = deps

  const addDownload = async (
    url: string,
    name: string,
    savePath: string,
    customReferer?: string,
    headers?: Record<string, string>,
    totalBytes?: number,
    panContext?: PanTaskContext
  ): Promise<boolean> => {
    logger.info('Downloads', `[Renderer] addDownload invoked. url: ${url}, name: ${name}, savePath: ${savePath}`)
    try {
      const existingTask = tasks.value.find(t => t.savePath === savePath)
      const exactPaths = getExactMatches(name)
      const normalizedTarget = savePath.replace(/\\/g, '/').toLowerCase()
      const isDuplicateInTarget = exactPaths.some(p => p.toLowerCase() === normalizedTarget)
      const fileExists = isDuplicateInTarget || (window.electronAPI ? await window.electronAPI.fileExists(savePath) : false)

      if (existingTask || fileExists) {
        const { useConfirm } = await import('@/composables/useConfirm')
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
            removeFile(existingTask.name, existingTask.savePath)
            releaseUnusedCleanupDirs([existingTask.panContext])
          }
          try {
            if (window.electronAPI && window.electronAPI.deleteFile) {
              await window.electronAPI.deleteFile(savePath)
            }
          } catch (e) {
            logger.warn('Downloads', `[Renderer] Failed to delete existing file: ${e}`)
          }
          removeFile(name, savePath)
        } else {
          logger.info('Downloads', `[Renderer] addDownload canceled: Task or file already exists and user skipped.`)
          releaseUnusedCleanupDirs([panContext])
          return false
        }
      }

      const finalReferer = normalizeReferer(customReferer)
      const id = crypto.randomUUID()
      const task: DownloadTask = {
        id,
        url,
        name,
        savePath,
        status: 'waiting',
        progress: 0,
        receivedBytes: 0,
        totalBytes: totalBytes || 0,
        speed: 0,
        referer: finalReferer,
        headers,
        ...(panContext ? { panContext: clonePanContext(panContext) } : {}),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await db.downloads.add(serializeTaskForDb(task))
      recordFile(task.name, task.savePath)
      tasks.value.unshift(task)

      if (window.electronAPI) {
        window.electronAPI.startDownload({
          id,
          url,
          savePath,
          startBytes: 0,
          referer: task.referer,
          headers: task.headers,
          totalBytes: task.totalBytes,
          panContext: clonePanContext(task.panContext)
        })
      }

      return true
    } catch (err: any) {
      logger.error('Downloads', `[Renderer] ERROR in addDownload: ${err.message}`)
      throw err
    }
  }

  const addDownloadsBatch = async (items: BatchDownloadInput[]): Promise<number> => {
    if (!items || items.length === 0) return 0

    try {
      const existingTaskByPath = new Map(tasks.value.map(t => [t.savePath, t]))
      const pathsToProbeSet = new Set<string>()

      const preliminary = items.map((item) => {
        const existingTask = existingTaskByPath.get(item.savePath)
        const normalizedTarget = item.savePath.replace(/\\/g, '/').toLowerCase()
        const exactPaths = getExactMatches(item.name)
        const isDuplicateInTarget = exactPaths.some(p => p.toLowerCase() === normalizedTarget)
        if (!existingTask && !isDuplicateInTarget) {
          pathsToProbeSet.add(item.savePath)
        }
        return { item, existingTask, isDuplicateInTarget }
      })

      let diskExistsMap: Record<string, boolean> = {}
      const pathsToProbe = Array.from(pathsToProbeSet)
      if (pathsToProbe.length > 0 && window.electronAPI) {
        if (window.electronAPI.filesExistBatch) {
          diskExistsMap = await window.electronAPI.filesExistBatch(pathsToProbe)
        } else if (window.electronAPI.fileExists) {
          const results = await Promise.all(
            pathsToProbe.map(async p => [p, await window.electronAPI.fileExists(p)] as const)
          )
          diskExistsMap = Object.fromEntries(results)
        }
      }

      const conflicts: Array<{ item: BatchDownloadInput; existingTask?: DownloadTask }> = []
      const freshItems: BatchDownloadInput[] = []

      for (const entry of preliminary) {
        const exists = !!entry.existingTask || entry.isDuplicateInTarget || !!diskExistsMap[entry.item.savePath]
        if (exists) {
          conflicts.push({ item: entry.item, existingTask: entry.existingTask })
        } else {
          freshItems.push(entry.item)
        }
      }

      let itemsToQueue: BatchDownloadInput[] = [...freshItems]
      if (conflicts.length > 0) {
        const { useConfirm } = await import('@/composables/useConfirm')
        const message =
          conflicts.length === 1
            ? `在当前下载目录或任务列表中已经存在名为 "${conflicts[0].item.name}" 的项。\n要将其覆盖并重新开始全新的下载吗？`
            : `检测到 ${conflicts.length} 个同名文件或已有任务，是否全部覆盖下载？（选择“跳过”将仅下载其余新文件）`

        const confirmed = await useConfirm().confirm({
          title: '文件或任务已存在',
          message,
          confirmText: '覆盖下载',
          cancelText: '跳过',
          type: 'warning'
        })

        if (confirmed) {
          const removeTaskIds: string[] = []
          for (const c of conflicts) {
            if (c.existingTask) {
              removeTaskIds.push(c.existingTask.id)
              window.electronAPI?.cancelDownload(c.existingTask.id)
              removeFile(c.existingTask.name, c.existingTask.savePath)
            }
            if (window.electronAPI?.deleteFile) {
              try {
                await window.electronAPI.deleteFile(c.item.savePath)
              } catch {}
            }
            removeFile(c.item.name, c.item.savePath)
          }

          if (removeTaskIds.length > 0) {
            const removeIdSet = new Set(removeTaskIds)
            const removedContexts = tasks.value
              .filter(t => removeIdSet.has(t.id))
              .map(t => t.panContext)
            tasks.value = tasks.value.filter(t => !removeIdSet.has(t.id))
            await db.downloads.bulkDelete(removeTaskIds)
            releaseUnusedCleanupDirs(removedContexts)
          }
          itemsToQueue = [...conflicts.map(c => c.item), ...freshItems]
        } else {
          releaseUnusedCleanupDirs(conflicts.map(c => c.item.panContext))
        }
      }

      if (itemsToQueue.length === 0) return 0

      const baseNow = Date.now()
      const newTasks: DownloadTask[] = itemsToQueue.map((item, idx) => ({
        id: crypto.randomUUID(),
        url: item.url,
        name: item.name,
        savePath: item.savePath,
        status: 'waiting',
        progress: 0,
        receivedBytes: 0,
        totalBytes: item.totalBytes || 0,
        speed: 0,
        referer: normalizeReferer(item.customReferer),
        headers: item.headers,
        ...(item.panContext ? { panContext: clonePanContext(item.panContext) } : {}),
        createdAt: baseNow + idx,
        updatedAt: baseNow + idx
      }))

      await db.downloads.bulkPut(newTasks.map(serializeTaskForDb))
      for (const task of newTasks) {
        recordFile(task.name, task.savePath, true)
      }
      // 保留反序头部插入习惯，同时一次更新响应式数组
      tasks.value = [...newTasks.slice().reverse(), ...tasks.value]

      if (window.electronAPI) {
        for (const task of newTasks) {
          window.electronAPI.startDownload({
            id: task.id,
            url: task.url,
            savePath: task.savePath,
            startBytes: 0,
            referer: task.referer,
            headers: task.headers,
            totalBytes: task.totalBytes,
            panContext: clonePanContext(task.panContext)
          })
        }
      }

      logger.info('Downloads', `[Renderer] addDownloadsBatch queued ${newTasks.length} tasks.`)
      return newTasks.length
    } catch (err: any) {
      logger.error('Downloads', `[Renderer] ERROR in addDownloadsBatch: ${err.message}`)
      throw err
    }
  }

  return { addDownload, addDownloadsBatch }
}
