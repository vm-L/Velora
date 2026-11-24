import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { storeManager } from '../store'
import { logger } from '../logger'
import { M3U8SegmentScheduler, isPermanentOriginSegmentError } from '../utils/m3u8Scheduler'
import {
  M3U8SpillPack,
  OrderedM3U8SegmentInput,
  buildCoalescedM3U8StreamPlan,
  cleanupM3U8SpillArtifacts,
  getM3U8SpillPaths,
  hasUnmergedM3U8Spill,
  inspectM3U8SpillForResume,
  materializeSourcesToFile,
  writeBufferFully
} from '../utils/m3u8SpillPack'
import type { DownloadCommand, HttpErrorDiag, ManagedFetchHandle, M3U8ParseResult } from './types'
import {
  buildRequestHeaderSummary,
  createHttpResponseError,
  extractHttpStatusCode,
  formatTransientErrorMessage,
  getTransientRetryDelay,
  isTransientNetworkError,
  readResponseBufferWithIdleTimeout,
  sanitizeUrlDiagnostic,
  sleepWithAbort
} from './retryAndDiag'
import { M3U8_SESSION_POOL_SIZE, fetchM3U8WithManagedTimeout, parseM3U8 } from './m3u8Parser'
import { remuxToMp4, remuxToMp4FromSources } from './m3u8Remuxer'
import { getVideoDurationAndBitrate } from './compressQueue'

export interface M3U8RunnerHost {
  buildTaskHeaders: (cmd: DownloadCommand, targetUrl?: string) => Record<string, string>
  sendProgress: (payload: any) => void
}

export interface M3U8SkipHost {
  sendProgress: (payload: any) => void
  registerActive: (abortController: AbortController) => void
  unregisterActive: () => void
  handlePostDownload: (
    taskId: string,
    filePath: string,
    fileSize: number,
    totalSegments?: number,
    skippedSegments?: number,
    downloadedSegments?: number
  ) => Promise<void>
}

/**
 * M3U8 断点续传、多分片并发下载、单文件顺序溢写包 (.spill.bin) 与流式直封装
 */
export async function downloadM3U8Task(
  cmd: DownloadCommand,
  abortController: AbortController,
  host: M3U8RunnerHost
): Promise<{ filePath: string; fileSize: number; totalSegments: number }> {
  const { id, url, savePath } = cmd

  const dir = path.dirname(savePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  let finalSavePath = savePath
  if (!finalSavePath.toLowerCase().endsWith('.mp4') && !finalSavePath.toLowerCase().endsWith('.mkv')) {
    if (finalSavePath.toLowerCase().endsWith('.m3u8') || finalSavePath.toLowerCase().endsWith('.ts')) {
      finalSavePath = finalSavePath.replace(/\.(m3u8|ts)$/i, '.mp4')
    } else {
      finalSavePath = finalSavePath + '.mp4'
    }
  }
  const isTargetMp4 = true
  const tempMp4Path = finalSavePath + '.temp.mp4'
  const tempTsPath = finalSavePath + '.temp.ts'
  const spillPaths = getM3U8SpillPaths(finalSavePath)

  // 1. 检查是否已有完整封装的目标文件（仅当记录的分片数已达到总分片数且有效封装时才跳过）
  if (fs.existsSync(finalSavePath) && !fs.existsSync(tempMp4Path) && !fs.existsSync(tempTsPath) && !hasUnmergedM3U8Spill(finalSavePath)) {
    try {
      const stat = fs.statSync(finalSavePath)
      const isSegmentsFullyRecorded = cmd.totalSegments && cmd.downloadedSegments && cmd.downloadedSegments >= cmd.totalSegments
      if (stat.size > 0 && isSegmentsFullyRecorded) {
        const info = await getVideoDurationAndBitrate(finalSavePath)
        if (info.duration > 0) {
          logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 目标文件已完整存在 (大小: ${stat.size}B, 时长: ${info.duration}s)，跳过下载`)
          return {
            filePath: finalSavePath,
            fileSize: stat.size,
            totalSegments: cmd.totalSegments
          }
        }
      }
    } catch (e: any) {
      logger.warn('Downloader', `[M3U8Downloader] 检查已存在目标文件异常: ${e.message}`)
    }
  }

  logger.info('Downloader', `[M3U8Downloader] 开始解析并下载 M3U8 资源: ${url}`)

  let maxMemoryMB = 128
  try {
    maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 128
  } catch {
    maxMemoryMB = 128
  }
  const maxMemoryBytes = maxMemoryMB * 1024 * 1024

  const headers = host.buildTaskHeaders(cmd, url)

  let parseResult: M3U8ParseResult | null = null
  let parseAttempts = 0
  const maxParseTransientAttempts = 15
  while (!parseResult) {
    if (abortController.signal.aborted) {
      throw new DOMException('User aborted download', 'AbortError')
    }
    try {
      parseResult = await parseM3U8(url, headers, abortController.signal, parseAttempts)
    } catch (err: any) {
      if (abortController.signal.aborted && err?.name === 'AbortError') throw err
      if (abortController.signal.aborted) {
        throw new DOMException('User aborted download', 'AbortError')
      }
      if (isTransientNetworkError(err) || err?.name === 'AbortError') {
        parseAttempts++
        if (parseAttempts >= maxParseTransientAttempts) {
          throw new Error(`解析 M3U8 列表连续重试 ${maxParseTransientAttempts} 次仍失败: ${err.message}`)
        }
        const friendlyMsg = formatTransientErrorMessage(err)
        logger.warn('Downloader', `[M3U8Downloader] 解析 M3U8 列表遭遇网络波动，正在后台自动重试 (第 ${parseAttempts} 次): ${err.message}`)
        host.sendProgress({
          id,
          status: 'resolving',
          speed: 0,
          errorMsg: `正在重试: ${friendlyMsg}`
        })
        await sleepWithAbort(getTransientRetryDelay(parseAttempts, err), abortController.signal)
        continue
      }
      throw err
    }
  }

  const { segments, isFmp4 } = parseResult
  if (segments.length === 0) {
    throw new Error('M3U8 列表中未解析到任何可下载的分片视频')
  }
  logger.info('Downloader', `[M3U8Downloader] 成功解析出 ${segments.length} 个 ${isFmp4 ? 'fMP4/m4s' : 'TS'} 视频分片`)

  let workSavePath = isFmp4 ? tempMp4Path : tempTsPath
  if (!fs.existsSync(workSavePath) && fs.existsSync(tempTsPath)) {
    workSavePath = tempTsPath
  }

  // 2. 检查临时文件是否已全量就绪（必须满足分片数全量达到总分片数且无未合并的乱序溢写包）
  if (fs.existsSync(workSavePath)) {
    try {
      const stat = fs.statSync(workSavePath)
      const isReadyForConvert = cmd.downloadedSegments !== undefined &&
        cmd.downloadedSegments > 0 &&
        (
          (cmd.totalSegments !== undefined && cmd.downloadedSegments >= cmd.totalSegments) ||
          (segments.length > 0 && cmd.downloadedSegments >= segments.length)
        ) &&
        stat.size > 0 &&
        !hasUnmergedM3U8Spill(finalSavePath)

      if (isReadyForConvert) {
        logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 临时文件已完整落盘 (${stat.size} 字节, ${cmd.downloadedSegments}/${cmd.totalSegments || cmd.downloadedSegments} 分片)，直接进入格式转换`)
        if (isTargetMp4) {
          await remuxToMp4(workSavePath, finalSavePath, isFmp4, abortController, id, host.sendProgress)
        }
        const targetVideoFile = isTargetMp4 ? finalSavePath : workSavePath
        const finalFileSize = fs.existsSync(targetVideoFile) ? fs.statSync(targetVideoFile).size : stat.size
        logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 格式转换完成。文件大小: ${finalFileSize}`)
        return {
          filePath: targetVideoFile,
          fileSize: finalFileSize,
          totalSegments: cmd.totalSegments || cmd.downloadedSegments
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || abortController.signal.aborted) {
        const savedBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
        const pauseErr: any = Object.assign(new Error('User aborted download'), {
          name: 'AbortError',
          savedBytes,
          downloadedSegments: cmd.downloadedSegments
        })
        throw pauseErr
      }
      logger.warn('Downloader', `[M3U8Downloader] 检查临时文件转换就绪异常: ${e.message}，回退至正常解析流程`)
    }
  }

  type SegStoreEntry =
    | { kind: 'mem'; buf: Buffer }
    | { kind: 'spilling'; buf: Buffer }
    | { kind: 'pack'; offset: number; length: number }
    | { kind: 'legacy-disk'; filePath: string; size: number }

  // 3. 检查断点续传：优先恢复单文件顺序包 (.spill.meta.json + .spill.bin)，向下兼容旧 .segs 与纯前缀续传
  let existingBytes = 0
  let existingSpilledBytes = 0
  let skipSegments = 0
  let fileFlags = 'w'
  let spillActive = false
  const segmentStore = new Map<number, SegStoreEntry>()
  const restoredSpilledIndices: number[] = []
  let restoredPackEntries = new Map<number, { offset: number; length: number }>()
  let restoredPackEndOffset = 0

  let inspection = inspectM3U8SpillForResume(finalSavePath, segments.length)
  if (inspection.totalSegmentsMismatch) {
    logger.warn(
      'Downloader',
      `[M3U8Downloader] 溢写缓存分片总数不匹配 (${inspection.totalSegments} !== ${segments.length})，清理旧缓存从头下载`
    )
    await cleanupM3U8SpillArtifacts(finalSavePath)
    inspection = inspectM3U8SpillForResume(finalSavePath, segments.length)
  }

  if (inspection.mode === 'pack' || inspection.mode === 'legacy-segs') {
    spillActive = true
    if (inspection.flushedSegments > 0 && fs.existsSync(workSavePath)) {
      try {
        const stat = fs.statSync(workSavePath)
        if (stat.size > 0) {
          skipSegments = inspection.flushedSegments
          existingBytes = stat.size
          fileFlags = 'a'
        }
      } catch {}
    }
    restoredPackEntries = inspection.packEntries
    restoredPackEndOffset = inspection.packValidEndOffset
    inspection.packEntries.forEach((span, idx) => {
      if (idx < skipSegments || idx >= segments.length) return
      segmentStore.set(idx, { kind: 'pack', offset: span.offset, length: span.length })
      existingSpilledBytes += span.length
      restoredSpilledIndices.push(idx)
    })
    inspection.legacySegFiles.forEach((info, idx) => {
      if (idx < skipSegments || idx >= segments.length || segmentStore.has(idx)) return
      segmentStore.set(idx, { kind: 'legacy-disk', filePath: info.filePath, size: info.size })
      existingSpilledBytes += info.size
      restoredSpilledIndices.push(idx)
    })
    logger.info(
      'Downloader',
      `[M3U8Downloader] 恢复断点续传 (${inspection.mode}): 连续前缀 ${skipSegments}/${segments.length} (${existingBytes} B), 乱序暂存分片 ${restoredSpilledIndices.length} 个 (${existingSpilledBytes} B)`
    )
  } else if (fs.existsSync(workSavePath)) {
    try {
      const stat = fs.statSync(workSavePath)
      existingBytes = stat.size
      if (existingBytes > 0 && cmd.downloadedSegments !== undefined && cmd.downloadedSegments > 0) {
        if (cmd.downloadedSegments < segments.length) {
          skipSegments = cmd.downloadedSegments
          fileFlags = 'a'
          logger.info('Downloader', `[M3U8Downloader] 触发精准断点续传: 已落盘 ${existingBytes} 字节，跳过前 ${skipSegments}/${segments.length} 个分片`)
        } else {
          // 已记录分片已达总数且临时文件完整：跳过分片下载直接进入转封装
          skipSegments = segments.length
          fileFlags = 'a'
          logger.info('Downloader', `[M3U8Downloader] 分片已全量就绪 (${segments.length}/${segments.length})，直接进入转封装步骤`)
        }
      } else {
        skipSegments = 0
        existingBytes = 0
        fileFlags = 'w'
      }
    } catch (e: any) {
      logger.info('Downloader', `[M3U8Downloader] 检查续传状态失败: ${e.message}`)
      skipSegments = 0
      existingBytes = 0
      fileFlags = 'w'
    }
  }

  const alreadyCompletedIndices: number[] = []
  for (let i = 0; i < skipSegments; i++) {
    alreadyCompletedIndices.push(i)
  }
  for (let i = 0; i < restoredSpilledIndices.length; i++) {
    alreadyCompletedIndices.push(restoredSpilledIndices[i])
  }
  const scheduler = new M3U8SegmentScheduler({
    totalSegments: segments.length,
    alreadyCompleted: alreadyCompletedIndices
  })

  const spillPack = new M3U8SpillPack(finalSavePath, {
    totalSegments: segments.length,
    isFmp4,
    flushedSegments: skipSegments,
    initialEntries: restoredPackEntries,
    initialWriteOffset: restoredPackEndOffset
  })
  let fileHandle: fs.promises.FileHandle | null = !spillActive
    ? await fs.promises.open(workSavePath, fileFlags)
    : null
  const keyCache = new Map<string, Buffer>()
  const keyPromiseCache = new Map<string, Promise<Buffer>>()
  let currentBufferedBytes = 0
  let nextFlushIndex = skipSegments
  let flushedSegmentsCount = skipSegments
  let totalReceivedBytes = existingBytes + existingSpilledBytes
  let diskWriteError: Error | null = null
  let writeChain: Promise<void> = Promise.resolve()
  let spillChain: Promise<void> = Promise.resolve()
  let isTaskEnded = false

  let lastReportTime = Date.now()
  let lastReportBytes = totalReceivedBytes
  let lastDataReceivedAt = Date.now()
  let smoothedSpeed = 0

  let authErrorCountSinceRefresh = 0
  let lastPlaylistRefreshAt = 0
  let playlistRefreshPromise: Promise<void> | null = null
  let refreshSessionCounter = 0

  const enqueueSequentialFlush = (forceLog: boolean = false) => {
    if (spillActive || !fileHandle) return
    const steps: Array<{ index: number; entry: SegStoreEntry }> = []
    let memStepBytes = 0
    while (segmentStore.has(nextFlushIndex)) {
      const entry = segmentStore.get(nextFlushIndex)!
      segmentStore.delete(nextFlushIndex)
      if (entry.kind === 'mem' || entry.kind === 'spilling') {
        memStepBytes += entry.buf.length
      }
      steps.push({ index: nextFlushIndex, entry })
      nextFlushIndex++
    }

    if (steps.length === 0) return
    if (forceLog || currentBufferedBytes >= maxMemoryBytes) {
      logger.info('Downloader', `[MemoryBuffer] M3U8 顺序合并落盘 (${steps.length} 分片, 内存待写 ${(memStepBytes / 1024 / 1024).toFixed(2)} MB)`)
    }

    const targetHandle = fileHandle
    writeChain = writeChain.then(async () => {
      if (diskWriteError) {
        currentBufferedBytes = Math.max(0, currentBufferedBytes - memStepBytes)
        return
      }
      try {
        let memGroup: Buffer[] = []
        let memGroupBytes = 0

        const flushMemGroup = async () => {
          if (memGroup.length === 0) return
          const combined = memGroup.length === 1 ? memGroup[0] : Buffer.concat(memGroup)
          const count = memGroup.length
          const bytes = memGroupBytes
          memGroup = []
          memGroupBytes = 0
          try {
            await writeBufferFully(targetHandle, combined)
            flushedSegmentsCount += count
          } finally {
            currentBufferedBytes = Math.max(0, currentBufferedBytes - bytes)
          }
        }

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          if (step.entry.kind === 'mem' || step.entry.kind === 'spilling') {
            memGroup.push(step.entry.buf)
            memGroupBytes += step.entry.buf.length
            if (memGroupBytes >= 16 * 1024 * 1024) {
              await flushMemGroup()
            }
          }
        }
        await flushMemGroup()
      } catch (writeErr: any) {
        diskWriteError = writeErr
        currentBufferedBytes = Math.max(0, currentBufferedBytes - memStepBytes)
        abortController.abort(writeErr)
      }
    })
  }

  const spillOutOfOrderBuffers = (forceAll: boolean = false): Promise<void> => {
    const wasSpillActive = spillActive
    const targets: Array<{ index: number; buf: Buffer }> = []
    const entries = Array.from(segmentStore.entries()).sort((a, b) => a[0] - b[0])
    for (let i = 0; i < entries.length; i++) {
      const idx = entries[i][0]
      const entry = entries[i][1]
      if (entry.kind !== 'mem') continue
      if (idx < nextFlushIndex) continue
      if (!wasSpillActive && !forceAll && idx === nextFlushIndex) continue
      segmentStore.set(idx, { kind: 'spilling', buf: entry.buf })
      targets.push({ index: idx, buf: entry.buf })
    }
    if (targets.length === 0) {
      return spillChain
    }

    // 同步锁定 spillActive，阻止新的顺序刷盘挂载到 writeChain
    spillActive = true

    spillChain = spillChain.then(async () => {
      if (diskWriteError) return
      if (forceAll && !fs.existsSync(path.dirname(spillPaths.spillBinPath))) {
        return
      }

      try {
        await writeChain.catch(() => {})
        if (fileHandle) {
          const fhToClose = fileHandle
          fileHandle = null
          await fhToClose.close().catch(() => {})
        }
        if (diskWriteError) return

        const activeTargets: Array<{ index: number; buf: Buffer }> = []
        for (let i = 0; i < targets.length; i++) {
          const cur = segmentStore.get(targets[i].index)
          if (cur && cur.kind === 'spilling') {
            activeTargets.push(targets[i])
          }
        }
        if (activeTargets.length === 0) {
          return
        }

        const written = await spillPack.appendBatch(activeTargets, flushedSegmentsCount)
        for (let i = 0; i < written.length; i++) {
          const { index, offset, length } = written[i]
          const after = segmentStore.get(index)
          if (after && after.kind === 'spilling') {
            segmentStore.set(index, { kind: 'pack', offset, length })
            currentBufferedBytes = Math.max(0, currentBufferedBytes - after.buf.length)
          }
        }
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          diskWriteError = err
          abortController.abort(err)
        } else {
          logger.warn('Downloader', `[M3U8Downloader] 溢写分片包失败: ${err.message}`)
        }
      }
    })

    return spillChain
  }

  const playlistUrlDiag = sanitizeUrlDiagnostic(url)
  const reqHeaderSummary = buildRequestHeaderSummary(headers)
  let loggedPlaylistDiag = false
  let detailedDiagLoggedCount = 0

  const logPlaylistStructureDiag = () => {
    if (loggedPlaylistDiag) return
    loggedPlaylistDiag = true
    const hostCounts = new Map<string, number>()
    let discCount = 0
    let brCount = 0
    let encCount = 0
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]
      const h = sanitizeUrlDiagnostic(s.url).host
      hostCounts.set(h, (hostCounts.get(h) || 0) + 1)
      if (s.discontinuity) discCount++
      if (s.byteRange) brCount++
      if (s.key && s.key.method !== 'NONE') encCount++
    }
    const hostSummary = Array.from(hostCounts.entries())
      .map(([h, count]) => `${h}(${count})`)
      .join(', ')
    logger.warn(
      'Downloader',
      `[M3U8Downloader] [Diag] 播放列表画像: total=${segments.length}, isFmp4=${isFmp4}, hosts=[${hostSummary}], discontinuity=${discCount}, byteRange=${brCount}, aes128=${encCount}, playlistHost=${playlistUrlDiag.host}, req={${reqHeaderSummary}}`
    )
  }

  const maybeTriggerPlaylistRefresh = async (failCount: number): Promise<void> => {
    const now = Date.now()
    const shouldTrigger = (authErrorCountSinceRefresh >= 3 || failCount >= 2) && (now - lastPlaylistRefreshAt >= 15000)
    if (!shouldTrigger && !playlistRefreshPromise) {
      return
    }
    if (!playlistRefreshPromise) {
      const sessIdx = ++refreshSessionCounter
      const authErrSnapshot = authErrorCountSinceRefresh
      playlistRefreshPromise = (async () => {
        try {
          logger.warn(
            'Downloader',
            `[M3U8Downloader] 检测到连续鉴权失败 (authErr=${authErrSnapshot}, segFailRound=${failCount})，重新拉取 M3U8 列表刷新分片链接`
          )
          const refreshed = await parseM3U8(url, headers, abortController.signal, sessIdx)
          if (abortController.signal.aborted) return
          if (refreshed.segments.length === segments.length) {
            let uncompletedCount = 0
            let changedUrlCount = 0
            let changedKeyCount = 0
            for (let i = 0; i < segments.length; i++) {
              if (scheduler.isCompleted(i)) continue
              uncompletedCount++
              const prevKeyUrl = segments[i].key?.url
              const nextKeyUrl = refreshed.segments[i].key?.url
              if (prevKeyUrl !== nextKeyUrl) {
                changedKeyCount++
              }
              if (segments[i].url !== refreshed.segments[i].url) {
                changedUrlCount++
              }
              segments[i].url = refreshed.segments[i].url
              segments[i].key = refreshed.segments[i].key
            }
            if (changedKeyCount > 0) {
              keyCache.clear()
            }
            authErrorCountSinceRefresh = 0
            logger.warn(
              'Downloader',
              `[M3U8Downloader] M3U8 列表重拉完成: total=${refreshed.segments.length}, uncompleted=${uncompletedCount}, changedUrls=${changedUrlCount}, changedKeys=${changedKeyCount}${changedUrlCount === 0 ? ' (未完成分片 URL 无变化)' : ''}`
            )
          } else {
            logger.warn(
              'Downloader',
              `[M3U8Downloader] 重拉 M3U8 分片总数不一致 (${refreshed.segments.length} !== ${segments.length})，继续沿用原列表`
            )
          }
        } catch (refreshErr: any) {
          if (abortController.signal.aborted) return
          const refreshDiag = refreshErr?.diag as HttpErrorDiag | undefined
          const diagSuffix = refreshDiag
            ? ` | diag: resHeaders={${refreshDiag.resHeaders || ''}}, body="${refreshDiag.bodySnippet || ''}"`
            : ''
          logger.warn('Downloader', `[M3U8Downloader] 重拉 M3U8 列表失败，继续沿用原分片链接: ${refreshErr.message}${diagSuffix}`)
        } finally {
          lastPlaylistRefreshAt = Date.now()
          playlistRefreshPromise = null
        }
      })()
    }
    await playlistRefreshPromise
  }

  const getAesKey = async (keyUrl: string, sessionIndex = 0): Promise<Buffer> => {
    const cached = keyCache.get(keyUrl)
    if (cached) return cached
    let pending = keyPromiseCache.get(keyUrl)
    if (!pending) {
      pending = (async () => {
        const handle = await fetchM3U8WithManagedTimeout(
          keyUrl,
          { headers, signal: abortController.signal as any },
          15000,
          sessionIndex
        )
        try {
          if (!handle.response.ok) {
            throw await createHttpResponseError(
              handle.response,
              'key',
              true,
              `Key fetch failed: ${keyUrl} (HTTP ${handle.response.status})`
            )
          }
          const buf = await readResponseBufferWithIdleTimeout(
            handle.response,
            handle,
            15000,
            abortController.signal
          )
          keyCache.set(keyUrl, buf)
          return buf
        } finally {
          handle.cleanup()
        }
      })().finally(() => {
        keyPromiseCache.delete(keyUrl)
      })
      keyPromiseCache.set(keyUrl, pending)
    }
    return pending
  }

  const buildRetryHint = (): string => {
    const pending = scheduler.pendingRetryCount
    if (pending <= 0) return ''
    return scheduler.isTailRetryOnly
      ? `正在重试剩余 ${pending} 个失败分片`
      : `待重试 ${pending} 个分片`
  }

  let lastReportedHint = ''
  let lastReportedCanSkip = false
  let autoPauseInfo: {
    errorMsg: string
    canSkipFailedSegments: boolean
    failedSegmentsCount: number
  } | null = null

  const reportStreamProgress = (force: boolean = false) => {
    if (isTaskEnded || abortController.signal.aborted) {
      return
    }
    const now = Date.now()
    const retryHint = buildRetryHint()
    const canSkipFailedSegments = scheduler.isTailRetryOnly && scheduler.completedCount > 0 && scheduler.pendingRetryCount > 0
    const failedSegmentsCount = scheduler.pendingRetryCount
    if (
      !force &&
      retryHint === lastReportedHint &&
      canSkipFailedSegments === lastReportedCanSkip &&
      now - lastReportTime < 500 &&
      !scheduler.isDone
    ) {
      return
    }
    const dt = Math.max(1, now - lastReportTime)
    const deltaBytes = Math.max(0, totalReceivedBytes - lastReportBytes)
    const instSpeed = (deltaBytes / dt) * 1000
    smoothedSpeed = smoothedSpeed > 0 ? smoothedSpeed * 0.4 + instSpeed * 0.6 : instSpeed
    host.sendProgress({
      id,
      totalBytes: 0,
      receivedBytes: totalReceivedBytes,
      downloadedSegments: scheduler.completedCount,
      totalSegments: segments.length,
      speed: smoothedSpeed,
      status: 'downloading',
      errorMsg: retryHint,
      canSkipFailedSegments,
      failedSegmentsCount
    })
    lastReportTime = now
    lastReportBytes = totalReceivedBytes
    lastReportedHint = retryHint
    lastReportedCanSkip = canSkipFailedSegments
  }

  const remainingToDownload = Math.max(0, segments.length - scheduler.completedCount)
  const concurrency = remainingToDownload > 0 ? Math.min(M3U8_SESSION_POOL_SIZE, remainingToDownload) : 0

  const fetchNextSegment = async (workerId: number): Promise<void> => {
    if (workerId > 0) {
      await sleepWithAbort(workerId * 50, abortController.signal)
    }

    while (true) {
      if (abortController.signal.aborted) {
        throw new DOMException('User aborted download', 'AbortError')
      }

      // 背压守卫：若缓冲达上限且处于溢写态或缺失队头分片则写入 .spill.bin，防止队头阻塞导致并发线程死锁
      while (currentBufferedBytes >= maxMemoryBytes * 2) {
        if (abortController.signal.aborted) {
          throw new DOMException('User aborted download', 'AbortError')
        }
        if (!spillActive && segmentStore.has(nextFlushIndex)) {
          enqueueSequentialFlush(false)
        } else {
          spillOutOfOrderBuffers(false)
        }
        await sleepWithAbort(50, abortController.signal)
      }

      const acquired = scheduler.acquire()
      if (acquired.type === 'done') {
        break
      }
      if (acquired.type === 'wait') {
        await scheduler.waitForUpdate(acquired.waitMs, abortController.signal)
        continue
      }

      const segIndex = acquired.index
      let quickAttempt = 0
      let preemptCount = 0
      let fetchedBuf: Buffer | null = null
      let lastErr: any = null
      let lastStatusCode: number | null = null
      let lastDiag: HttpErrorDiag | undefined = undefined
      let lastSessionIdx = 0

      while (quickAttempt < 2 && !fetchedBuf) {
        if (abortController.signal.aborted) {
          throw new DOMException('User aborted download', 'AbortError')
        }

        const currentSeg = segments[segIndex]
        let handle: ManagedFetchHandle | null = null
        let segReceivedBytes = 0
        let slowPreempted = false
        const rollbackSegBytes = () => {
          if (segReceivedBytes > 0) {
            totalReceivedBytes = Math.max(0, totalReceivedBytes - segReceivedBytes)
            segReceivedBytes = 0
          }
        }
        const sessionIdx = (workerId + acquired.failCount * 7 + quickAttempt * 5 + preemptCount * 3) % M3U8_SESSION_POOL_SIZE
        lastSessionIdx = sessionIdx

        try {
          handle = await fetchM3U8WithManagedTimeout(
            currentSeg.url,
            { headers, signal: abortController.signal as any },
            15000,
            sessionIdx
          )
          const res = handle.response
          if (!res.ok) {
            const shouldCaptureBody =
              (acquired.failCount < 2 && detailedDiagLoggedCount < 40) ||
              (acquired.failCount < 2 && (res.status === 403 || res.status === 404 || res.status === 410))
            throw await createHttpResponseError(res, 'segment', shouldCaptureBody)
          }

          const rawLen = res.headers?.get?.('content-length')
          const contentEncoding = String(res.headers?.get?.('content-encoding') || '').toLowerCase().trim()
          const parsedLen = rawLen ? parseInt(rawLen, 10) : 0
          const expectedLen = parsedLen > 0 && (!contentEncoding || contentEncoding === 'identity') ? parsedLen : 0

          const chunks: Buffer[] = []
          if (res.body && typeof res.body.getReader === 'function') {
            const reader = res.body.getReader()
            handle.resetIdleTimeout(12000)
            const connStartTime = Date.now()
            let windowStartTime = connStartTime
            let windowBytes = 0

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              handle.resetIdleTimeout(12000)
              if (abortController.signal.aborted) {
                try { await reader.cancel() } catch {}
                throw new DOMException('User aborted download', 'AbortError')
              }
              if (!value || value.byteLength === 0) continue

              const chunkBuf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
              chunks.push(chunkBuf)
              segReceivedBytes += chunkBuf.length
              totalReceivedBytes += chunkBuf.length
              windowBytes += chunkBuf.length
              lastDataReceivedAt = Date.now()

              reportStreamProgress(false)

              // 慢连接抢占：每 4s 采样窗口速度，持续 >= 10s 且明显拖后腿时切换新 Session 重下
              const now = lastDataReceivedAt
              if (now - windowStartTime >= 4000) {
                const winDt = Math.max(1, now - windowStartTime)
                const windowBps = (windowBytes * 1000) / winDt
                windowStartTime = now
                windowBytes = 0

                const remainingLargeOrUnknown = expectedLen <= 0 || expectedLen - segReceivedBytes > 256 * 1024
                if (now - connStartTime >= 10000 && preemptCount < 2 && remainingLargeOrUnknown) {
                  const avgPerWorkerBps = smoothedSpeed > 0 ? smoothedSpeed / Math.max(1, concurrency) : 0
                  const floorBps = Math.max(16 * 1024, avgPerWorkerBps * 0.2)
                  if (windowBps < floorBps) {
                    preemptCount++
                    slowPreempted = true
                    logger.warn(
                      'Downloader',
                      `[M3U8Downloader] 分片 ${segIndex} 连接过慢 (${(windowBps / 1024).toFixed(1)} KB/s < 阈值 ${(floorBps / 1024).toFixed(1)} KB/s)，切换连接重试 (${preemptCount}/2)`
                    )
                    try { await reader.cancel() } catch {}
                    rollbackSegBytes()
                    break
                  }
                }
              }
            }

            if (slowPreempted) {
              continue
            }

            if (handle.isTimedOut() && !abortController.signal.aborted) {
              throw new Error('流读取超时 (12000ms 无数据响应)')
            }
          } else {
            handle.resetIdleTimeout(12000)
            const ab = await res.arrayBuffer()
            const fallbackBuf = Buffer.from(ab)
            chunks.push(fallbackBuf)
            segReceivedBytes = fallbackBuf.length
            totalReceivedBytes += fallbackBuf.length
            lastDataReceivedAt = Date.now()
          }

          if (expectedLen > 0 && segReceivedBytes !== expectedLen) {
            throw new Error(`分片 ${segIndex} 数据不完整 (${segReceivedBytes}/${expectedLen} 字节)`)
          }

          let buf = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)

          if (currentSeg.key && currentSeg.key.method === 'AES-128') {
            const keyBuf = await getAesKey(currentSeg.key.url, sessionIdx)
            let ivBuf: Buffer
            if (currentSeg.key.iv) {
              let hex = currentSeg.key.iv.startsWith('0x') || currentSeg.key.iv.startsWith('0X') ? currentSeg.key.iv.slice(2) : currentSeg.key.iv
              hex = hex.padStart(32, '0')
              ivBuf = Buffer.from(hex, 'hex')
            } else {
              ivBuf = Buffer.alloc(16)
              ivBuf.writeUInt32BE(segIndex, 12)
            }
            try {
              const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf)
              decipher.setAutoPadding(true)
              buf = Buffer.concat([decipher.update(buf), decipher.final()])
            } catch {
              const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf)
              decipher.setAutoPadding(false)
              buf = Buffer.concat([decipher.update(buf), decipher.final()])
            }
          }

          fetchedBuf = buf
        } catch (e: any) {
          rollbackSegBytes()
          if (abortController.signal.aborted) {
            throw e?.name === 'AbortError' ? e : new DOMException('User aborted download', 'AbortError')
          }
          const errObj = handle?.isTimedOut()
            ? new Error(e?.message || '流读取超时 (12000ms 无数据响应)')
            : e
          lastErr = errObj
          const status = extractHttpStatusCode(errObj)
          if (status !== null) {
            lastStatusCode = status
          }
          if (errObj?.diag) {
            const nextDiag = errObj.diag as HttpErrorDiag
            if (!lastDiag || nextDiag.bodySnippet || !lastDiag.bodySnippet) {
              lastDiag = nextDiag
            }
          }
          quickAttempt++
          if (quickAttempt < 2) {
            await sleepWithAbort(200, abortController.signal)
          }
        } finally {
          handle?.cleanup()
        }
      }

      if (fetchedBuf) {
        segmentStore.set(segIndex, { kind: 'mem', buf: fetchedBuf })
        currentBufferedBytes += fetchedBuf.length
        scheduler.markSuccess(segIndex)

        if (
          !spillActive &&
          segmentStore.has(nextFlushIndex) &&
          (currentBufferedBytes >= Math.min(maxMemoryBytes, 32 * 1024 * 1024) ||
            segmentStore.size >= 32 ||
            scheduler.isDone ||
            nextFlushIndex + segmentStore.size >= segments.length)
        ) {
          enqueueSequentialFlush(false)
        } else if (
          (spillActive || !segmentStore.has(nextFlushIndex)) &&
          currentBufferedBytes >= maxMemoryBytes
        ) {
          spillOutOfOrderBuffers(false)
        }

        reportStreamProgress(scheduler.isDone)
      } else {
        const errMsg = lastErr?.message || '分片下载失败'
        const status = lastStatusCode ?? extractHttpStatusCode(lastErr)
        const isPermanentOriginErr = isPermanentOriginSegmentError(
          status,
          lastDiag?.resHeaders,
          lastDiag?.bodySnippet
        )
        const failCount = scheduler.markFailed(segIndex, errMsg, Date.now(), isPermanentOriginErr)
        const currentSegSnap = segments[segIndex]
        const segUrlDiag = sanitizeUrlDiagnostic(
          lastDiag?.phase === 'key' && currentSegSnap.key?.url ? currentSegSnap.key.url : currentSegSnap.url
        )

        logPlaylistStructureDiag()

        if (failCount === 1 && detailedDiagLoggedCount < 20) {
          detailedDiagLoggedCount++
          const phase = lastDiag?.phase || 'segment'
          const prevHost = segIndex > 0 ? sanitizeUrlDiagnostic(segments[segIndex - 1].url).host : 'none'
          const samePrevHost = segIndex > 0 ? segUrlDiag.host === prevHost : true
          const samePlaylistHost = segUrlDiag.host === playlistUrlDiag.host
          const meta = lastDiag?.fetchMeta
          const redirSummary = meta && meta.redirectHops > 0
            ? `hops=${meta.redirectHops},cross=${meta.crossDomainRedirect},stripped=${meta.strippedCredentials},finalHost=${sanitizeUrlDiagnostic(meta.finalUrl).host}`
            : 'none'
          const resHeaders = lastDiag?.resHeaders || ''
          const bodySnippet = lastDiag?.bodySnippet || ''
          logger.warn(
            'Downloader',
            `[M3U8Downloader] 分片 ${segIndex} 下载失败 (第 1 轮)，已移入延后队列稍后重试: ${errMsg} | diag: phase=${phase}, status=${status ?? 'err'}, host=${segUrlDiag.host}, samePlaylistHost=${samePlaylistHost}, samePrevHost=${samePrevHost}, ext=${segUrlDiag.ext}, path=${segUrlDiag.pathTail}, qKeys=[${segUrlDiag.queryKeys.join(',')}], fp=${segUrlDiag.fingerprint}, disc=${Boolean(currentSegSnap.discontinuity)}, br=${currentSegSnap.byteRange || 'none'}, sess=${lastSessionIdx}, redir=${redirSummary}, resHeaders={${resHeaders}}, body="${bodySnippet}"`
          )
        } else if (failCount <= 2 || failCount % 10 === 0) {
          logger.warn(
            'Downloader',
            `[M3U8Downloader] 分片 ${segIndex} 下载失败 (第 ${failCount} 轮, fp=${segUrlDiag.fingerprint})，已移入延后队列稍后重试: ${errMsg}`
          )
        }

        if (isPermanentOriginErr && scheduler.hasAllRemainingPermanentlyFailed(2)) {
          const remaining = scheduler.remainingUncompletedCount
          if (!autoPauseInfo) {
            autoPauseInfo = {
              errorMsg: `源站 ${remaining} 个分片不可用`,
              canSkipFailedSegments: scheduler.completedCount > 0,
              failedSegmentsCount: remaining
            }
            logger.warn(
              'Downloader',
              `[M3U8Downloader] 任务 ${id} 剩余 ${remaining} 个分片连续 2 轮确认为源站永久失效，自动暂停任务并保留已完成分片`
            )
          }
          const autoAbortErr = new DOMException('Auto paused due to permanent origin segment failures', 'AbortError')
          if (!abortController.signal.aborted) {
            abortController.abort(autoAbortErr)
          }
          throw autoAbortErr
        }

        if ((status === 401 || status === 403) && (!isPermanentOriginErr || lastPlaylistRefreshAt === 0)) {
          authErrorCountSinceRefresh++
          await maybeTriggerPlaylistRefresh(failCount)
        }
        reportStreamProgress(false)
      }
    }
  }

  const workers: Promise<void>[] = []
  for (let c = 0; c < concurrency; c++) {
    workers.push(fetchNextSegment(c))
  }

  if (concurrency > 0) {
    reportStreamProgress(true)
  }

  const progressHeartbeat = setInterval(() => {
    if (isTaskEnded || abortController.signal.aborted) return
    if (Date.now() - lastDataReceivedAt >= 2000) {
      smoothedSpeed = 0
    }
    reportStreamProgress(true)
  }, 1000)

  try {
    if (workers.length > 0) {
      await Promise.all(workers)
    }
    isTaskEnded = true
    clearInterval(progressHeartbeat)

    await spillChain
    if (!spillActive) {
      enqueueSequentialFlush(true)
      await writeChain
      await spillChain
    } else {
      await writeChain
    }

    if (fileHandle) {
      const fhToClose = fileHandle
      fileHandle = null
      await fhToClose.close()
    }
    await spillPack.close()

    if (diskWriteError) {
      throw diskWriteError
    }

    if (!spillActive) {
      if (flushedSegmentsCount < segments.length) {
        throw new Error(`M3U8 分片未全部完成落盘: 仅写入 ${flushedSegmentsCount}/${segments.length} 分片`)
      }
      await cleanupM3U8SpillArtifacts(finalSavePath)
      if (isTargetMp4) {
        await remuxToMp4(workSavePath, finalSavePath, isFmp4, abortController, id, host.sendProgress)
      }
    } else {
      const totalReadySegments = flushedSegmentsCount + segmentStore.size
      if (totalReadySegments < segments.length) {
        throw new Error(`M3U8 分片未全部完成落盘: 仅就绪 ${totalReadySegments}/${segments.length} 分片`)
      }
      const prefixBytes = flushedSegmentsCount > 0 && fs.existsSync(workSavePath)
        ? fs.statSync(workSavePath).size
        : 0
      const orderedSegments: OrderedM3U8SegmentInput[] = []
      segmentStore.forEach((entry, idx) => {
        if (entry.kind === 'pack') {
          orderedSegments.push({
            index: idx,
            fileRange: { filePath: spillPack.spillBinPath, offset: entry.offset, length: entry.length }
          })
        } else if (entry.kind === 'legacy-disk') {
          orderedSegments.push({
            index: idx,
            fileRange: { filePath: entry.filePath, offset: 0, length: entry.size }
          })
        } else if (entry.kind === 'mem' || entry.kind === 'spilling') {
          orderedSegments.push({
            index: idx,
            buffer: entry.buf
          })
        }
      })
      const streamPlan = buildCoalescedM3U8StreamPlan({
        prefixFilePath: prefixBytes > 0 ? workSavePath : undefined,
        prefixLength: prefixBytes,
        orderedSegments
      })
      if (isTargetMp4) {
        await remuxToMp4FromSources(
          streamPlan,
          workSavePath,
          finalSavePath,
          isFmp4,
          abortController,
          id,
          host.sendProgress,
          false
        )
      } else {
        await materializeSourcesToFile(streamPlan.sources, workSavePath, abortController.signal)
        await cleanupM3U8SpillArtifacts(finalSavePath)
      }
    }

    const targetVideoFile = isTargetMp4 ? finalSavePath : workSavePath
    const finalFileSize = fs.existsSync(targetVideoFile) ? fs.statSync(targetVideoFile).size : totalReceivedBytes

    logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 全部 ${segments.length} 个分片下载及封装完成。文件大小: ${finalFileSize}`)
    return {
      filePath: targetVideoFile,
      fileSize: finalFileSize,
      totalSegments: segments.length
    }
  } catch (err: any) {
    isTaskEnded = true
    clearInterval(progressHeartbeat)

    if (!abortController.signal.aborted) {
      abortController.abort(err)
    }
    if (workers.length > 0) {
      await Promise.allSettled(workers)
    }

    try {
      await spillChain.catch(() => {})
      if (!spillActive) {
        enqueueSequentialFlush(false)
        await writeChain.catch(() => {})
      } else {
        await writeChain.catch(() => {})
      }
      let hasPendingMem = false
      segmentStore.forEach((entry) => {
        if (entry.kind === 'mem') hasPendingMem = true
      })
      if (!diskWriteError && hasPendingMem) {
        await spillOutOfOrderBuffers(true)
      }
      if (fileHandle) {
        const fhToClose = fileHandle
        fileHandle = null
        await fhToClose.close().catch(() => {})
      }
      await spillPack.close().catch(() => {})
    } catch {}

    let spilledDiskBytes = 0
    let spilledDiskCount = 0
    segmentStore.forEach((entry) => {
      if (entry.kind === 'pack') {
        spilledDiskBytes += entry.length
        spilledDiskCount++
      } else if (entry.kind === 'legacy-disk') {
        spilledDiskBytes += entry.size
        spilledDiskCount++
      }
    })
    if (spilledDiskCount === 0 && (spillActive || hasUnmergedM3U8Spill(finalSavePath))) {
      await cleanupM3U8SpillArtifacts(finalSavePath).catch(() => {})
    }

    if (diskWriteError) {
      throw diskWriteError
    }
    if (err?.name === 'AbortError' || abortController.signal.aborted) {
      const workBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
      const savedBytes = workBytes + spilledDiskBytes
      const downloadedSegments = flushedSegmentsCount + spilledDiskCount
      const remainingCount = Math.max(0, segments.length - downloadedSegments)
      const canSkipOnPause = autoPauseInfo
        ? autoPauseInfo.canSkipFailedSegments
        : (scheduler.isTailRetryOnly && downloadedSegments > 0 && remainingCount > 0)
      const failedCountOnPause = autoPauseInfo
        ? autoPauseInfo.failedSegmentsCount
        : remainingCount
      const pauseErrorMsg = autoPauseInfo ? autoPauseInfo.errorMsg : ''
      const pauseErr: any = Object.assign(new Error('User aborted download'), {
        name: 'AbortError',
        savedBytes,
        downloadedSegments,
        errorMsg: pauseErrorMsg,
        canSkipFailedSegments: canSkipOnPause,
        failedSegmentsCount: failedCountOnPause
      })
      throw pauseErr
    }
    throw err
  } finally {
    clearInterval(progressHeartbeat)
  }
}

/**
 * 手动跳过当前无法下载的 M3U8 失败分片，通过流式直封装或临时文件将已完成分片封装为可用 MP4
 */
export async function executeSkipFailedM3U8Segments(
  cmd: DownloadCommand,
  safeSavePath: string,
  host: M3U8SkipHost
): Promise<{ success: boolean; skippedSegments?: number; error?: string }> {
  let finalSavePath = safeSavePath
  if (!finalSavePath.toLowerCase().endsWith('.mp4') && !finalSavePath.toLowerCase().endsWith('.mkv')) {
    if (finalSavePath.toLowerCase().endsWith('.m3u8') || finalSavePath.toLowerCase().endsWith('.ts')) {
      finalSavePath = finalSavePath.replace(/\.(m3u8|ts)$/i, '.mp4')
    } else {
      finalSavePath = finalSavePath + '.mp4'
    }
  }
  const tempMp4Path = finalSavePath + '.temp.mp4'
  const tempTsPath = finalSavePath + '.temp.ts'
  const spillPaths = getM3U8SpillPaths(finalSavePath)
  const inspection = inspectM3U8SpillForResume(finalSavePath)

  let isFmp4 = typeof inspection.isFmp4 === 'boolean' ? inspection.isFmp4 : false
  let workSavePath = isFmp4 ? tempMp4Path : tempTsPath
  if (!fs.existsSync(workSavePath)) {
    if (fs.existsSync(tempTsPath)) {
      workSavePath = tempTsPath
      if (typeof inspection.isFmp4 !== 'boolean') isFmp4 = false
    } else if (fs.existsSync(tempMp4Path)) {
      workSavePath = tempMp4Path
      if (typeof inspection.isFmp4 !== 'boolean') isFmp4 = true
    }
  }

  let flushedSegments = 0
  if (inspection.mode !== 'none' && inspection.flushedSegments >= 0) {
    flushedSegments = inspection.flushedSegments
  } else if (fs.existsSync(workSavePath) && typeof cmd.downloadedSegments === 'number' && cmd.downloadedSegments > 0) {
    flushedSegments = cmd.downloadedSegments
  }

  const workPrefixBytes = flushedSegments > 0 && fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
  const hasWorkPrefix = workPrefixBytes > 0
  if (!hasWorkPrefix) {
    flushedSegments = 0
  }

  const orderedSegments: OrderedM3U8SegmentInput[] = []
  const seenIndices = new Set<number>()
  inspection.packEntries.forEach((span, idx) => {
    if (idx < flushedSegments) return
    seenIndices.add(idx)
    orderedSegments.push({
      index: idx,
      fileRange: { filePath: spillPaths.spillBinPath, offset: span.offset, length: span.length }
    })
  })
  inspection.legacySegFiles.forEach((info, idx) => {
    if (idx < flushedSegments || seenIndices.has(idx)) return
    seenIndices.add(idx)
    orderedSegments.push({
      index: idx,
      fileRange: { filePath: info.filePath, offset: 0, length: info.size }
    })
  })

  if (!hasWorkPrefix && orderedSegments.length === 0) {
    return { success: false, error: '没有可合并的已完成分片' }
  }

  const parentDir = path.dirname(finalSavePath)
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true })
  }

  const abortController = new AbortController()
  host.registerActive(abortController)

  let finalFileSize = 0
  const mergedCount = flushedSegments + orderedSegments.length
  const totalSegments =
    typeof inspection.totalSegments === 'number' && inspection.totalSegments > 0
      ? inspection.totalSegments
      : (typeof cmd.totalSegments === 'number' && cmd.totalSegments > 0 ? cmd.totalSegments : mergedCount)
  const skippedCount = Math.max(0, totalSegments - mergedCount)
  let successCompleted = false

  try {
    host.sendProgress({
      id: cmd.id,
      status: 'converting',
      canSkipFailedSegments: false,
      failedSegmentsCount: 0,
      errorMsg: '',
      speed: 0
    })

    logger.warn(
      'Downloader',
      `[M3U8Downloader] 任务 ${cmd.id} 手动跳过 ${skippedCount} 个失效分片，直封装 ${mergedCount}/${totalSegments} 个已完成分片为 MP4`
    )

    if (orderedSegments.length > 0) {
      const streamPlan = buildCoalescedM3U8StreamPlan({
        prefixFilePath: hasWorkPrefix ? workSavePath : undefined,
        prefixLength: hasWorkPrefix ? workPrefixBytes : 0,
        orderedSegments
      })
      await remuxToMp4FromSources(
        streamPlan,
        workSavePath,
        finalSavePath,
        isFmp4,
        abortController,
        cmd.id,
        host.sendProgress,
        skippedCount > 0
      )
    } else {
      await remuxToMp4(workSavePath, finalSavePath, isFmp4, abortController, cmd.id, host.sendProgress, skippedCount > 0)
      await cleanupM3U8SpillArtifacts(finalSavePath)
    }

    finalFileSize = fs.existsSync(finalSavePath) ? fs.statSync(finalSavePath).size : 0
    if (finalFileSize <= 0) {
      throw new Error('跳过失效分片封装后的输出文件为空')
    }
    successCompleted = true
  } catch (err: any) {
    if (err?.name === 'AbortError' || abortController.signal.aborted) {
      const curWorkBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
      host.sendProgress({
        id: cmd.id,
        status: 'paused',
        receivedBytes: curWorkBytes + inspection.totalSpilledBytes,
        errorMsg: '',
        canSkipFailedSegments: false,
        failedSegmentsCount: 0,
        speed: 0
      })
      return { success: false, error: '已取消操作' }
    }
    logger.error('Downloader', `[M3U8Downloader] 任务 ${cmd.id} 跳过坏片封装失败: ${err?.message || err}`)
    host.sendProgress({
      id: cmd.id,
      status: 'error',
      errorMsg: err?.message || '跳过失效分片封装失败',
      canSkipFailedSegments: false,
      failedSegmentsCount: 0,
      speed: 0
    })
    return { success: false, error: err?.message || '跳过失效分片封装失败' }
  } finally {
    host.unregisterActive()
  }

  if (successCompleted) {
    await host.handlePostDownload(cmd.id, finalSavePath, finalFileSize, totalSegments, skippedCount, mergedCount)
    return { success: true, skippedSegments: skippedCount }
  }
  return { success: false, error: '未能完成跳过封装' }
}
