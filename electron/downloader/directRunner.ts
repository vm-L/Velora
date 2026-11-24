import fs from 'fs'
import path from 'path'
import { storeManager } from '../store'
import { logger } from '../logger'
import { writeBufferFully } from '../utils/m3u8SpillPack'
import type { DownloadCommand, ManagedFetchHandle } from './types'
import { computeOptimalChunkSize, computeOptimalConcurrency, parseUrlHost } from './httpClient'
import {
  fetchWithManagedTimeout,
  formatTransientErrorMessage,
  getTransientRetryDelay,
  isTransientNetworkError
} from './retryAndDiag'

export interface DirectRunnerHost {
  buildTaskHeaders: (cmd: DownloadCommand, targetUrl?: string) => Record<string, string>
  refreshCommandPanLink: (cmd: DownloadCommand, forceSession?: boolean) => Promise<boolean>
  sendProgress: (payload: any) => void
  getTaskSpeed: (id: string) => number
}

/**
 * 通用视频 (MP4 / AVI 等) 的断点续传、HTTP Range 分块多线程加速与内存缓冲
 */
export async function downloadDirectFileTask(
  cmd: DownloadCommand,
  abortController: AbortController,
  host: DirectRunnerHost
): Promise<{ filePath: string; fileSize: number }> {
  const { id, savePath, startBytes = 0 } = cmd
  const progressPath = savePath + '.velora'

  let savedChunkSize = 0
  let savedCompletedChunks: number[] = []
  if (fs.existsSync(progressPath)) {
    try {
      const progData = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
      if (typeof progData.chunkSize === 'number' && progData.chunkSize > 0 && Array.isArray(progData.completed)) {
        savedChunkSize = progData.chunkSize
        savedCompletedChunks = progData.completed
      }
    } catch {}
  }

  let maxMemoryMB = 128
  try {
    maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 128
  } catch {
    maxMemoryMB = 128
  }
  const maxMemoryBytes = maxMemoryMB * 1024 * 1024

  const dir = path.dirname(savePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  let activeUrl = cmd.url
  const buildHeaders = (targetUrl: string): Record<string, string> => host.buildTaskHeaders(cmd, targetUrl)
  let activeHeaders = buildHeaders(activeUrl)

  let panRefreshPromise: Promise<boolean> | null = null
  const ensurePanLinkRefreshed = async (forceSession = true): Promise<boolean> => {
    if (!cmd.panContext) return false
    if (!panRefreshPromise) {
      panRefreshPromise = host.refreshCommandPanLink(cmd, forceSession)
        .then((ok) => {
          if (ok) {
            activeUrl = cmd.url
            activeHeaders = buildHeaders(activeUrl)
          }
          return ok
        })
        .finally(() => {
          panRefreshPromise = null
        })
    }
    return panRefreshPromise
  }

  let isRangeSupported = false
  let totalBytes = cmd.totalBytes && cmd.totalBytes > 0 ? cmd.totalBytes : 0
  let initialFullResponseHandle: ManagedFetchHandle | null = null

  for (let probeAttempt = 0; probeAttempt < 2; probeAttempt++) {
    let probeHandle: ManagedFetchHandle | null = null
    let transferToStream = false
    try {
      probeHandle = await fetchWithManagedTimeout(
        activeUrl,
        { headers: { ...activeHeaders, Range: 'bytes=0-0' }, signal: abortController.signal as any },
        15000
      )
      const checkRes = probeHandle.response
      if (checkRes.status === 206) {
        isRangeSupported = true
        const cr = checkRes.headers.get('content-range')
        if (cr) {
          const match = cr.match(/\/(\d+)/)
          if (match && (!totalBytes || totalBytes === 0)) {
            totalBytes = parseInt(match[1], 10)
          }
        }
        try { await checkRes.body?.cancel?.() } catch {}
        break
      } else if (checkRes.status === 200) {
        isRangeSupported = false
        const cl = checkRes.headers.get('content-length')
        if (cl && totalBytes === 0) {
          totalBytes = parseInt(cl, 10)
        }
        initialFullResponseHandle = probeHandle
        transferToStream = true
        break
      } else if ((checkRes.status === 401 || checkRes.status === 403 || checkRes.status === 412) && cmd.panContext && probeAttempt === 0) {
        try { await checkRes.body?.cancel?.() } catch {}
        probeHandle.cleanup()
        probeHandle = null
        logger.warn('Downloader', `[DirectDownloader] 直链预检返回 HTTP ${checkRes.status} (host=${parseUrlHost(activeUrl)}, headers=${JSON.stringify(Object.keys(activeHeaders))})，尝试刷新会话并重取网盘直链...`)
        const refreshed = await ensurePanLinkRefreshed(true)
        if (refreshed) continue
        logger.error('Downloader', `[DirectDownloader] 直链预检失败: status=${checkRes.status}, host=${parseUrlHost(activeUrl)}, headers=${JSON.stringify(Object.keys(activeHeaders))}`)
        break
      } else {
        try { await checkRes.body?.cancel?.() } catch {}
        if (checkRes.status === 401 || checkRes.status === 403 || checkRes.status === 412) {
          logger.error('Downloader', `[DirectDownloader] 直链预检失败: status=${checkRes.status}, host=${parseUrlHost(activeUrl)}, headers=${JSON.stringify(Object.keys(activeHeaders))}`)
        }
        break
      }
    } catch (e: any) {
      if (abortController.signal.aborted) {
        throw e?.name === 'AbortError' ? e : new DOMException('User aborted download', 'AbortError')
      }
      logger.info('Downloader', `[DirectDownloader] Range 探测未响应: ${e.message}`)
      if (
        totalBytes > 0 &&
        (activeUrl.includes('quark') || activeUrl.includes('uc.cn') || (cmd.referer && (cmd.referer.includes('quark') || cmd.referer.includes('uc.cn'))))
      ) {
        isRangeSupported = true
      }
      break
    } finally {
      if (probeHandle && !transferToStream) {
        probeHandle.cleanup()
      }
    }
  }

  const cleanupInitialHandle = async () => {
    if (initialFullResponseHandle) {
      try { await initialFullResponseHandle.response?.body?.cancel?.() } catch {}
      initialFullResponseHandle.cleanup()
      initialFullResponseHandle = null
    }
  }

  if (fs.existsSync(savePath) && !fs.existsSync(progressPath) && totalBytes > 0) {
    try {
      const stat = fs.statSync(savePath)
      if (stat.size >= totalBytes) {
        await cleanupInitialHandle()
        logger.info('Downloader', `[DirectDownloader] 目标文件已完整存在 (${stat.size} >= ${totalBytes})，直接跳过下载`)
        return { filePath: savePath, fileSize: stat.size }
      }
    } catch {}
  }

  const targetConcurrency = computeOptimalConcurrency(activeUrl, cmd.referer)
  const chunkSize =
    savedChunkSize > 0 && savedCompletedChunks.length > 0
      ? savedChunkSize
      : computeOptimalChunkSize(totalBytes, targetConcurrency)
  const completedChunks = savedChunkSize > 0 && savedChunkSize === chunkSize ? savedCompletedChunks : []
  const totalChunksCount = totalBytes > 0 ? Math.ceil(totalBytes / chunkSize) : 0
  const validCompletedChunks = Array.from(new Set(completedChunks.filter(i => i >= 0 && i < totalChunksCount)))
  const completedChunkSet = new Set<number>(validCompletedChunks)

  const getChunkByteLength = (chunkIdx: number) => {
    const start = chunkIdx * chunkSize
    return Math.max(0, Math.min(chunkSize, totalBytes - start))
  }
  let totalReceivedBytes = validCompletedChunks.reduce((sum, idx) => sum + getChunkByteLength(idx), 0)

  if (isRangeSupported && totalBytes > 512 * 1024) {
    await cleanupInitialHandle()

    const chunks: Array<{ index: number; start: number; end: number }> = []
    for (let i = 0; i < totalChunksCount; i++) {
      if (completedChunkSet.has(i)) continue
      const start = i * chunkSize
      const end = Math.min(totalBytes - 1, start + chunkSize - 1)
      chunks.push({ index: i, start, end })
    }

    if (chunks.length === 0) {
      if (fs.existsSync(progressPath)) {
        try { await fs.promises.unlink(progressPath) } catch {}
      }
      const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : totalBytes
      return { filePath: savePath, fileSize: finalFileSize }
    }

    const concurrency = Math.min(targetConcurrency, chunks.length)
    logger.info(
      'Downloader',
      `[DirectDownloader] 支持 Range 断点续传 (${(chunkSize / 1024 / 1024).toFixed(2)}MB/块, 已完成 ${validCompletedChunks.length}/${totalChunksCount})，开启 ${concurrency} 并发加速下载`
    )

    const fileExists = fs.existsSync(savePath)
    if (fileExists) {
      try {
        const stats = fs.statSync(savePath)
        if (stats.size > totalBytes) {
          logger.info('Downloader', `[DirectDownloader] 续传旧文件过大，截断为 ${totalBytes}`)
          await fs.promises.truncate(savePath, totalBytes)
        }
      } catch {}
    }

    let fileHandle: fs.promises.FileHandle
    try {
      fileHandle = await fs.promises.open(savePath, fileExists ? 'r+' : 'w')
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        fileHandle = await fs.promises.open(savePath, 'w')
      } else {
        throw err
      }
    }

    let pendingDiskWriteBytes = 0
    let workerInFlightBytes = 0
    let downloadedChunksCount = validCompletedChunks.length
    let lastReportTime = Date.now()
    let lastReportBytes = totalReceivedBytes
    let lastProgressSaveTime = Date.now()
    let progressDirty = false
    let progressWritePromise: Promise<void> | null = null
    let diskWriteError: Error | null = null
    const activeWritePromises = new Set<Promise<void>>()

    const saveProgressFile = async (force = false): Promise<void> => {
      if (!progressDirty && !force) return
      const now = Date.now()
      if (!force && now - lastProgressSaveTime < 1000) return
      if (progressWritePromise && !force) return
      if (progressWritePromise && force) {
        await progressWritePromise.catch(() => {})
      }
      lastProgressSaveTime = now
      progressDirty = false
      const snapshot = JSON.stringify({ chunkSize, completed: Array.from(completedChunkSet) })
      const p = fs.promises.writeFile(progressPath, snapshot).catch(() => {}).finally(() => {
        if (progressWritePromise === p) progressWritePromise = null
      })
      progressWritePromise = p
      if (force) await p
    }

    let chunkQueueIndex = 0

    const fetchNextChunk = async (): Promise<void> => {
      while (chunkQueueIndex < chunks.length) {
        if (abortController.signal.aborted) {
          throw new DOMException('User aborted download', 'AbortError')
        }

        // 异步写盘背压：待落盘+在途内存超过上限 1.5x 时稍作让步
        while (pendingDiskWriteBytes + workerInFlightBytes >= maxMemoryBytes * 1.5 && activeWritePromises.size > 0) {
          if (abortController.signal.aborted) {
            throw new DOMException('User aborted download', 'AbortError')
          }
          await new Promise(r => setTimeout(r, 40))
        }

        const chunkItem = chunks[chunkQueueIndex++]
        const expectedLen = chunkItem.end - chunkItem.start + 1
        const chunkBuf = Buffer.allocUnsafe(expectedLen)
        let writeOffset = 0
        let attempts = 0
        let panRefreshCount = 0
        let preemptCount = 0
        let success = false
        const maxAttempts = 5
        const maxTransientAttempts = 30

        const releaseBufferedBytes = () => {
          if (writeOffset > 0) {
            workerInFlightBytes = Math.max(0, workerInFlightBytes - writeOffset)
            totalReceivedBytes = Math.max(0, totalReceivedBytes - writeOffset)
            writeOffset = 0
          }
        }

        while (!success) {
          if (abortController.signal.aborted) {
            releaseBufferedBytes()
            throw new DOMException('User aborted download', 'AbortError')
          }
          let handle: ManagedFetchHandle | null = null
          const reqStart = chunkItem.start + writeOffset
          const remainingExpected = expectedLen - writeOffset
          let slowPreempted = false
          try {
            handle = await fetchWithManagedTimeout(
              activeUrl,
              {
                headers: { ...activeHeaders, Range: `bytes=${reqStart}-${chunkItem.end}` },
                signal: abortController.signal as any
              },
              20000
            )
            const chunkRes = handle.response

            if ((chunkRes.status === 401 || chunkRes.status === 403 || chunkRes.status === 412) && cmd.panContext && panRefreshCount < 2) {
              try { await chunkRes.body?.cancel?.() } catch {}
              panRefreshCount++
              const refreshed = await ensurePanLinkRefreshed()
              if (refreshed) continue
            }

            // 严格要求 206 部分内容响应（除非总文件只有这 1 个完整分块且从 0 开始服务器返回 200）
            const isValidRangeRes =
              chunkRes.status === 206 ||
              (chunkRes.status === 200 && reqStart === 0 && totalBytes === expectedLen)
            if (!isValidRangeRes) {
              try { await chunkRes.body?.cancel?.() } catch {}
              throw new Error(`HTTP ${chunkRes.status}`)
            }

            if (chunkRes.status === 206) {
              const cr = chunkRes.headers?.get?.('content-range')
              const crMatch = cr ? cr.match(/bytes\s+(\d+)-(\d+)/i) : null
              if (crMatch && Number(crMatch[1]) !== reqStart) {
                try { await chunkRes.body?.cancel?.() } catch {}
                throw new Error(`分块 ${chunkItem.index} Range 起始偏移不匹配 (${crMatch[1]} != ${reqStart})`)
              }
            }

            if (!chunkRes.body) throw new Error('No response body')

            const reader = chunkRes.body.getReader()
            handle.resetIdleTimeout(25000)
            const connStartTime = Date.now()
            let windowStartTime = connStartTime
            let windowBytes = 0

            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              handle.resetIdleTimeout(25000)
              if (abortController.signal.aborted) {
                try { await reader.cancel() } catch {}
                throw new DOMException('User aborted download', 'AbortError')
              }
              if (!value || value.byteLength === 0) continue

              if (writeOffset + value.byteLength > expectedLen) {
                try { await reader.cancel() } catch {}
                throw new Error(`分块 ${chunkItem.index} 返回字节数超出预期 (${writeOffset + value.byteLength} > ${expectedLen})`)
              }

              Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(chunkBuf, writeOffset)
              writeOffset += value.byteLength
              windowBytes += value.byteLength
              workerInFlightBytes += value.byteLength
              totalReceivedBytes += value.byteLength

              const now = Date.now()
              if (now - lastReportTime > 400) {
                const dt = Math.max(1, now - lastReportTime)
                const speed = ((totalReceivedBytes - lastReportBytes) / dt) * 1000
                host.sendProgress({
                  id,
                  totalBytes,
                  receivedBytes: totalReceivedBytes,
                  speed,
                  status: 'downloading',
                  errorMsg: ''
                })
                lastReportTime = now
                lastReportBytes = totalReceivedBytes
              }

              // 慢连接抢占（对齐 YunX-Desktop DownloadTuning）：持续 >= 15s 且低于阈值时保留已收字节立即重连
              if (now - windowStartTime >= 5000) {
                const winDt = Math.max(1, now - windowStartTime)
                const windowBps = (windowBytes * 1000) / winDt
                windowStartTime = now
                windowBytes = 0

                if (
                  now - connStartTime >= 15000 &&
                  expectedLen - writeOffset > 128 * 1024 &&
                  preemptCount < 6
                ) {
                  const taskBps = host.getTaskSpeed(id)
                  const avgPerConn = taskBps > 0 ? taskBps / Math.max(1, concurrency) : 0
                  const floorBps = Math.max(12 * 1024, avgPerConn * 0.45)
                  if (windowBps < floorBps) {
                    preemptCount++
                    slowPreempted = true
                    try { await reader.cancel() } catch {}
                    break
                  }
                }
              }
            }

            if (slowPreempted) {
              continue
            }

            if (handle.isTimedOut() && !abortController.signal.aborted) {
              throw new Error(`分块 ${chunkItem.index} 流读取超时`)
            }
            if (writeOffset !== expectedLen) {
              throw new Error(`分块 ${chunkItem.index} 数据不完整 (${writeOffset}/${expectedLen} 字节, 剩余 ${remainingExpected})`)
            }

            // 网络收包完毕，转入异步并发落盘（不阻塞本 worker 拉取下一分块）
            workerInFlightBytes = Math.max(0, workerInFlightBytes - writeOffset)
            writeOffset = 0
            pendingDiskWriteBytes += chunkBuf.length

            const wp = writeBufferFully(fileHandle, chunkBuf, chunkItem.start)
              .then(() => {
                completedChunkSet.add(chunkItem.index)
                downloadedChunksCount++
                progressDirty = true
                saveProgressFile(false)
              })
              .catch((writeErr: any) => {
                diskWriteError = writeErr
                abortController.abort(writeErr)
              })
              .finally(() => {
                pendingDiskWriteBytes = Math.max(0, pendingDiskWriteBytes - chunkBuf.length)
                activeWritePromises.delete(wp)
              })
            activeWritePromises.add(wp)

            if (downloadedChunksCount >= totalChunksCount - 1) {
              const now = Date.now()
              const dt = Math.max(1, now - lastReportTime)
              const speed = ((totalReceivedBytes - lastReportBytes) / dt) * 1000
              host.sendProgress({
                id,
                totalBytes,
                receivedBytes: Math.min(totalBytes, totalReceivedBytes),
                speed: isNaN(speed) ? 0 : speed,
                status: 'downloading',
                errorMsg: ''
              })
              lastReportTime = now
              lastReportBytes = totalReceivedBytes
            }

            success = true
          } catch (err: any) {
            if (abortController.signal.aborted) {
              releaseBufferedBytes()
              throw err?.name === 'AbortError' ? err : new DOMException('User aborted download', 'AbortError')
            }
            const retryableErr =
              err?.name === 'AbortError' || handle?.isTimedOut()
                ? new Error(err?.message || `分块 ${chunkItem.index} 请求中断，准备重试`)
                : err
            attempts++
            if (isTransientNetworkError(retryableErr) || err?.name === 'AbortError') {
              if (attempts >= maxTransientAttempts) {
                releaseBufferedBytes()
                logger.error('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 连续重试 ${maxTransientAttempts} 次均失败: ${retryableErr.message}`)
                throw new Error(`分块 ${chunkItem.index} 下载失败 (已重试 ${maxTransientAttempts} 次: ${retryableErr.message})`)
              }
              const friendlyMsg = formatTransientErrorMessage(retryableErr)
              logger.warn('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 遭遇网络波动 (保留已收 ${writeOffset}/${expectedLen} 字节)，正在自动续传重试 (第 ${attempts} 次): ${retryableErr.message}`)
              host.sendProgress({
                id,
                totalBytes,
                receivedBytes: totalReceivedBytes,
                speed: 0,
                status: 'downloading',
                errorMsg: `正在重试: ${friendlyMsg}`
              })
              await new Promise(r => setTimeout(r, getTransientRetryDelay(attempts, retryableErr)))
            } else {
              if (attempts >= maxAttempts) {
                releaseBufferedBytes()
                logger.error('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 连续重试 ${maxAttempts} 次均失败: ${retryableErr.message}`)
                throw new Error(`分块 ${chunkItem.index} 下载失败 (${retryableErr.message})`)
              }
              await new Promise(r => setTimeout(r, getTransientRetryDelay(attempts, retryableErr)))
            }
          } finally {
            handle?.cleanup()
          }
        }
      }
    }

    const workers: Promise<void>[] = []
    for (let c = 0; c < concurrency; c++) {
      workers.push(fetchNextChunk())
    }

    try {
      await Promise.all(workers)
      await Promise.allSettled(Array.from(activeWritePromises))
      await saveProgressFile(true)
      await fileHandle.close()

      if (diskWriteError) {
        throw diskWriteError
      }
      if (completedChunkSet.size < totalChunksCount) {
        throw new Error(`分块未全部完成写入: ${completedChunkSet.size}/${totalChunksCount}`)
      }

      if (fs.existsSync(progressPath)) {
        try { await fs.promises.unlink(progressPath) } catch {}
      }

      const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : totalBytes
      logger.info('Downloader', `[DirectDownloader] 单文件 Range 断点续传/下载完成: ${savePath}，大小: ${finalFileSize}`)
      return {
        filePath: savePath,
        fileSize: finalFileSize
      }
    } catch (err: any) {
      await Promise.allSettled(Array.from(activeWritePromises))
      await saveProgressFile(true)
      try { await fileHandle.close() } catch {}
      if (diskWriteError) {
        throw diskWriteError
      }
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        const savedBytes = Array.from(completedChunkSet).reduce((sum, idx) => sum + getChunkByteLength(idx), 0)
        const pauseErr: any = Object.assign(new Error('User aborted download'), {
          name: 'AbortError',
          savedBytes
        })
        throw pauseErr
      }
      throw err
    }
  }

  // 3. 不支持 Range 或小文件：单线程流式下载（优先复用 200 OK 预检流，异步 write 落盘）
  let singleStreamAttempts = 0
  const maxSingleStreamAttempts = 30
  let panRefreshCount = 0
  let receivedBytes = startBytes
  let finalTotalBytes = totalBytes

  while (true) {
    if (abortController.signal.aborted) {
      await cleanupInitialHandle()
      throw new DOMException('User aborted download', 'AbortError')
    }

    let handle: ManagedFetchHandle | null = null
    let fileHandle: fs.promises.FileHandle | null = null
    try {
      if (initialFullResponseHandle && receivedBytes === 0) {
        handle = initialFullResponseHandle
        initialFullResponseHandle = null
      } else {
        await cleanupInitialHandle()
        const streamHeaders = { ...activeHeaders }
        if (receivedBytes > 0) {
          streamHeaders['Range'] = `bytes=${receivedBytes}-`
        }
        handle = await fetchWithManagedTimeout(
          activeUrl,
          { headers: streamHeaders, signal: abortController.signal as any },
          20000
        )
      }

      const response = handle.response
      if ((response.status === 401 || response.status === 403 || response.status === 412) && cmd.panContext && panRefreshCount < 2) {
        try { await response.body?.cancel?.() } catch {}
        handle.cleanup()
        handle = null
        panRefreshCount++
        const refreshed = await ensurePanLinkRefreshed()
        if (refreshed) continue
      }

      if (!response.ok && response.status !== 206) {
        try { await response.body?.cancel?.() } catch {}
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      let flags = 'a'
      if (receivedBytes === 0) {
        flags = 'w'
      } else if (response.status === 200 && receivedBytes > 0) {
        flags = 'w'
        receivedBytes = 0
      }

      const contentLength = response.headers.get('content-length')
      if (contentLength && finalTotalBytes === 0) {
        finalTotalBytes = parseInt(contentLength, 10) + (response.status === 206 ? receivedBytes : 0)
      }

      fileHandle = await fs.promises.open(savePath, flags)
      host.sendProgress({
        id,
        totalBytes: finalTotalBytes,
        receivedBytes,
        speed: 0,
        status: 'downloading',
        errorMsg: ''
      })

      if (!response.body) throw new Error('No response body')
      const reader = response.body.getReader()
      handle.resetIdleTimeout(30000)

      let lastReportTime = Date.now()
      let lastReportBytes = receivedBytes
      let memoryChunks: Buffer[] = []
      let memoryChunkBytes = 0
      const flushLimit = Math.min(maxMemoryBytes, 8 * 1024 * 1024)

      const flushStreamBuffer = async () => {
        if (memoryChunks.length > 0 && fileHandle) {
          const combined = memoryChunks.length === 1 ? memoryChunks[0] : Buffer.concat(memoryChunks)
          memoryChunks = []
          memoryChunkBytes = 0
          await writeBufferFully(fileHandle, combined)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        handle.resetIdleTimeout(30000)
        if (abortController.signal.aborted) {
          try { await reader.cancel() } catch {}
          await flushStreamBuffer()
          throw new DOMException('User aborted download', 'AbortError')
        }
        if (!value || value.byteLength === 0) continue

        const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        receivedBytes += buf.length
        memoryChunks.push(buf)
        memoryChunkBytes += buf.length

        if (memoryChunkBytes >= flushLimit) {
          await flushStreamBuffer()
        }

        const now = Date.now()
        if (now - lastReportTime > 400) {
          const dt = Math.max(1, now - lastReportTime)
          const speed = ((receivedBytes - lastReportBytes) / dt) * 1000
          host.sendProgress({
            id,
            receivedBytes,
            totalBytes: finalTotalBytes,
            speed,
            status: 'downloading',
            errorMsg: ''
          })
          lastReportTime = now
          lastReportBytes = receivedBytes
        }
      }

      if (handle.isTimedOut() && !abortController.signal.aborted) {
        await flushStreamBuffer()
        throw new Error('单流读取空闲超时')
      }

      await flushStreamBuffer()
      await fileHandle.close()
      fileHandle = null
      break
    } catch (err: any) {
      if (fileHandle) {
        try { await fileHandle.close() } catch {}
        fileHandle = null
      }
      if (abortController.signal.aborted) {
        const savedBytes = fs.existsSync(savePath) ? fs.statSync(savePath).size : receivedBytes
        const pauseErr: any = Object.assign(new Error('User aborted download'), {
          name: 'AbortError',
          savedBytes
        })
        throw pauseErr
      }
      const retryableErr =
        err?.name === 'AbortError' || handle?.isTimedOut()
          ? new Error(err?.message || '单流连接意外中断，准备重试')
          : err
      singleStreamAttempts++
      if (isTransientNetworkError(retryableErr) || err?.name === 'AbortError') {
        if (singleStreamAttempts >= maxSingleStreamAttempts) {
          logger.error('Downloader', `[DirectDownloader] 单流下载连续重试 ${maxSingleStreamAttempts} 次均失败: ${retryableErr.message}`)
          throw new Error(`单流下载失败 (已重试 ${maxSingleStreamAttempts} 次: ${retryableErr.message})`)
        }
        const friendlyMsg = formatTransientErrorMessage(retryableErr)
        logger.warn('Downloader', `[DirectDownloader] 单流下载遭遇网络波动，正在后台自动重试 (第 ${singleStreamAttempts} 次): ${retryableErr.message}`)
        host.sendProgress({
          id,
          totalBytes: finalTotalBytes,
          receivedBytes,
          speed: 0,
          status: 'downloading',
          errorMsg: `正在重试: ${friendlyMsg}`
        })
        await new Promise(r => setTimeout(r, getTransientRetryDelay(singleStreamAttempts, retryableErr)))
      } else {
        logger.error('Downloader', `[DirectDownloader] 单流下载遇到非瞬态错误: ${retryableErr.message}`)
        throw retryableErr
      }
    } finally {
      handle?.cleanup()
    }
  }

  const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : receivedBytes
  logger.info('Downloader', `[DirectDownloader] 单文件流式下载完成: ${savePath}，大小: ${finalFileSize}`)
  return {
    filePath: savePath,
    fileSize: finalFileSize
  }
}
