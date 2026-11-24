import { ref } from 'vue'
import { db, type DownloadTask, type PanTaskContext } from '@/db'
import { logger } from '@/services/logger'
import { notifyPanDirectoryChanged } from '@/composables/pan/usePanRefreshBus'

export interface BatchDownloadInput {
  url: string
  name: string
  savePath: string
  customReferer?: string
  headers?: Record<string, string>
  totalBytes?: number
  panContext?: PanTaskContext
}

export const tasks = ref<DownloadTask[]>([])
export const isInitialized = ref(false)
export const notifiedErrorTaskIds = new Set<string>()
export const dirtyTaskIds = new Set<string>()

export const clonePanContext = (ctx?: PanTaskContext): PanTaskContext | undefined => {
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

export const sanitizeHeadersForDb = (headers?: Record<string, string>): Record<string, string> | undefined => {
  if (!headers) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase()
    if (lower === 'cookie' || lower === 'authorization' || lower === 'x-velora-client-id') continue
    out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export const serializeTaskForDb = (t: DownloadTask): DownloadTask => ({
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
  ...(t.canSkipFailedSegments ? { canSkipFailedSegments: true } : {}),
  ...(t.failedSegmentsCount !== undefined && t.failedSegmentsCount > 0 ? { failedSegmentsCount: t.failedSegmentsCount } : {}),
  ...(t.skippedSegments !== undefined && t.skippedSegments > 0 ? { skippedSegments: t.skippedSegments } : {}),
  ...(t.referer !== undefined ? { referer: t.referer } : {}),
  ...(sanitizeHeadersForDb(t.headers) ? { headers: sanitizeHeadersForDb(t.headers) } : {}),
  ...(t.panContext ? { panContext: clonePanContext(t.panContext) } : {}),
  ...(t.errorMsg !== undefined ? { errorMsg: t.errorMsg } : {}),
  ...(t.speedText !== undefined ? { speedText: t.speedText } : {}),
  ...(t.etaSeconds !== undefined ? { etaSeconds: t.etaSeconds } : {}),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt
})

export const releaseUnusedCleanupDirs = (contexts: Array<PanTaskContext | undefined>) => {
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
      void window.electronAPI.cleanupPanTempDir({ type: panType, cleanupDirFid })
        .then((res) => {
          if (res?.success) {
            notifyPanDirectoryChanged({ panType, dirFids: ['0'], refreshQuota: true })
          }
        })
        .catch(() => {})
    }
  }
}

export const flushDirtyTasks = async () => {
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

export const normalizeReferer = (customReferer?: string): string | undefined => {
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
