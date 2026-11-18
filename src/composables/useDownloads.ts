import { ref, computed, watch } from 'vue'
import { db, type DownloadTask, type PanTaskContext } from '@/db'
import { logger } from '@/services/logger'
import { useFileDeduplication } from '@/composables/useFileDeduplication'

const tasks = ref<DownloadTask[]>([])
const isInitialized = ref(false)
let isListenersInitialized = false
let loadTasksPromise: Promise<void> | null = null
const notifiedErrorTaskIds = new Set<string>()
const dirtyTaskIds = new Set<string>()
let dirtyFlushTimer: ReturnType<typeof setInterval> | null = null

const clonePanContext = (ctx?: PanTaskContext): PanTaskContext | undefined => {
  if (!ctx) return undefined
  const { extra: rawExtra, ...rest } = ctx
  let extra: Record<string, any> | undefined
  if (rawExtra !== undefined) {
    try {
      extra = JSON.parse(JSON.stringify(rawExtra))
    } catch {
      extra = { ...rawExtra }
    }
  }
  return {
    ...rest,
    ...(extra !== undefined ? { extra } : {})
  }
}

const sanitizeHeadersForDb = (headers?: Record<string, string>): Record<string, string> | undefined => {
  if (!headers) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase()
    if (lower === 'cookie' || lower === 'authorization' || lower === 'x-velora-client-id') continue
    out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const serializeTaskForDb = (t: DownloadTask): DownloadTask => ({
  id: t.id,
  url: t.url,
  name: t.name,
  savePath: t.savePath,
  status: t.status,
  progress: t.progress,
  receivedBytes: t.receivedBytes,
  totalBytes: t.totalBytes,
  speed: t.speed,
  ...(t.downloadedSegments !== undefined ? { downloadedSegments: t.downloadedSegments } : {}),
  ...(t.totalSegments !== undefined ? { totalSegments: t.totalSegments } : {}),
  ...(t.referer !== undefined ? { referer: t.referer } : {}),
  ...(sanitizeHeadersForDb(t.headers) ? { headers: sanitizeHeadersForDb(t.headers) } : {}),
  ...(t.panContext ? { panContext: clonePanContext(t.panContext) } : {}),
  ...(t.errorMsg !== undefined ? { errorMsg: t.errorMsg } : {}),
  ...(t.speedText !== undefined ? { speedText: t.speedText } : {}),
  ...(t.etaSeconds !== undefined ? { etaSeconds: t.etaSeconds } : {}),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt
})

const releaseUnusedCleanupDirs = (contexts: Array<PanTaskContext | undefined>) => {
  const candidates = new Map<string, { panType: string; cleanupDirFid: string }>()
  for (const ctx of contexts) {
    if (ctx?.panType && ctx.cleanupDirFid) {
      candidates.set(`${ctx.panType}\0${ctx.cleanupDirFid}`, {
        panType: ctx.panType,
        cleanupDirFid: ctx.cleanupDirFid
      })
    }
  }
  if (candidates.size === 0 || !window.electronAPI?.cleanupPanTempDir) return
  for (const { panType, cleanupDirFid } of Array.from(candidates.values())) {
    const stillInUse = tasks.value.some(
      (t) =>
        t.status !== 'completed' &&
        t.panContext?.panType === panType &&
        t.panContext?.cleanupDirFid === cleanupDirFid
    )
    if (!stillInUse) {
      void window.electronAPI.cleanupPanTempDir({ type: panType, cleanupDirFid }).catch(() => {})
    }
  }
}

const flushDirtyTasks = async () => {
  if (dirtyTaskIds.size === 0) return
  const pendingIds = Array.from(dirtyTaskIds)
  dirtyTaskIds.clear()
  const taskMap = new Map(tasks.value.map(t => [t.id, t]))
  const toPersist: DownloadTask[] = []
  for (const id of pendingIds) {
    const task = taskMap.get(id)
    if (task) {
      toPersist.push(serializeTaskForDb(task))
    }
  }
  if (toPersist.length > 0) {
    try {
      await db.downloads.bulkPut(toPersist)
    } catch (err: any) {
      logger.warn('Downloads', `[Renderer] 批量刷新任务进度到 Dexie 失败: ${err.message}`)
    }
  }
}

const normalizeReferer = (customReferer?: string): string | undefined => {
  if (!customReferer) return undefined
  try {
    if (customReferer.includes('quark.cn')) {
      return 'https://pan.quark.cn/'
    }
    const u = new URL(customReferer)
    return u.href
  } catch {
    return customReferer
  }
}

export interface BatchDownloadInput {
  url: string
  name: string
  savePath: string
  customReferer?: string
  headers?: Record<string, string>
  totalBytes?: number
  panContext?: PanTaskContext
}

export const useDownloads = () => {
  const { recordFile, removeFile, getExactMatches } = useFileDeduplication();

  const loadTasks = async () => {
    if (isInitialized.value) return;
    if (loadTasksPromise) return loadTasksPromise;

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

  const initListeners = () => {
    if (isListenersInitialized) {
      logger.info('Downloads', `[Renderer] initListeners skipped: already initialized.`)
      return
    }
    
    logger.info('Downloads', `[Renderer] initListeners binding to onDownloadProgress...`)
    isListenersInitialized = true

    // 5秒滑动统计窗口采样计算，平滑瞬时波动，消除分片交替时的 0B/s 抖动
    const SPEED_WINDOW_MS = 5000;
    setInterval(() => {
      if (tasks.value.length === 0) return;
      const hasDownloading = tasks.value.some(t => t.status === 'downloading');
      if (!hasDownloading) {
        // 当没有下载中任务时，仅在存在残留测速样本或速度不为 0 时做一次清理重置，随后空闲跳过
        let hadDirtyState = false;
        for (let i = 0; i < tasks.value.length; i++) {
          const t = tasks.value[i];
          if ((t as any)._speedSamples || t.speed > 0) {
            t.speed = 0;
            delete (t as any)._speedSamples;
            delete (t as any)._lastReceivedBytes;
            hadDirtyState = true;
          }
        }
        if (!hadDirtyState) return;
      }

      const now = Date.now();
      tasks.value.forEach(t => {
        if (t.status === 'downloading') {
          const current = t.receivedBytes || 0;
          let samples: Array<{ time: number; bytes: number }> = (t as any)._speedSamples;
          if (!samples) {
            samples = [];
            (t as any)._speedSamples = samples;
          }
          samples.push({ time: now, bytes: current });

          // 移出超出 5 秒窗口范围的陈旧采样点（保留至少一个早于窗口的基准点以覆盖完整窗口跨度）
          while (samples.length > 2 && now - samples[1].time >= SPEED_WINDOW_MS) {
            samples.shift();
          }

          if (samples.length >= 2) {
            const oldest = samples[0];
            const timeDiff = (now - oldest.time) / 1000;
            const byteDiff = current - oldest.bytes;
            if (timeDiff > 0.3) {
              t.speed = Math.max(0, Math.round(byteDiff / timeDiff));
            }
          } else {
            t.speed = 0;
          }
        } else {
          t.speed = 0;
          delete (t as any)._speedSamples;
          delete (t as any)._lastReceivedBytes;
        }
      });
    }, 1000);


    if (window.electronAPI && window.electronAPI.onDownloadProgress) {
      window.electronAPI.onDownloadProgress(async (data: any) => {
        const index = tasks.value.findIndex(t => t.id === data.id)

        if (index !== -1) {
          const t = tasks.value[index]
          const prevStatus = t.status

          if (data.status) {
            t.status = data.status
          }
          if (data.savePath && data.savePath !== t.savePath) {
            removeFile(t.name, t.savePath)
            t.savePath = data.savePath
            recordFile(t.name, t.savePath)
            dirtyTaskIds.add(t.id)
          }
          if (data.cleanupDirFid && t.panContext) {
            t.panContext.cleanupDirFid = data.cleanupDirFid
            dirtyTaskIds.add(t.id)
          }
          if (data.totalBytes !== undefined) t.totalBytes = data.totalBytes
          if (data.receivedBytes !== undefined) t.receivedBytes = data.receivedBytes
          if (data.downloadedSegments !== undefined) t.downloadedSegments = data.downloadedSegments
          if (data.totalSegments !== undefined) t.totalSegments = data.totalSegments
          if (data.speedText !== undefined) {
            t.speedText = data.speedText
          } else if (t.status !== 'compressing' && t.status !== 'processing' && t.status !== 'waiting') {
            delete t.speedText
          }
          if (data.etaSeconds !== undefined) {
            t.etaSeconds = data.etaSeconds
          } else if (t.status !== 'compressing' && t.status !== 'processing') {
            delete t.etaSeconds
          }
          if (data.errorMsg !== undefined) {
            if (data.errorMsg) {
              t.errorMsg = data.errorMsg
            } else {
              delete t.errorMsg
            }
          } else if (t.status === 'completed' || t.status === 'paused') {
            delete t.errorMsg
          }

          if (data.progress !== undefined && (t.status === 'compressing' || t.status === 'converting' || t.status === 'processing' || t.status === 'waiting')) {
            t.progress = data.progress
          } else if (t.totalSegments && t.totalSegments > 0) {
            t.progress = Math.min(100, Math.round((t.downloadedSegments! / t.totalSegments!) * 100))
          } else if (t.totalBytes > 0) {
            t.progress = Math.min(100, Math.round((t.receivedBytes / t.totalBytes) * 100))
          } else if (data.progress !== undefined) {
            t.progress = data.progress
          }

          t.updatedAt = Date.now()
          if (t.status !== prevStatus) {
            dirtyTaskIds.delete(t.id)
            logger.info('Downloads', `[Renderer] Task ${t.id} status changed: ${prevStatus} -> ${t.status}, progress: ${t.progress}%`)
            await db.downloads.put(serializeTaskForDb(t))
          } else {
            dirtyTaskIds.add(t.id)
          }

          const activeStatuses = ['downloading', 'resolving', 'converting', 'compressing', 'processing', 'waiting']

          // Reset error notification flag when task starts downloading
          if (activeStatuses.includes(t.status)) {
            notifiedErrorTaskIds.delete(t.id)
          }

          // Trigger notifications & messages
          if (t.status === 'compressing' && (prevStatus === 'downloading' || prevStatus === 'converting' || prevStatus === 'resolving')) {
            // Auto-compression started
            const { useMessage } = await import('@/composables/useMessage')
            useMessage().showMessage(`任务 "${t.name}" 下载完成，开始压缩`, 'info')
          } else if (prevStatus === 'compressing' && t.status === 'completed') {
            // Compression completed
            notifiedErrorTaskIds.delete(t.id)
            const { useMessage } = await import('@/composables/useMessage')
            useMessage().showMessage(`任务 "${t.name}" 压缩完成`, 'success')
            recordFile(t.name, t.savePath)
          } else if (activeStatuses.includes(prevStatus) && t.status === 'completed') {
            // Normal download completed (without compression)
            notifiedErrorTaskIds.delete(t.id)
            const { useMessage } = await import('@/composables/useMessage')
            useMessage().showMessage(`任务 "${t.name}" 下载完成`, 'success')
            recordFile(t.name, t.savePath)
          } else if (activeStatuses.includes(prevStatus) && t.status === 'error') {
            if (!notifiedErrorTaskIds.has(t.id)) {
              notifiedErrorTaskIds.add(t.id)
              const { useNotification } = await import('@/composables/useNotification')
              useNotification().showNotification({
                type: 'error',
                title: '下载失败',
                message: t.name,
                detail: t.errorMsg,
                sourceRoute: '/'
              })
            }
          }

          if (t.status === 'completed' && prevStatus !== 'completed' && t.panContext?.cleanupDirFid) {
            releaseUnusedCleanupDirs([t.panContext])
          }
        }
      })
    }

    if (!dirtyFlushTimer) {
      dirtyFlushTimer = setInterval(() => {
        void flushDirtyTasks()
      }, 3000)
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          void flushDirtyTasks()
        })
      }
    }

    if (window.electronAPI && window.electronAPI.onTrayResumeAll) {
      window.electronAPI.onTrayResumeAll(async () => {
        logger.info('Downloads', `[Renderer] 收到托盘「全部继续」指令`)
        const eligibleTasks = tasks.value.filter(t => ['paused', 'error', 'file_removed', 'file_corrupted'].includes(t.status))
        for (const t of eligibleTasks) {
          await resumeTask(t.id)
        }
      })
    }

    if (window.electronAPI && window.electronAPI.onTrayPauseAll) {
      window.electronAPI.onTrayPauseAll(async () => {
        logger.info('Downloads', `[Renderer] 收到托盘「全部暂停」指令`)
        const eligibleTasks = tasks.value.filter(t => ['downloading', 'compressing', 'converting', 'processing', 'waiting', 'resolving'].includes(t.status))
        for (const t of eligibleTasks) {
          await pauseTask(t.id)
        }
      })
    }

    const hasPausedTasks = computed(() =>
      tasks.value.some(t => ['paused', 'error', 'file_removed', 'file_corrupted'].includes(t.status))
    )
    watch(hasPausedTasks, (hasPaused) => {
      if (window.electronAPI && window.electronAPI.syncTrayPausedState) {
        window.electronAPI.syncTrayPausedState(hasPaused)
      }
    }, { immediate: true })
  }

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
          return false // Skip download
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

  const updateTaskDb = async (task: DownloadTask) => {
    dirtyTaskIds.delete(task.id)
    await db.downloads.put(serializeTaskForDb(task))
  }

  const deleteTask = async (id: string, deleteFile = false) => {
    dirtyTaskIds.delete(id)
    const t = tasks.value.find(t => t.id === id)
    if (t) {
      if (['downloading', 'resolving', 'converting', 'compressing', 'processing', 'waiting'].includes(t.status)) {
        if (window.electronAPI) window.electronAPI.cancelDownload(id)
      }
      const isUnfinished = t.status !== 'completed';
      const shouldDeleteFile = deleteFile || isUnfinished;
      if (shouldDeleteFile && window.electronAPI) {
        await window.electronAPI.deleteFile(t.savePath)
        removeFile(t.name, t.savePath)
      }
      await db.downloads.delete(id)
      tasks.value = tasks.value.filter(task => task.id !== id)
      releaseUnusedCleanupDirs([t.panContext])
    }
  }

  const auditDiskFiles = async () => {
    if (!window.electronAPI) return 0;
    const pathList = Array.from(new Set(tasks.value.map(t => t.savePath).filter(Boolean)));
    if (pathList.length === 0) return 0;

    let existsMap: Record<string, boolean> = {};
    try {
      if (window.electronAPI.filesExistBatch) {
        existsMap = await window.electronAPI.filesExistBatch(pathList);
      } else if (window.electronAPI.fileExists) {
        for (const p of pathList) {
          existsMap[p] = await window.electronAPI.fileExists(p);
        }
      }
    } catch {
      return 0;
    }

    const changedTasks: DownloadTask[] = [];
    for (const t of tasks.value) {
      if (!t.savePath) continue;
      const exists = !!existsMap[t.savePath];
      if (!exists && t.status === 'completed') {
        t.status = 'file_removed';
        t.speed = 0;
        delete t.errorMsg;
        changedTasks.push(t);
        removeFile(t.name, t.savePath, true);
      } else if (exists && (t.status === 'file_removed' || t.status === 'file_corrupted')) {
        t.status = 'completed';
        t.progress = 100;
        t.speed = 0;
        delete t.errorMsg;
        changedTasks.push(t);
        recordFile(t.name, t.savePath, true);
      }
    }

    if (changedTasks.length > 0) {
      await db.downloads.bulkPut(changedTasks.map(serializeTaskForDb));
    }
    return changedTasks.length;
  };

  return {
    tasks,
    isInitialized,
    loadTasks,
    initListeners,
    addDownload,
    addDownloadsBatch,
    pauseTask,
    resumeTask,
    deleteTask,
    updateTaskDb,
    auditDiskFiles
  }
}
