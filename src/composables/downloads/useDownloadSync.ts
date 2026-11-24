import { computed, watch } from 'vue'
import { db } from '@/db'
import { logger } from '@/services/logger'
import type { useFileDeduplication } from '@/composables/useFileDeduplication'
import {
  tasks,
  dirtyTaskIds,
  notifiedErrorTaskIds,
  serializeTaskForDb,
  releaseUnusedCleanupDirs,
  flushDirtyTasks
} from '@/composables/downloads/persistence'

type FileDeduplicationApi = ReturnType<typeof useFileDeduplication>

export interface DownloadSyncDeps {
  pauseTask: (id: string) => Promise<void>
  resumeTask: (id: string) => Promise<void>
  recordFile: FileDeduplicationApi['recordFile']
  removeFile: FileDeduplicationApi['removeFile']
}

let isListenersInitialized = false
let dirtyFlushTimer: ReturnType<typeof setInterval> | null = null

/**
 * 构建主进程下载进度同步、滑动窗口测速、托盘联动与 Dexie 节流刷写控制器
 */
export const createDownloadSync = (deps: DownloadSyncDeps) => {
  const { pauseTask, resumeTask, recordFile, removeFile } = deps

  const initListeners = () => {
    if (isListenersInitialized) {
      logger.info('Downloads', `[Renderer] initListeners skipped: already initialized.`)
      return
    }

    logger.info('Downloads', `[Renderer] initListeners binding to onDownloadProgress...`)
    isListenersInitialized = true

    // 5秒滑动统计窗口采样计算，平滑瞬时波动，消除分片交替时的 0B/s 抖动
    const SPEED_WINDOW_MS = 5000
    setInterval(() => {
      if (tasks.value.length === 0) return
      const hasDownloading = tasks.value.some(t => t.status === 'downloading')
      if (!hasDownloading) {
        // 当没有下载中任务时，仅在存在残留测速样本或速度不为 0 时做一次清理重置，随后空闲跳过
        let hadDirtyState = false
        for (let i = 0; i < tasks.value.length; i++) {
          const t = tasks.value[i]
          if ((t as any)._speedSamples || t.speed > 0) {
            t.speed = 0
            delete (t as any)._speedSamples
            delete (t as any)._lastReceivedBytes
            hadDirtyState = true
          }
        }
        if (!hadDirtyState) return
      }

      const now = Date.now()
      tasks.value.forEach(t => {
        if (t.status === 'downloading') {
          const current = t.receivedBytes || 0
          let samples: Array<{ time: number; bytes: number }> = (t as any)._speedSamples
          if (!samples) {
            samples = []
            ;(t as any)._speedSamples = samples
          }
          samples.push({ time: now, bytes: current })

          // 移出超出 5 秒窗口范围的陈旧采样点（保留至少一个早于窗口的基准点以覆盖完整窗口跨度）
          while (samples.length > 2 && now - samples[1].time >= SPEED_WINDOW_MS) {
            samples.shift()
          }

          if (samples.length >= 2) {
            const oldest = samples[0]
            const timeDiff = (now - oldest.time) / 1000
            const byteDiff = current - oldest.bytes
            if (timeDiff > 0.3) {
              t.speed = Math.max(0, Math.round(byteDiff / timeDiff))
            }
          } else {
            t.speed = 0
          }
        } else {
          t.speed = 0
          delete (t as any)._speedSamples
          delete (t as any)._lastReceivedBytes
        }
      })
    }, 1000)

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

          if (data.canSkipFailedSegments !== undefined) {
            if (data.canSkipFailedSegments) {
              t.canSkipFailedSegments = true
            } else {
              delete t.canSkipFailedSegments
            }
          } else if (['completed', 'converting', 'compressing', 'resolving', 'error'].includes(t.status)) {
            delete t.canSkipFailedSegments
          }

          if (data.failedSegmentsCount !== undefined) {
            if (data.failedSegmentsCount > 0) {
              t.failedSegmentsCount = data.failedSegmentsCount
            } else {
              delete t.failedSegmentsCount
            }
          } else if (['completed', 'converting', 'compressing', 'resolving', 'error'].includes(t.status)) {
            delete t.failedSegmentsCount
          }

          if (data.skippedSegments !== undefined) {
            if (data.skippedSegments > 0) {
              t.skippedSegments = data.skippedSegments
            } else {
              delete t.skippedSegments
            }
          }

          if (data.progress !== undefined && (t.status === 'completed' || t.status === 'compressing' || t.status === 'converting' || t.status === 'processing' || t.status === 'waiting')) {
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
            const skipped = data.skippedSegments ?? t.skippedSegments ?? 0
            const { useMessage } = await import('@/composables/useMessage')
            useMessage().showMessage(
              skipped > 0
                ? `任务 "${t.name}" 压缩完成（已跳过 ${skipped} 个失效分片）`
                : `任务 "${t.name}" 压缩完成`,
              'success'
            )
            recordFile(t.name, t.savePath)
          } else if (activeStatuses.includes(prevStatus) && t.status === 'completed') {
            // Normal download completed (without compression)
            notifiedErrorTaskIds.delete(t.id)
            const skipped = data.skippedSegments ?? t.skippedSegments ?? 0
            const { useMessage } = await import('@/composables/useMessage')
            useMessage().showMessage(
              skipped > 0
                ? `任务 "${t.name}" 下载完成（已跳过 ${skipped} 个失效分片）`
                : `任务 "${t.name}" 下载完成`,
              'success'
            )
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

  return { initListeners }
}
