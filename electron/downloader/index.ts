import { storeManager } from '../store'
import { logger } from '../logger'
import { ensureSafeTargetSavePath } from '../utils/fileSystem'
import { panService } from '../pan/service'
import {
  ActiveDownloadEntry,
  DownloadCommand,
  TaskStats,
  formatSpeed
} from './types'
import {
  computeOptimalChunkSize,
  computeOptimalConcurrency,
  fetchWithRedirectGuard,
  getHeadersForUrl
} from './httpClient'
import {
  formatTransientErrorMessage,
  getTransientRetryDelay,
  isTransientNetworkError
} from './retryAndDiag'
import { isM3U8UrlOrContent } from './m3u8Parser'
import { VideoCompressQueue, getVideoMediaInfo } from './compressQueue'
import { downloadDirectFileTask } from './directRunner'
import { downloadM3U8Task, executeSkipFailedM3U8Segments } from './m3u8Runner'

export type {
  PanDownloadContext,
  DownloadCommand,
  M3U8Segment,
  M3U8ParseResult,
  TaskStats
} from './types'
export {
  computeOptimalChunkSize,
  computeOptimalConcurrency,
  fetchWithRedirectGuard,
  getHeadersForUrl,
  isTransientNetworkError,
  formatTransientErrorMessage,
  getTransientRetryDelay,
  formatSpeed
}

class Downloader {
  private activeDownloads: Map<string, ActiveDownloadEntry> = new Map()
  private startingIds: Set<string> = new Set()
  private skippingIds: Set<string> = new Set()
  private pendingQueue: DownloadCommand[] = []
  private mainWindow: any = null
  private taskSpeedMap: Map<string, { speed: number; lastTime: number }> = new Map()
  private onStatsChangeCallback?: () => void
  private compressQueueManager: VideoCompressQueue

  constructor() {
    this.compressQueueManager = new VideoCompressQueue({
      sendProgress: (payload) => this.sendProgress(payload),
      onStatsChange: () => this.onStatsChangeCallback?.()
    })
  }

  hasUnfinishedTempDirRef(panType: string, cleanupDirFid: string, excludeTaskId?: string): boolean {
    if (!panType || !cleanupDirFid) return false
    let found = false
    this.activeDownloads.forEach((entry, id) => {
      if (id === excludeTaskId || entry.abortController.signal.aborted) return
      const ctx = entry.cmd?.panContext
      if (ctx && ctx.panType === panType && ctx.cleanupDirFid === cleanupDirFid) {
        found = true
      }
    })
    if (found) return true
    return this.pendingQueue.some((c) => {
      if (c.id === excludeTaskId) return false
      return c.panContext?.panType === panType && c.panContext?.cleanupDirFid === cleanupDirFid
    })
  }

  setOnStatsChange(callback: () => void) {
    this.onStatsChangeCallback = callback
  }

  getTaskStats(): TaskStats {
    const downloadingCount = this.activeDownloads.size
    const queuedCount = this.pendingQueue.length
    const compressingCount = this.compressQueueManager.getCompressingCount()

    let totalSpeed = 0
    const now = Date.now()

    if (downloadingCount === 0) {
      this.taskSpeedMap.clear()
    } else {
      const toDelete: string[] = []
      this.taskSpeedMap.forEach((record, id) => {
        if (!this.activeDownloads.has(id) || now - record.lastTime > 4000) {
          toDelete.push(id)
        } else {
          totalSpeed += record.speed
        }
      })
      toDelete.forEach(id => this.taskSpeedMap.delete(id))
    }

    return {
      downloadingCount,
      queuedCount,
      compressingCount,
      speed: Math.round(totalSpeed),
      speedText: formatSpeed(totalSpeed)
    }
  }

  pauseAll() {
    logger.info('Downloader', `[Downloader] 执行 pauseAll: 暂停所有活跃、排队与压缩任务`)
    const queuedIds = this.pendingQueue.map(c => c.id)
    for (const id of queuedIds) {
      this.pauseDownload(id)
    }
    const compPauseIds = this.compressQueueManager.getTaskIdsToPause()
    for (const id of compPauseIds) {
      this.pauseDownload(id)
    }
    const activeIds: string[] = []
    this.activeDownloads.forEach((_, id) => {
      activeIds.push(id)
    })
    for (const id of activeIds) {
      this.pauseDownload(id)
    }
    this.taskSpeedMap.clear()
    this.onStatsChangeCallback?.()
  }

  setWindow(window: any) {
    this.mainWindow = window
    logger.info('Downloader', `[Downloader] MainWindow 已成功绑定和初始化。`)
  }

  async startDownload(cmd: DownloadCommand) {
    cmd.savePath = ensureSafeTargetSavePath(cmd.savePath)
    logger.info('Downloader', `[Downloader] startDownload ID: ${cmd.id}, URL: ${cmd.url}, savePath: ${cmd.savePath}, startBytes: ${cmd.startBytes}`)

    if (this.startingIds.has(cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 正在调度中，跳过重复添加。`)
      return
    }

    if (this.compressQueueManager.isTaskInCompress(cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在压缩队列或压缩中，跳过重复添加。`)
      return
    }

    // 同步原子占位，防止微任务期间重入触发重复调度
    this.startingIds.add(cmd.id)
    try {
      const existingActive = this.activeDownloads.get(cmd.id)
      if (existingActive) {
        if (existingActive.abortController.signal.aborted && existingActive.donePromise) {
          logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 正在释放文件句柄，等待就绪后继续...`)
          await existingActive.donePromise.catch(() => {})
        } else {
          logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在下载中，跳过重复添加。`)
          return
        }
      }

      if (
        this.activeDownloads.has(cmd.id) ||
        this.pendingQueue.some(c => c.id === cmd.id)
      ) {
        logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在队列或下载中，跳过重复添加。`)
        return
      }

      if (!cmd.enqueuedAt) {
        cmd.enqueuedAt = Date.now()
      }

      let maxConcurrent = 3
      try {
        maxConcurrent = (await storeManager.getSetting('maxConcurrentDownloads')) || 3
      } catch {
        maxConcurrent = 3
      }

      if (this.activeDownloads.size < maxConcurrent) {
        this.runTask(cmd)
      } else {
        this.pendingQueue.push(cmd)
        this.sendProgress({
          id: cmd.id,
          totalBytes: cmd.totalBytes || 0,
          receivedBytes: cmd.startBytes || 0,
          status: 'waiting',
          speed: 0
        })
      }
    } finally {
      this.startingIds.delete(cmd.id)
    }
  }

  private buildTaskHeaders(cmd: DownloadCommand, targetUrl?: string): Record<string, string> {
    const resolvedUrl = targetUrl || cmd.url
    const baseHeaders = getHeadersForUrl(resolvedUrl, cmd.referer, cmd.origin, undefined, {
      allowPanCookies: Boolean(cmd.panContext),
      panType: cmd.panContext?.panType
    })
    const cachedPanHeaders = resolvedUrl ? panService.getCachedHeadersForUrl(resolvedUrl) : undefined
    const merged: Record<string, string> = {}
    const assignNonEmpty = (src?: Record<string, string>) => {
      if (!src) return
      for (const [k, v] of Object.entries(src)) {
        if (v !== undefined && v !== null && v !== '') {
          merged[k] = v
        }
      }
    }
    assignNonEmpty(baseHeaders)
    assignNonEmpty(cmd.headers)
    assignNonEmpty(cachedPanHeaders)
    return merged
  }

  private async refreshCommandPanLink(cmd: DownloadCommand, forceSession = false): Promise<boolean> {
    if (!cmd.panContext) return false
    const ctx = cmd.panContext
    try {
      if (forceSession) {
        panService.invalidatePanSession(ctx.panType as any)
      }
      if (ctx.mode === 'share') {
        const res = await panService.getShareDownloadUrls(ctx.panType as any, [
          {
            fid: ctx.fid,
            fidToken: ctx.fidToken,
            pwdId: ctx.pwdId,
            stoken: ctx.stoken,
            extra: ctx.extra
          }
        ])
        const link = res.links?.[ctx.fid]
        const nextUrl = link?.url || res.urls?.[ctx.fid]
        if (nextUrl) {
          if (link?.cleanupDirFid && link.cleanupDirFid !== ctx.cleanupDirFid) {
            const oldDirFid = ctx.cleanupDirFid
            ctx.cleanupDirFid = link.cleanupDirFid
            this.sendProgress({ id: cmd.id, cleanupDirFid: link.cleanupDirFid })
            if (oldDirFid && !this.hasUnfinishedTempDirRef(ctx.panType, oldDirFid, cmd.id)) {
              panService.cleanupTempDir(ctx.panType as any, oldDirFid).catch(() => {})
            }
          }
          cmd.url = nextUrl
          if (link?.headers) {
            cmd.headers = { ...(cmd.headers || {}), ...link.headers }
          }
          cmd.enqueuedAt = Date.now()
          logger.info('Downloader', `[PanRefresh] 任务 ${cmd.id} 分享直链自动刷新成功`)
          return true
        }
      } else {
        const res = await panService.getDriveDownloadUrls(ctx.panType as any, [ctx.fid])
        const link = res.links?.[ctx.fid]
        const nextUrl = link?.url || res.urls?.[ctx.fid]
        if (nextUrl) {
          cmd.url = nextUrl
          if (link?.headers) {
            cmd.headers = { ...(cmd.headers || {}), ...link.headers }
          }
          cmd.enqueuedAt = Date.now()
          logger.info('Downloader', `[PanRefresh] 任务 ${cmd.id} 个人盘直链自动刷新成功`)
          return true
        }
      }
    } catch (err: any) {
      logger.warn('Downloader', `[PanRefresh] 任务 ${cmd.id} 自动重取直链失败: ${err.message}`)
    }
    return false
  }

  private sendProgress(payload: any) {
    if (payload?.id) {
      if (payload.status === 'downloading' && typeof payload.speed === 'number') {
        this.taskSpeedMap.set(payload.id, { speed: Math.max(0, payload.speed), lastTime: Date.now() })
      } else if (payload.status && ['completed', 'paused', 'error', 'failed'].includes(payload.status)) {
        this.taskSpeedMap.delete(payload.id)
      }
    }
    this.onStatsChangeCallback?.()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('download-progress', payload)
    }
  }

  private runTask(cmd: DownloadCommand) {
    const abortController = new AbortController()
    const entry: ActiveDownloadEntry = {
      abortController,
      cmd
    }
    this.activeDownloads.set(cmd.id, entry)
    const execPromise = this.executeTaskInternal(cmd, abortController)
    entry.donePromise = execPromise
    return execPromise
  }

  private async executeTaskInternal(cmd: DownloadCommand, abortController: AbortController) {
    this.sendProgress({ id: cmd.id, status: 'resolving', speed: 0 })

    let downloadResult: { filePath: string; fileSize: number; totalSegments?: number } | null = null

    try {
      // 若排队超 25 分钟，或重启恢复任务/当前进程缺少网盘鉴权头缓存时，先自动重取新鲜直链与最新凭据头
      if (cmd.panContext) {
        const hasCachedHeaders = panService.getCachedHeadersForUrl(cmd.url) !== undefined
        const queueExpired = Boolean(cmd.enqueuedAt && Date.now() - cmd.enqueuedAt > 25 * 60 * 1000)
        if (queueExpired || !hasCachedHeaders) {
          await this.refreshCommandPanLink(cmd, false)
        }
      }

      const headers = this.buildTaskHeaders(cmd)
      const isM3U8 = await isM3U8UrlOrContent(cmd.url, headers, abortController.signal, cmd.savePath)
      if (isM3U8) {
        downloadResult = await downloadM3U8Task(cmd, abortController, {
          buildTaskHeaders: (c, u) => this.buildTaskHeaders(c, u),
          sendProgress: (p) => this.sendProgress(p)
        })
      } else {
        downloadResult = await downloadDirectFileTask(cmd, abortController, {
          buildTaskHeaders: (c, u) => this.buildTaskHeaders(c, u),
          refreshCommandPanLink: (c, f) => this.refreshCommandPanLink(c, f),
          sendProgress: (p) => this.sendProgress(p),
          getTaskSpeed: (taskId) => this.taskSpeedMap.get(taskId)?.speed || 0
        })
      }
    } catch (err: any) {
      logger.error('Downloader', `[Downloader] 任务 ${cmd.id} 执行异常: ${err.message}`)
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        if (this.activeDownloads.get(cmd.id)?.switchingToSkip) {
          return
        }
        const pausedPayload: any = {
          id: cmd.id,
          status: 'paused',
          speed: 0,
          errorMsg: typeof err?.errorMsg === 'string' ? err.errorMsg : '',
          canSkipFailedSegments: Boolean(err?.canSkipFailedSegments),
          failedSegmentsCount: typeof err?.failedSegmentsCount === 'number' ? err.failedSegmentsCount : 0
        }
        if (typeof err?.savedBytes === 'number') {
          pausedPayload.receivedBytes = err.savedBytes
        }
        if (typeof err?.downloadedSegments === 'number') {
          pausedPayload.downloadedSegments = err.downloadedSegments
        }
        this.sendProgress(pausedPayload)
      } else {
        this.sendProgress({ id: cmd.id, status: 'error', errorMsg: err.message, speed: 0 })
      }
      return
    } finally {
      this.activeDownloads.delete(cmd.id)
      this.checkQueue()
    }

    if (downloadResult) {
      await this.compressQueueManager.handlePostDownload(
        cmd.id,
        downloadResult.filePath,
        downloadResult.fileSize,
        downloadResult.totalSegments
      )
    }
  }

  async skipFailedM3U8Segments(cmd: DownloadCommand): Promise<{ success: boolean; skippedSegments?: number; error?: string }> {
    if (!cmd?.id || !cmd?.savePath) {
      return { success: false, error: '无效的任务参数' }
    }
    const safeSavePath = ensureSafeTargetSavePath(cmd.savePath)
    if (this.skippingIds.has(cmd.id)) {
      return { success: false, error: '任务正在执行跳过封装中' }
    }
    if (this.compressQueueManager.isTaskInCompress(cmd.id)) {
      return { success: false, error: '任务正在压缩队列中' }
    }

    this.skippingIds.add(cmd.id)
    try {
      const pendingIdx = this.pendingQueue.findIndex(c => c.id === cmd.id)
      if (pendingIdx !== -1) {
        this.pendingQueue.splice(pendingIdx, 1)
      }

      const activeEntry = this.activeDownloads.get(cmd.id)
      if (activeEntry) {
        activeEntry.switchingToSkip = true
        if (!activeEntry.abortController.signal.aborted) {
          activeEntry.abortController.abort(new DOMException('Switching to skip failed segments', 'AbortError'))
        }
        if (activeEntry.donePromise) {
          await activeEntry.donePromise.catch(() => {})
        }
      }

      return await executeSkipFailedM3U8Segments(cmd, safeSavePath, {
        sendProgress: (payload) => this.sendProgress(payload),
        registerActive: (abortController) => {
          this.activeDownloads.set(cmd.id, { abortController, cmd })
        },
        unregisterActive: () => {
          this.activeDownloads.delete(cmd.id)
          this.checkQueue()
        },
        handlePostDownload: (taskId, filePath, fileSize, totalSegments, skippedSegments, downloadedSegments) =>
          this.compressQueueManager.handlePostDownload(taskId, filePath, fileSize, totalSegments, skippedSegments, downloadedSegments)
      })
    } finally {
      this.skippingIds.delete(cmd.id)
    }
  }

  private async checkQueue() {
    let maxConcurrent = 3
    try {
      maxConcurrent = (await storeManager.getSetting('maxConcurrentDownloads')) || 3
    } catch {
      maxConcurrent = 3
    }

    while (this.activeDownloads.size < maxConcurrent && this.pendingQueue.length > 0) {
      const nextCmd = this.pendingQueue.shift()!
      this.runTask(nextCmd)
    }
  }

  pauseDownload(id: string) {
    // 1. 如果在待下载队列中
    const queueIndex = this.pendingQueue.findIndex(c => c.id === id)
    if (queueIndex !== -1) {
      this.pendingQueue.splice(queueIndex, 1)
      this.sendProgress({ id, status: 'paused', speed: 0 })
      this.checkQueue()
      return
    }

    // 2. 如果在待压缩队列或正在压缩中
    if (this.compressQueueManager.pauseTask(id)) {
      return
    }

    // 3. 如果当前正在下载中（仅发出中止信号，由 runTask/executeTaskInternal 的 finally 在文件句柄关闭后统一释放 activeDownloads 并调度队列）
    if (this.activeDownloads.has(id)) {
      const entry = this.activeDownloads.get(id)!
      entry.abortController.abort()
    }
  }

  cancelDownload(id: string) {
    this.pauseDownload(id)
  }

  async getVideoMediaInfo(filePath: string): Promise<{ duration: number; bitrate: number; size: number }> {
    return getVideoMediaInfo(filePath)
  }

  async compressVideoTask(
    taskId: string,
    filePath: string,
    targetBitrateKbps: number
  ): Promise<{ success: boolean; newSize?: number; error?: string; skipped?: boolean }> {
    return this.compressQueueManager.compressVideoTask(taskId, filePath, targetBitrateKbps)
  }
}

export const downloader = new Downloader()
