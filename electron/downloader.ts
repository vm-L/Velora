import { net } from 'electron'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'

import path from 'path'
import { Readable } from 'stream'
import { storeManager } from './store'
import { logger } from './logger'
import { clientManager } from './main'
import { getAvailableEncoders, getEncoderArgs, VideoEncoder, isGpuEncoder } from './gpuAccelerator'

export interface DownloadCommand {
  id: string
  url: string
  savePath: string
  startBytes: number
  downloadedSegments?: number
  totalSegments?: number
  referer?: string
  origin?: string
}

export function getHeadersForUrl(_urlStr: string, customReferer?: string, _customOrigin?: string, clientId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }

  if (clientId) {
    headers['X-Velora-Client-Id'] = clientId
  }
  if (customReferer) {
    headers['X-Velora-Referer'] = customReferer
  }

  return headers
}

export interface M3U8Segment {
  index: number
  url: string
  duration: number
  key?: { method: string, url: string, iv?: string }
}

/**
 * 智能解析 M3U8 Playlist (自动处理 Master Playlist 与相对路径)
 */
async function parseM3U8(playlistUrl: string, originHeaders: any): Promise<M3U8Segment[]> {
  const response = await net.fetch(playlistUrl, { headers: originHeaders })
  if (!response.ok) {
    throw new Error(`无法获取 M3U8 播放列表: HTTP ${response.status}`)
  }
  const text = await response.text()
  
  if (!text.includes('#EXTM3U')) {
    throw new Error('无效的 M3U8 播放列表文本文件')
  }

  // 处理 Master Playlist 嵌套
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split('\n')
    let highestBandwidth = -1
    let bestSubPlaylistUrl = ''
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const nextLine = lines[i + 1]?.trim()
        if (nextLine && !nextLine.startsWith('#')) {
          let bandwidth = 0
          const bwMatch = line.match(/BANDWIDTH=(\d+)/)
          if (bwMatch) {
            bandwidth = parseInt(bwMatch[1], 10)
          }
          
          if (bandwidth > highestBandwidth) {
            highestBandwidth = bandwidth
            bestSubPlaylistUrl = resolveUrl(playlistUrl, nextLine)
          }
        }
      }
    }
    if (bestSubPlaylistUrl) {
      logger.info('Downloader', `[M3U8Parser] 发现 Master Playlist，已自动选择最高清晰度 (Bandwidth: ${highestBandwidth}) 转向二级子列表: ${bestSubPlaylistUrl}`)
      return parseM3U8(bestSubPlaylistUrl, originHeaders)
    }
  }

  // 解析分片
  const lines = text.split('\n')
  const segments: M3U8Segment[] = []
  let currentDuration = 0
  let index = 0
  let currentKey: { method: string, url: string, iv?: string } | undefined = undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    if (line.startsWith('#EXT-X-KEY:')) {
      const methodMatch = line.match(/METHOD=([^,]+)/)
      const method = methodMatch ? methodMatch[1] : 'NONE'
      if (method === 'NONE') {
        currentKey = undefined
      } else {
        const uriMatch = line.match(/URI="([^"]+)"/)
        const ivMatch = line.match(/IV=([^,]+)/)
        if (uriMatch) {
          currentKey = {
            method,
            url: resolveUrl(playlistUrl, uriMatch[1]),
            iv: ivMatch ? ivMatch[1] : undefined
          }
        }
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI="([^"]+)"/)
      if (uriMatch) {
        segments.push({
          index: index++,
          url: resolveUrl(playlistUrl, uriMatch[1]),
          duration: 0,
          key: currentKey
        })
      }
    } else if (line.startsWith('#EXTINF:')) {
      const durMatch = line.match(/#EXTINF:([\d\.]+)/)
      if (durMatch) {
        currentDuration = parseFloat(durMatch[1])
      }
    } else if (line && !line.startsWith('#')) {
      const segUrl = resolveUrl(playlistUrl, line)
      segments.push({
        index: index++,
        url: segUrl,
        duration: currentDuration,
        key: currentKey
      })
    }
  }

  return segments
}

function resolveUrl(baseUrl: string, relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute
  }
  try {
    return new URL(relativeOrAbsolute, baseUrl).href
  } catch {
    const urlObj = new URL(baseUrl)
    const basePath = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1)
    if (relativeOrAbsolute.startsWith('/')) {
      return `${urlObj.origin}${relativeOrAbsolute}`
    } else {
      return `${urlObj.origin}${basePath}${relativeOrAbsolute}`
    }
  }
}

/**
 * 安全原子文件替换 (带备份与占用重试机制)
 * 1. 验证临时文件有效性
 * 2. 将目标原文件安全重命名为临时备份 .orig_bak_timestamp
 * 3. 将新临时文件重命名为目标文件（支持多次重试及跨卷/锁定时 copy+unlink 兜底）
 * 4. 成功后删除备份；若失败则立即从备份还原原文件，绝不丢失任何一方
 */
async function safeAtomicReplace(sourceTempPath: string, targetFinalPath: string): Promise<boolean> {
  if (!fs.existsSync(sourceTempPath)) {
    logger.error('Downloader', `[SafeReplace] 临时文件不存在: ${sourceTempPath}`)
    return false
  }
  const sourceSize = fs.statSync(sourceTempPath).size
  if (sourceSize <= 0) {
    logger.error('Downloader', `[SafeReplace] 临时文件为空: ${sourceTempPath}`)
    return false
  }

  const dir = path.dirname(targetFinalPath)
  const parsed = path.parse(targetFinalPath)
  const backupPath = path.join(dir, `${parsed.name}.orig_bak_${Date.now()}${parsed.ext}`)

  const retryOperation = async (op: () => void, maxAttempts = 8, baseDelay = 150): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        op()
        return true
      } catch (err: any) {
        if (attempt === maxAttempts) {
          logger.warn('Downloader', `[SafeReplace] 操作失败 (${attempt}/${maxAttempts}): ${err.message}`)
          return false
        }
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(1.3, attempt - 1)))
      }
    }
    return false
  }

  let hasBackup = false
  if (fs.existsSync(targetFinalPath)) {
    // 步骤 1: 将原文件移至备份
    const backupOk = await retryOperation(() => {
      if (fs.existsSync(backupPath)) {
        try { fs.unlinkSync(backupPath) } catch {}
      }
      fs.renameSync(targetFinalPath, backupPath)
    })

    if (!backupOk) {
      logger.error('Downloader', `[SafeReplace] 无法备份原文件，原文件可能正被其他程序或播放器占用锁定: ${targetFinalPath}`)
      return false
    }
    hasBackup = true
  }

  // 步骤 2: 将新临时文件移入目标路径
  const replaceOk = await retryOperation(() => {
    if (fs.existsSync(targetFinalPath)) {
      try { fs.unlinkSync(targetFinalPath) } catch {}
    }
    fs.renameSync(sourceTempPath, targetFinalPath)
  })

  if (replaceOk) {
    // 步骤 3: 替换成功，删除备份文件
    if (hasBackup && fs.existsSync(backupPath)) {
      await retryOperation(() => {
        fs.unlinkSync(backupPath)
      })
    }
    logger.info('Downloader', `[SafeReplace] 文件安全替换成功: ${targetFinalPath}`)
    return true
  } else {
    // 步骤 4: 替换失败，尝试 copy 兜底
    let copyFallbackOk = false
    try {
      logger.warn('Downloader', `[SafeReplace] 重命名失败，尝试 copyFileSync 兜底写入: ${targetFinalPath}`)
      fs.copyFileSync(sourceTempPath, targetFinalPath)
      try { fs.unlinkSync(sourceTempPath) } catch {}
      copyFallbackOk = true
    } catch (copyErr: any) {
      logger.error('Downloader', `[SafeReplace] copyFileSync 兜底写入失败: ${copyErr.message}`)
      copyFallbackOk = false
    }

    if (copyFallbackOk) {
      if (hasBackup && fs.existsSync(backupPath)) {
        try { fs.unlinkSync(backupPath) } catch {}
      }
      return true
    }

    // 步骤 5: 无法替换，从备份紧急还原原始文件
    logger.error('Downloader', `[SafeReplace] 临时文件写入目标失败，正在从备份还原原文件: ${targetFinalPath}`)
    if (hasBackup && fs.existsSync(backupPath)) {
      const restoreOk = await retryOperation(() => {
        if (fs.existsSync(targetFinalPath)) {
          try { fs.unlinkSync(targetFinalPath) } catch {}
        }
        fs.renameSync(backupPath, targetFinalPath)
      })
      if (!restoreOk) {
        // 如果 rename 还原失败，用 copy 强制还原
        try {
          fs.copyFileSync(backupPath, targetFinalPath)
          try { fs.unlinkSync(backupPath) } catch {}
        } catch (resErr: any) {
          logger.error('Downloader', `[SafeReplace] 严重错误：无法自动还原备份文件 ${backupPath}: ${resErr.message}`)
        }
      }
    }
    return false
  }
}

interface CompressQueueItem {
  taskId: string
  filePath: string
  targetBitrateKbps: number
  totalSegments?: number
  resolve?: (res: { success: boolean; newSize?: number; error?: string; skipped?: boolean }) => void
  reject?: (err: any) => void
}

class Downloader {
  private activeDownloads: Map<string, { abortController: AbortController, tempPaths?: string[] }> = new Map()
  private pendingQueue: DownloadCommand[] = []
  private isCompressingActive = false
  private compressQueue: CompressQueueItem[] = []
  private activeCompressTaskId: string | null = null
  private activeCompressController: AbortController | null = null
  private activeCompressTempPath: string | null = null
  private mainWindow: any = null

  setWindow(window: any) {
    this.mainWindow = window
    logger.info('Downloader', `[Downloader] MainWindow 已成功绑定和初始化。`)
  }

  async startDownload(cmd: DownloadCommand) {
    logger.info('Downloader', `[Downloader] startDownload ID: ${cmd.id}, URL: ${cmd.url}, savePath: ${cmd.savePath}, startBytes: ${cmd.startBytes}`)

    if (cmd.url && cmd.referer) {
      clientManager.registerClient({
        clientId: cmd.id,
        referer: cmd.referer,
        origin: cmd.origin
      })
    }

    if (this.activeDownloads.has(cmd.id) || this.pendingQueue.some(c => c.id === cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在队列或下载中，跳过重复添加。`)
      return
    }

    if (this.activeCompressTaskId === cmd.id || this.compressQueue.some(c => c.taskId === cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在压缩队列或压缩中，跳过重复添加。`)
      return
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
        totalBytes: 0,
        receivedBytes: cmd.startBytes || 0,
        status: 'waiting',
        speed: 0
      })
    }
  }

  private sendProgress(payload: any) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('download-progress', payload)
    }
  }

  private async isM3U8UrlOrContent(url: string, headers: any, signal: AbortSignal): Promise<boolean> {
    const lower = url.toLowerCase()
    if (lower.includes('.m3u8')) return true
    try {
      const res = await net.fetch(url, {
        headers: { ...headers, 'Range': 'bytes=0-512' },
        signal: signal as any
      })
      const text = await res.text()
      return text.includes('#EXTM3U')
    } catch {
      return false
    }
  }

  private async runTask(cmd: DownloadCommand) {
    const abortController = new AbortController()
    this.activeDownloads.set(cmd.id, { abortController })
    this.sendProgress({ id: cmd.id, status: 'resolving', speed: 0 })

    let downloadResult: { filePath: string; fileSize: number; totalSegments?: number } | null = null

    try {
      const headers = getHeadersForUrl(cmd.url, cmd.referer, cmd.origin, cmd.id)
      const isM3U8 = await this.isM3U8UrlOrContent(cmd.url, headers, abortController.signal)
      if (isM3U8) {
        downloadResult = await this.downloadM3U8Task(cmd, abortController)
      } else {
        downloadResult = await this.downloadDirectFileTask(cmd, abortController)
      }
    } catch (err: any) {
      logger.error('Downloader', `[Downloader] 任务 ${cmd.id} 执行异常: ${err.message}`)
      if (err.name === 'AbortError') {
        this.sendProgress({ id: cmd.id, status: 'paused' })
      } else {
        this.sendProgress({ id: cmd.id, status: 'error', errorMsg: err.message })
      }
      return
    } finally {
      clientManager.unregisterClient(cmd.id)
      this.activeDownloads.delete(cmd.id)
      this.checkQueue()
    }

    if (downloadResult) {
      await this.handlePostDownload(cmd.id, downloadResult.filePath, downloadResult.fileSize, downloadResult.totalSegments)
    }
  }

  /**
   * M3U8 断点续传、多分片并发下载、内存缓冲池 (Memory Buffer Flush) 顺序追加合并
   */
  private async downloadM3U8Task(cmd: DownloadCommand, abortController: AbortController): Promise<{ filePath: string; fileSize: number; totalSegments: number }> {
    const { id, url, savePath } = cmd

    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    let finalSavePath = savePath
    if (!finalSavePath.toLowerCase().endsWith('.mp4')) {
      if (finalSavePath.toLowerCase().endsWith('.m3u8') || finalSavePath.toLowerCase().endsWith('.ts')) {
        finalSavePath = finalSavePath.replace(/\.(m3u8|ts)$/i, '.mp4')
      } else {
        finalSavePath = finalSavePath + '.mp4'
      }
    }
    const isTargetMp4 = true
    const workSavePath = finalSavePath + '.temp.ts'

    // 1. 检查是否已有完整封装的目标 MP4（例如之前下载与转封装已完成，处于排队压缩或压缩中暂停后恢复）
    if (fs.existsSync(finalSavePath) && !fs.existsSync(workSavePath)) {
      try {
        const stat = fs.statSync(finalSavePath)
        if (stat.size > 0) {
          const info = await this.getVideoDurationAndBitrate(finalSavePath)
          if (info.duration > 0) {
            logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 目标 MP4 已完整存在 (大小: ${stat.size}B, 时长: ${info.duration}s)，跳过下载`)
            return {
              filePath: finalSavePath,
              fileSize: stat.size,
              totalSegments: cmd.totalSegments || cmd.downloadedSegments || 1
            }
          }
        }
      } catch (e: any) {
        logger.warn('Downloader', `[M3U8Downloader] 检查已存在目标文件异常: ${e.message}`)
      }
    }

    // 2. 检查临时 TS 文件是否已全量就绪（在格式转换阶段暂停后继续，跳过网络请求直接执行格式转换）
    if (fs.existsSync(workSavePath)) {
      try {
        const stat = fs.statSync(workSavePath)
        const isReadyForConvert = cmd.downloadedSegments !== undefined &&
          cmd.downloadedSegments > 0 &&
          (
            (cmd.totalSegments !== undefined && cmd.downloadedSegments >= cmd.totalSegments) ||
            (cmd.startBytes !== undefined && cmd.startBytes > 0 && stat.size >= cmd.startBytes)
          ) &&
          stat.size > 0

        if (isReadyForConvert) {
          logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 临时 TS 文件已完整落盘 (${stat.size} 字节, ${cmd.downloadedSegments}/${cmd.totalSegments || cmd.downloadedSegments} 分片)，直接进入格式转换`)
          if (isTargetMp4) {
            await this.convertTsToMp4(workSavePath, finalSavePath, abortController, id)
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
        if (e.name === 'AbortError') {
          const savedBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
          this.sendProgress({
            id,
            totalBytes: 0,
            receivedBytes: savedBytes,
            downloadedSegments: cmd.downloadedSegments,
            totalSegments: cmd.totalSegments || cmd.downloadedSegments,
            speed: 0,
            status: 'paused'
          })
          throw e
        }
        logger.warn('Downloader', `[M3U8Downloader] 检查临时 TS 转换就绪异常: ${e.message}，回退至正常解析流程`)
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

    const headers = getHeadersForUrl(url, cmd.referer, cmd.origin, cmd.id)

    const segments = await parseM3U8(url, headers)
    if (segments.length === 0) {
      throw new Error('M3U8 列表中未解析到任何可下载的分片视频')
    }
    logger.info('Downloader', `[M3U8Downloader] 成功解析出 ${segments.length} 个 TS 视频分片`)

    // 检查断点续传：目标文件是否已存在及大小
    let existingBytes = 0
    let skipSegments = 0
    let fileFlags = 'w'

    if (fs.existsSync(workSavePath)) {
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

    const fd = fs.openSync(workSavePath, fileFlags)
    const keyCache = new Map<string, Buffer>()
    const bufferMap = new Map<number, Buffer>()
    let currentBufferedBytes = 0
    let nextFlushIndex = skipSegments
    let totalReceivedBytes = existingBytes

    let lastReportTime = Date.now()
    let lastReportBytes = totalReceivedBytes

    const flushMemoryToDisk = (forceAll: boolean = false) => {
      while (bufferMap.has(nextFlushIndex)) {
        const chunkBuf = bufferMap.get(nextFlushIndex)!
        fs.writeSync(fd, chunkBuf)
        currentBufferedBytes -= chunkBuf.length
        bufferMap.delete(nextFlushIndex)
        nextFlushIndex++
      }

      if (forceAll || currentBufferedBytes >= maxMemoryBytes) {
        logger.info('Downloader', `[MemoryBuffer] M3U8 内存缓冲达到限制/完成 (${(currentBufferedBytes / 1024 / 1024).toFixed(2)} MB)，执行批量写盘清内存。`)
      }
    }

    const concurrency = 8
    let segQueueIndex = skipSegments

    const fetchNextSegment = async (): Promise<void> => {
      while (segQueueIndex < segments.length) {
        if (abortController.signal.aborted) {
          throw new DOMException('User aborted download', 'AbortError')
        }

        const seg = segments[segQueueIndex++]
        let attempts = 0
        let success = false

        while (attempts < 3 && !success) {
          if (abortController.signal.aborted) {
            throw new DOMException('User aborted download', 'AbortError')
          }
          try {
            const res = await net.fetch(seg.url, { headers, signal: abortController.signal as any })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            let buf = Buffer.from(await res.arrayBuffer())

            if (seg.key && seg.key.method === 'AES-128') {
              let keyBuf = keyCache.get(seg.key.url)
              if (!keyBuf) {
                const keyRes = await net.fetch(seg.key.url, { headers, signal: abortController.signal as any })
                if (!keyRes.ok) throw new Error(`Key fetch failed: ${seg.key.url}`)
                keyBuf = Buffer.from(await keyRes.arrayBuffer())
                keyCache.set(seg.key.url, keyBuf)
              }
              let ivBuf: Buffer
              if (seg.key.iv) {
                let hex = seg.key.iv.startsWith('0x') || seg.key.iv.startsWith('0X') ? seg.key.iv.slice(2) : seg.key.iv
                hex = hex.padStart(32, '0')
                ivBuf = Buffer.from(hex, 'hex')
              } else {
                ivBuf = Buffer.alloc(16)
                ivBuf.writeUInt32BE(seg.index, 12)
              }
              try {
                const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf)
                decipher.setAutoPadding(true)
                buf = Buffer.concat([decipher.update(buf), decipher.final()])
              } catch (err) {
                const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuf, ivBuf)
                decipher.setAutoPadding(false)
                buf = Buffer.concat([decipher.update(buf), decipher.final()])
              }
            }

            bufferMap.set(seg.index, buf)
            currentBufferedBytes += buf.length
            totalReceivedBytes += buf.length

            if (currentBufferedBytes >= maxMemoryBytes) {
              flushMemoryToDisk(false)
            }

            const now = Date.now()
            if (now - lastReportTime > 400 || nextFlushIndex === segments.length) {
              const speed = ((totalReceivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
              this.sendProgress({
                id,
                totalBytes: 0,
                receivedBytes: totalReceivedBytes,
                downloadedSegments: nextFlushIndex,
                totalSegments: segments.length,
                speed,
                status: 'downloading'
              })
              lastReportTime = now
              lastReportBytes = totalReceivedBytes
            }

            success = true
          } catch (e: any) {
            attempts++
            if (e.name === 'AbortError') throw e
            if (attempts >= 5) {
              logger.info('Downloader', `[M3U8Downloader] 分片 ${seg.index} 连续重试 5 次均失败: ${e.message}`)
              abortController.abort()
              throw new Error(`分片 ${seg.index} 下载失败 (${e.message})`)
            }
            await new Promise(r => setTimeout(r, Math.min(3000, 1000 * Math.pow(1.5, attempts))))
          }
        }
      }
    }

    const workers: Promise<void>[] = []
    for (let c = 0; c < concurrency; c++) {
      workers.push(fetchNextSegment())
    }

    try {
      await Promise.all(workers)
      flushMemoryToDisk(true)
      fs.closeSync(fd)

      if (isTargetMp4) {
        await this.convertTsToMp4(workSavePath, finalSavePath, abortController, id)
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
      try {
        flushMemoryToDisk(false)
        fs.closeSync(fd)
      } catch {}
      if (err.name === 'AbortError') {
        const savedBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : totalReceivedBytes
        this.sendProgress({
          id,
          totalBytes: 0,
          receivedBytes: savedBytes,
          downloadedSegments: nextFlushIndex,
          totalSegments: segments.length,
          speed: 0,
          status: 'paused'
        })
      }
      throw err
    }
  }

  /**
   * 将分片合并落盘的 TS 临时视频无损封装为 MP4 格式 (消费 stdout/stderr 避免管道死锁)
   */
  private async convertTsToMp4(
    workSavePath: string,
    finalSavePath: string,
    abortController: AbortController,
    taskId: string
  ): Promise<void> {
    logger.info('Downloader', `[M3U8Downloader] 准备将 TS 封装为 MP4: ${workSavePath} -> ${finalSavePath}`)
    const totalBytes = fs.existsSync(workSavePath) ? fs.statSync(workSavePath).size : 0
    this.sendProgress({
      id: taskId,
      totalBytes,
      receivedBytes: totalBytes,
      status: 'converting',
      speed: 0
    })

    await new Promise<void>((resolve, reject) => {
      const ffmpegBin = 'ffmpeg'
      const child = spawn(ffmpegBin, [
        '-y',
        '-i', workSavePath,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        finalSavePath
      ])

      let stderrBuffer = ''
      child.stderr?.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        if (stderrBuffer.length > 5000) {
          stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 5000)
        }
      })

      child.stdout?.on('data', () => {
        // 消费 stdout 避免管道挂起
      })

      child.on('close', (code) => {
        if (code === 0) {
          try { fs.unlinkSync(workSavePath) } catch {}
          resolve()
        } else {
          logger.error('Downloader', `[M3U8Downloader] FFmpeg 封装失败 (code ${code}): ${stderrBuffer}`)
          reject(new Error(`FFmpeg exited with code ${code}: ${stderrBuffer.slice(-200)}`))
        }
      })

      child.on('error', (err) => {
        logger.error('Downloader', `[M3U8Downloader] FFmpeg 启动异常: ${err.message}`)
        reject(err)
      })

      if (abortController.signal.aborted) {
        child.kill('SIGKILL')
        reject(new DOMException('User aborted download', 'AbortError'))
      } else {
        abortController.signal.addEventListener('abort', () => {
          child.kill('SIGKILL')
          reject(new DOMException('User aborted download', 'AbortError'))
        })
      }
    })
  }

  /**
   * 通用视频 (MP4 / AVI 等) 的断点续传、HTTP Range 分块多线程加速与内存缓冲
   */
  private async downloadDirectFileTask(cmd: DownloadCommand, abortController: AbortController): Promise<{ filePath: string; fileSize: number }> {
    const { id, url, savePath, startBytes = 0 } = cmd

    const chunkSize = 4 * 1024 * 1024 // 4MB
    const progressPath = savePath + '.velora'
    
    let completedChunks: number[] = []
    if (fs.existsSync(progressPath)) {
      try {
        const progData = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
        if (progData.chunkSize === chunkSize) {
          completedChunks = progData.completed || []
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

    const headers: any = getHeadersForUrl(url, cmd.referer, cmd.origin, cmd.id)

    let isRangeSupported = false
    let totalBytes = 0

    try {
      const checkRes = await net.fetch(url, {
        headers: { ...headers, 'Range': `bytes=0-1` },
        signal: abortController.signal as any
      })
      if (checkRes.status === 206) {
        isRangeSupported = true
        const cr = checkRes.headers.get('content-range')
        if (cr) {
          const match = cr.match(/\/(\d+)/)
          if (match) {
            totalBytes = parseInt(match[1], 10)
          }
        }
      }
    } catch (e: any) {
      logger.info('Downloader', `[DirectDownloader] Range 探测未响应: ${e.message}`)
    }

    if (fs.existsSync(savePath) && !fs.existsSync(progressPath) && totalBytes > 0) {
      try {
        const stat = fs.statSync(savePath)
        if (stat.size >= totalBytes) {
          logger.info('Downloader', `[DirectDownloader] 目标文件已完整存在 (${stat.size} >= ${totalBytes})，直接跳过下载`)
          return { filePath: savePath, fileSize: stat.size }
        }
      } catch {}
    }

    const totalChunksCount = Math.ceil(totalBytes / chunkSize)
    const validCompletedChunks = completedChunks.filter(i => i < totalChunksCount)
    let totalReceivedBytes = validCompletedChunks.length * chunkSize

    if (isRangeSupported && totalBytes > 2 * 1024 * 1024) {
      logger.info('Downloader', `[DirectDownloader] 支持 Range 断点续传。已完成 ${validCompletedChunks.length}/${totalChunksCount} 分块，开启 8 线程加速下载`)
      
      const chunks: Array<{ index: number; start: number; end: number }> = []
      
      for (let i = 0; i < totalChunksCount; i++) {
        if (validCompletedChunks.includes(i)) continue
        const start = i * chunkSize
        const end = Math.min(totalBytes - 1, start + chunkSize - 1)
        chunks.push({ index: i, start, end })
      }
      
      const fileFlags = fs.existsSync(savePath) ? 'r+' : 'w'
      if (fileFlags === 'r+') {
        try {
          const stats = fs.statSync(savePath)
          if (stats.size > totalBytes) {
             logger.info('Downloader', `[DirectDownloader] 续传旧文件过大，截断为 ${totalBytes}`)
             fs.truncateSync(savePath, totalBytes)
          }
        } catch {}
      }
      
      let fd: number
      try {
        fd = fs.openSync(savePath, fileFlags)
      } catch (err: any) {
        if (err.code === 'ENOENT' && fileFlags === 'r+') {
           fd = fs.openSync(savePath, 'w')
        } else {
           throw err
        }
      }

      interface WriteFragment {
        buffer: Buffer;
        position: number;
      }
      let writeFragments: WriteFragment[] = []
      let currentBufferedBytes = 0
      let downloadedChunksCount = validCompletedChunks.length
      
      let completedChunksToSave: number[] = []

      let lastReportTime = Date.now()
      let lastReportBytes = totalReceivedBytes

      const flushMemoryToDisk = (forceAll = false) => {
        if (writeFragments.length === 0 && completedChunksToSave.length === 0) return
        if (!forceAll && currentBufferedBytes < maxMemoryBytes) return

        for (const frag of writeFragments) {
          fs.writeSync(fd, frag.buffer, 0, frag.buffer.length, frag.position)
        }
        
        if (completedChunksToSave.length > 0) {
          validCompletedChunks.push(...completedChunksToSave)
          completedChunksToSave = []
          fs.writeFileSync(progressPath, JSON.stringify({ chunkSize, completed: validCompletedChunks }))
        }

        if (forceAll || currentBufferedBytes >= maxMemoryBytes) {
          logger.info('Downloader', `[MemoryBuffer] 单文件缓冲批量写盘并更新进度 (${(currentBufferedBytes / 1024 / 1024).toFixed(2)} MB)`)
        }

        writeFragments = []
        currentBufferedBytes = 0
      }

      let chunkQueueIndex = 0
      const concurrency = 8

      const fetchNextChunk = async (): Promise<void> => {
        while (chunkQueueIndex < chunks.length) {
          if (abortController.signal.aborted) {
            throw new DOMException('User aborted download', 'AbortError')
          }
          const chunkItem = chunks[chunkQueueIndex++]
          let attempts = 0
          let success = false

          while (attempts < 3 && !success) {
            if (abortController.signal.aborted) {
              throw new DOMException('User aborted download', 'AbortError')
            }
            try {
              const chunkRes = await net.fetch(url, {
                headers: { ...headers, 'Range': `bytes=${chunkItem.start}-${chunkItem.end}` },
                signal: abortController.signal as any
              })
              if (!chunkRes.ok && chunkRes.status !== 206) throw new Error(`HTTP ${chunkRes.status}`)
              
              if (!chunkRes.body) throw new Error("No response body")
              
              const reader = chunkRes.body.getReader()
              let currentPosition = chunkItem.start

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                if (abortController.signal.aborted) {
                  reader.cancel()
                  throw new DOMException('User aborted download', 'AbortError')
                }

                const buf = Buffer.from(value)
                writeFragments.push({ buffer: buf, position: currentPosition })
                currentPosition += buf.length
                currentBufferedBytes += buf.length
                totalReceivedBytes += buf.length

                if (currentBufferedBytes >= maxMemoryBytes) {
                  flushMemoryToDisk(false)
                }

                const now = Date.now()
                if (now - lastReportTime > 400) {
                  const speed = ((totalReceivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
                  this.sendProgress({
                    id,
                    totalBytes,
                    receivedBytes: totalReceivedBytes,
                    speed,
                    status: 'downloading'
                  })
                  lastReportTime = now
                  lastReportBytes = totalReceivedBytes
                }
              }

              completedChunksToSave.push(chunkItem.index)
              downloadedChunksCount++
              
              if (currentBufferedBytes >= maxMemoryBytes || downloadedChunksCount === totalChunksCount) {
                flushMemoryToDisk(downloadedChunksCount === totalChunksCount)
              }

              if (downloadedChunksCount === totalChunksCount) {
                const speed = ((totalReceivedBytes - lastReportBytes) / (Date.now() - lastReportTime)) * 1000
                this.sendProgress({
                  id,
                  totalBytes,
                  receivedBytes: totalReceivedBytes,
                  speed: isNaN(speed) ? 0 : speed,
                  status: 'downloading'
                })
              }

              success = true
            } catch (err: any) {
              attempts++
              if (err.name === 'AbortError') throw err
              if (attempts >= 5) {
                logger.info('Downloader', `[DirectDownloader] 分块 ${chunkItem.index} 连续重试 5 次均失败: ${err.message}`)
                abortController.abort()
                throw new Error(`分块 ${chunkItem.index} 下载失败 (${err.message})`)
              }
              await new Promise(r => setTimeout(r, Math.min(3000, 1000 * Math.pow(1.5, attempts))))
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
        flushMemoryToDisk(true)
        fs.closeSync(fd)
        
        if (fs.existsSync(progressPath)) {
          fs.unlinkSync(progressPath)
        }

        const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : totalBytes

        logger.info('Downloader', `[DirectDownloader] 单文件 Range 断点续传/下载完成: ${savePath}，大小: ${finalFileSize}`)
        return {
          filePath: savePath,
          fileSize: finalFileSize
        }
      } catch (err) {
        try { fs.closeSync(fd) } catch {}
        throw err
      }
    }

    // 3. 不支持 Range 时的退化降级：单线程流式下载
    if (startBytes > 0) {
      headers['Range'] = `bytes=${startBytes}-`
    }

    const response = await net.fetch(url, { headers, signal: abortController.signal as any })
    if (!response.ok && response.status !== 206) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const finalTotalBytes = contentLength ? parseInt(contentLength, 10) + startBytes : 0

    let flags = 'a'
    let actualStart = startBytes
    if (startBytes > 0 && response.status === 200) {
      flags = 'w'
      actualStart = 0
    }

    const fileStream = fs.createWriteStream(savePath, { flags })

    this.sendProgress({
      id,
      totalBytes: finalTotalBytes,
      receivedBytes: actualStart,
      status: 'downloading'
    })

    if (!response.body) throw new Error('No response body')

    const nodeStream = Readable.fromWeb(response.body as any)
    let receivedBytes = actualStart
    let lastReportTime = Date.now()
    let lastReportBytes = receivedBytes

    let memoryChunks: Buffer[] = []
    let memoryChunkBytes = 0

    const flushStreamBuffer = () => {
      if (memoryChunks.length > 0) {
        const combined = Buffer.concat(memoryChunks)
        fileStream.write(combined)
        memoryChunks = []
        memoryChunkBytes = 0
      }
    }

    nodeStream.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length
      memoryChunks.push(chunk)
      memoryChunkBytes += chunk.length

      if (memoryChunkBytes >= maxMemoryBytes) {
        flushStreamBuffer()
      }

      const now = Date.now()
      if (now - lastReportTime > 500) {
        const speed = ((receivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
        this.sendProgress({
          id,
          receivedBytes,
          totalBytes: finalTotalBytes,
          speed,
          status: 'downloading'
        })
        lastReportTime = now
        lastReportBytes = receivedBytes
      }
    })

    await new Promise<void>((resolve, reject) => {
      nodeStream.on('end', () => {
        flushStreamBuffer()
        fileStream.end()
        resolve()
      })
      nodeStream.on('error', reject)
      fileStream.on('error', reject)
      abortController.signal.addEventListener('abort', () => {
        fileStream.end()
        reject(new DOMException('The user aborted a request.', 'AbortError'))
      })
    })

    const finalFileSize = fs.existsSync(savePath) ? fs.statSync(savePath).size : receivedBytes
    logger.info('Downloader', `[DirectDownloader] 单文件流式下载完成: ${savePath}，大小: ${finalFileSize}`)
    return {
      filePath: savePath,
      fileSize: finalFileSize
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

    // 2. 如果在待压缩队列中
    const compressQueueIndex = this.compressQueue.findIndex(c => c.taskId === id)
    if (compressQueueIndex !== -1) {
      const removed = this.compressQueue.splice(compressQueueIndex, 1)[0]
      this.sendProgress({ id, status: 'paused', speed: 0 })
      if (removed.resolve) {
        removed.resolve({ success: false, error: '压缩排队已取消' })
      }
      logger.info('Downloader', `[CompressQueue] 任务 ${id} 已从压缩排队队列中移除并暂停`)
      return
    }

    // 3. 如果当前正在压缩中
    if (this.activeCompressTaskId === id && this.activeCompressController) {
      logger.info('Downloader', `[CompressQueue] 正在压缩的任务 ${id} 被暂停，中断压缩进程`)
      this.activeCompressController.abort()
      if (this.activeCompressTempPath) {
        try {
          if (fs.existsSync(this.activeCompressTempPath)) {
            fs.unlinkSync(this.activeCompressTempPath)
          }
        } catch {}
      }
      this.sendProgress({ id, status: 'paused', speed: 0 })
      return
    }

    // 4. 如果当前正在下载中
    if (this.activeDownloads.has(id)) {
      const entry = this.activeDownloads.get(id)!
      entry.abortController.abort()
      if (entry.tempPaths) {
        for (const p of entry.tempPaths) {
          try {
            if (fs.existsSync(p)) {
              fs.unlinkSync(p)
              logger.info('Downloader', `[Cleanup] 暂停/取消已清理临时文件: ${p}`)
            }
          } catch (e: any) {
            logger.warn('Downloader', `[Cleanup] 清理临时文件失败: ${e.message}`)
          }
        }
      }
      this.activeDownloads.delete(id)
      this.checkQueue()
    }
  }

  cancelDownload(id: string) {
    this.pauseDownload(id)
  }

  async getVideoMediaInfo(filePath: string): Promise<{ duration: number; bitrate: number; size: number }> {
    if (!fs.existsSync(filePath)) {
      return { duration: 0, bitrate: 0, size: 0 }
    }
    const size = fs.statSync(filePath).size
    const info = await this.getVideoDurationAndBitrate(filePath)
    let bitrate = info.bitrate
    if (bitrate <= 0 && info.duration > 0) {
      bitrate = Math.round((size * 8) / info.duration)
    }
    return { duration: info.duration, bitrate, size }
  }

  /**
   * 评估视频文件是否符合自动压缩条件并计算目标码率
   */
  private async evaluateAutoCompress(filePath: string, taskId: string): Promise<{ needCompress: boolean; targetBitrateKbps: number }> {
    try {
      const ext = path.extname(filePath).toLowerCase()
      const videoExts = ['.mp4', '.mkv', '.webm', '.ts', '.avi', '.mov', '.flv']
      if (!videoExts.includes(ext)) {
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      const isCompressEnabled = (await storeManager.getSetting('enableVideoCompress')) || false
      if (!isCompressEnabled) {
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      const targetGB = (await storeManager.getSetting('videoCompressTargetGB')) ?? (await storeManager.getSetting('videoCompressThresholdGB')) ?? 1.5
      const targetSizeBytes = targetGB * 1024 * 1024 * 1024
      const triggerSizeBytes = targetSizeBytes * 1.5

      const minBitrateKbps = (await storeManager.getSetting('videoCompressMinBitrateKbps')) ?? 1500
      const minBitrateBps = minBitrateKbps * 1000

      if (!fs.existsSync(filePath)) {
        return { needCompress: false, targetBitrateKbps: 0 }
      }
      const currentSize = fs.statSync(filePath).size

      // 1. 体积触发条件：下载的视频文件大小 ≥ 目标文件大小的 1.5 倍
      if (currentSize < triggerSizeBytes) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 文件体积 (${(currentSize / 1024 / 1024).toFixed(1)}MB) 未达到触发条件 (目标大小 ${targetGB}GB 的 1.5倍即 ${(triggerSizeBytes / 1024 / 1024 / 1024).toFixed(2)}GB)，跳过压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      // 2. 读取视频时长与实际码率
      const videoInfo = await this.getVideoDurationAndBitrate(filePath)
      let actualBitrateBps = 0
      if (videoInfo.bitrate > 0) {
        actualBitrateBps = videoInfo.bitrate
      } else if (videoInfo.duration > 0) {
        actualBitrateBps = (currentSize * 8) / videoInfo.duration
      }
      const actualBitrateKbps = Math.round(actualBitrateBps / 1000)

      // 3. 文件码率需大于最小码率
      if (actualBitrateBps > 0 && actualBitrateBps <= minBitrateBps) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 实际码率 (${actualBitrateKbps} kbps) 未大于设置的最小码率 (${minBitrateKbps} kbps)，保持原画质无需压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      // 4. 读取视频时长，计算目标压缩大小所需的码率
      if (!videoInfo.duration || videoInfo.duration <= 0) {
        logger.warn('Downloader', `[AutoCompress] 任务 ${taskId} 无法获取有效视频时长，跳过压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      const calculatedTargetBps = (targetSizeBytes * 8) / videoInfo.duration
      let targetBitrateKbps = Math.round(calculatedTargetBps / 1000)

      // 当计算得到的压缩码率小于设置的最小码率时，使用最小码率
      if (targetBitrateKbps < minBitrateKbps) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 计算出的目标码率 (${targetBitrateKbps} kbps) 小于设置的最小码率 (${minBitrateKbps} kbps)，保底使用最小码率 (${minBitrateKbps} kbps)`)
        targetBitrateKbps = minBitrateKbps
      }

      // 5. 限制：仅当目标码率小于等于原始码率时可以进行压缩
      if (actualBitrateKbps > 0 && targetBitrateKbps > actualBitrateKbps) {
        logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 目标码率 (${targetBitrateKbps} kbps) 大于原始码率 (${actualBitrateKbps} kbps)，无需压缩`)
        return { needCompress: false, targetBitrateKbps: 0 }
      }

      logger.info('Downloader', `[AutoCompress] 任务 ${taskId} 满足自动压缩条件 (体积 ${(currentSize / 1024 / 1024).toFixed(2)}MB, 目标码率 ${targetBitrateKbps}kbps)`)
      return { needCompress: true, targetBitrateKbps }
    } catch (e: any) {
      logger.error('Downloader', `[AutoCompress] 评估压缩条件失败: ${e.message}`)
      return { needCompress: false, targetBitrateKbps: 0 }
    }
  }

  /**
   * 下载完成后的收尾工作：无需压缩则标记完成；需压缩则加入单一压缩队列排队
   */
  private async handlePostDownload(taskId: string, filePath: string, fileSize: number, totalSegments?: number) {
    const { needCompress, targetBitrateKbps } = await this.evaluateAutoCompress(filePath, taskId)

    if (!needCompress) {
      logger.info('Downloader', `[Downloader] 任务 ${taskId} 无需压缩，直接标记完成。最终大小: ${fileSize}`)
      this.sendProgress({
        id: taskId,
        totalBytes: fileSize,
        receivedBytes: fileSize,
        downloadedSegments: totalSegments,
        totalSegments: totalSegments,
        status: 'completed',
        progress: 100,
        speed: 0
      })
      return
    }

    // 加入全局单一压缩队列排队调度
    this.enqueueCompressTask({
      taskId,
      filePath,
      targetBitrateKbps,
      totalSegments
    })
  }

  /**
   * 统一将压缩任务压入队列（单并发调度，完全不占用下载并发槽位）
   */
  private enqueueCompressTask(item: CompressQueueItem) {
    if (this.isCompressingActive) {
      logger.info('Downloader', `[CompressQueue] 当前已有压缩任务进行中，任务 ${item.taskId} 进入排队 (队列位置: ${this.compressQueue.length + 1})`)
      this.sendProgress({
        id: item.taskId,
        status: 'waiting',
        speedText: '等待压缩',
        progress: 100,
        downloadedSegments: item.totalSegments,
        totalSegments: item.totalSegments,
        speed: 0
      })
      this.compressQueue.push(item)
    } else {
      this.isCompressingActive = true
      this.activeCompressTaskId = item.taskId
      this.executeCompressQueueItem(item)
    }
  }

  /**
   * 手动压缩视频接口（由用户或右键菜单触发）
   */
  async compressVideoTask(taskId: string, filePath: string, targetBitrateKbps: number): Promise<{ success: boolean; newSize?: number; error?: string; skipped?: boolean }> {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }
    const currentSize = fs.statSync(filePath).size
    if (currentSize <= 0) {
      return { success: false, error: '文件为空' }
    }

    const info = await this.getVideoMediaInfo(filePath)
    const actualBitrateKbps = info.bitrate > 0 ? Math.round(info.bitrate / 1000) : 0
    if (actualBitrateKbps > 0 && targetBitrateKbps >= actualBitrateKbps) {
      logger.info('Downloader', `[ManualCompress] 任务 ${taskId} 原始码率 (${actualBitrateKbps} kbps) 小于等于目标码率 (${targetBitrateKbps} kbps)，自动跳过`)
      return { success: false, skipped: true, error: '码率未超过目标码率，无需压缩' }
    }

    return new Promise<{ success: boolean; newSize?: number; error?: string; skipped?: boolean }>((resolve, reject) => {
      this.enqueueCompressTask({
        taskId,
        filePath,
        targetBitrateKbps,
        resolve,
        reject
      })
    })
  }

  /**
   * 执行单个压缩任务（同一时刻仅有且仅能有一个任务处于执行中）
   */
  private async executeCompressQueueItem(item: CompressQueueItem) {
    const { taskId, filePath, targetBitrateKbps, totalSegments, resolve } = item
    this.activeCompressTaskId = taskId
    this.activeCompressController = new AbortController()

    const dir = path.dirname(filePath)
    const parsed = path.parse(filePath)
    const tempCompressedPath = path.join(dir, `${parsed.name}.compress_tmp.mp4`)
    this.activeCompressTempPath = tempCompressedPath

    // 注意：绝对不能将 taskId 放入 this.activeDownloads！压缩任务完全不占用下载并发槽位！

    try {
      const currentSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
      const info = await this.getVideoDurationAndBitrate(filePath)

      this.sendProgress({
        id: taskId,
        status: 'compressing',
        progress: 0,
        speed: 0,
        downloadedSegments: totalSegments,
        totalSegments: totalSegments
      })

      const encoders = await getAvailableEncoders()
      let compressSuccess = false
      let usedEncoder = ''
      let lastCompressError = ''

      for (const encoder of encoders) {
        if (this.activeCompressController.signal.aborted) break
        const isGpu = isGpuEncoder(encoder)
        logger.info('Downloader', `[CompressTask] 任务 ${taskId} 尝试使用编码器 [${encoder}] (${isGpu ? 'GPU硬件加速' : 'CPU'}) 压缩 (${targetBitrateKbps} kbps)`)
        const result = await this.executeFfmpegCompress(
          filePath,
          tempCompressedPath,
          encoder,
          targetBitrateKbps,
          info.duration,
          currentSize,
          taskId,
          this.activeCompressController
        )
        if (result.success && fs.existsSync(tempCompressedPath)) {
          const compSize = fs.statSync(tempCompressedPath).size
          if (compSize > 0) {
            compressSuccess = true
            usedEncoder = encoder
            break
          }
        }
        if (result.error) {
          lastCompressError = result.error
        }
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
      }

      if (this.activeCompressController.signal.aborted) {
        logger.info('Downloader', `[CompressTask] 任务 ${taskId} 压缩已被中断取消`)
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
        if (resolve) resolve({ success: false, error: '压缩已取消' })
        return
      }

      if (compressSuccess && fs.existsSync(tempCompressedPath)) {
        const compressedSize = fs.statSync(tempCompressedPath).size
        logger.info('Downloader', `[CompressTask] 任务 ${taskId} 使用 [${usedEncoder}] 压缩成功: ${(currentSize / 1024 / 1024).toFixed(1)}MB -> ${(compressedSize / 1024 / 1024).toFixed(1)}MB`)
        
        const replaced = await safeAtomicReplace(tempCompressedPath, filePath)
        if (replaced) {
          this.sendProgress({
            id: taskId,
            status: 'completed',
            progress: 100,
            receivedBytes: compressedSize,
            totalBytes: compressedSize,
            downloadedSegments: totalSegments,
            totalSegments: totalSegments,
            speed: 0
          })

          if (resolve) resolve({ success: true, newSize: compressedSize })
        } else {
          logger.error('Downloader', `[CompressTask] 任务 ${taskId} 文件安全替换失败，已完整保留原文件`)
          this.sendProgress({
            id: taskId,
            status: 'completed',
            progress: 100,
            receivedBytes: currentSize,
            totalBytes: currentSize,
            downloadedSegments: totalSegments,
            totalSegments: totalSegments,
            speed: 0
          })
          if (resolve) resolve({ success: false, error: '文件替换失败（文件可能被其他程序占用），原视频已安全保留' })
        }
      } else {
        logger.warn('Downloader', `[CompressTask] 任务 ${taskId} 压缩未成功，保留原始文件`)
        try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
        
        this.sendProgress({
          id: taskId,
          status: 'completed',
          progress: 100,
          receivedBytes: currentSize,
          totalBytes: currentSize,
          downloadedSegments: totalSegments,
          totalSegments: totalSegments,
          speed: 0
        })

        if (resolve) resolve({ success: false, error: lastCompressError || '压缩未能完成' })
      }
    } catch (err: any) {
      logger.error('Downloader', `[CompressTask] 任务 ${taskId} 异常: ${err.message}`)
      try { if (fs.existsSync(tempCompressedPath)) fs.unlinkSync(tempCompressedPath) } catch {}
      this.sendProgress({
        id: taskId,
        status: 'completed',
        progress: 100,
        receivedBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        totalBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        downloadedSegments: totalSegments,
        totalSegments: totalSegments,
        speed: 0
      })
      if (resolve) resolve({ success: false, error: err.message })
    } finally {
      this.activeCompressTaskId = null
      this.activeCompressController = null
      this.activeCompressTempPath = null
      try {
        if (fs.existsSync(tempCompressedPath)) {
          fs.unlinkSync(tempCompressedPath)
        }
      } catch {}

      // 启动队列中的下一个压缩任务
      this.processNextCompressQueue()
    }
  }

  private processNextCompressQueue() {
    if (this.compressQueue.length > 0) {
      const nextItem = this.compressQueue.shift()!
      logger.info('Downloader', `[CompressQueue] 启动队列下一个压缩任务: ${nextItem.taskId}`)
      this.isCompressingActive = true
      this.activeCompressTaskId = nextItem.taskId
      this.executeCompressQueueItem(nextItem)
    } else {
      this.isCompressingActive = false
      this.activeCompressTaskId = null
      this.activeCompressController = null
      this.activeCompressTempPath = null
    }
  }

  private async getVideoDurationAndBitrate(filePath: string): Promise<{ duration: number; bitrate: number }> {
    return new Promise((resolve) => {
      const child = spawn('ffmpeg', ['-i', filePath])
      let stderr = ''
      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })
      child.on('close', () => {
        let duration = 0
        let bitrate = 0
        const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
        if (durationMatch) {
          const hours = parseFloat(durationMatch[1])
          const mins = parseFloat(durationMatch[2])
          const secs = parseFloat(durationMatch[3])
          duration = hours * 3600 + mins * 60 + secs
        }
        const bitrateMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/i)
        if (bitrateMatch) {
          bitrate = parseInt(bitrateMatch[1], 10) * 1000
        }
        resolve({ duration, bitrate })
      })
      child.on('error', () => {
        resolve({ duration: 0, bitrate: 0 })
      })
    })
  }

  private async executeFfmpegCompress(
    inputPath: string,
    outputPath: string,
    encoder: string,
    targetBitrateKbps: number,
    totalDuration: number,
    currentSize: number,
    taskId: string,
    abortController: AbortController
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const encArgs = getEncoderArgs(encoder as VideoEncoder, { mode: 'bitrate', bitrateKbps: targetBitrateKbps })
      const args = [
        '-y',
        '-progress', 'pipe:1',
        '-i', inputPath,
        ...encArgs,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath
      ]

      const proc = spawn('ffmpeg', args)
      const startTime = Date.now()
      let lastProgressTime = 0
      let stdoutBuffer = ''
      let stderrBuffer = ''

      proc.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        if (stderrBuffer.length > 5000) {
          stderrBuffer = stderrBuffer.substring(stderrBuffer.length - 5000)
        }
      })

      proc.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() || ''

        let outTimeUs: number | null = null
        let speedStr: string | null = null

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('out_time_us=')) {
            const val = parseInt(trimmed.substring(12), 10)
            if (!isNaN(val)) outTimeUs = val
          } else if (trimmed.startsWith('out_time=')) {
            const timeParts = trimmed.substring(9).split(':')
            if (timeParts.length === 3) {
              const h = parseFloat(timeParts[0]) || 0
              const m = parseFloat(timeParts[1]) || 0
              const s = parseFloat(timeParts[2]) || 0
              if (outTimeUs === null) {
                outTimeUs = Math.round((h * 3600 + m * 60 + s) * 1000000)
              }
            }
          } else if (trimmed.startsWith('speed=')) {
            const rawSpeed = trimmed.substring(6).trim().replace('x', '')
            if (rawSpeed && rawSpeed !== 'N/A') {
              speedStr = rawSpeed
            }
          }
        }

        const now = Date.now()
        if (now - lastProgressTime >= 200 && outTimeUs !== null && totalDuration > 0) {
          lastProgressTime = now
          const currentTimeSec = outTimeUs / 1000000
          const progressPercent = Math.min(99, Math.max(0, Math.round((currentTimeSec / totalDuration) * 100)))

          let speedMultiplier = speedStr ? parseFloat(speedStr) : 0
          if (isNaN(speedMultiplier) || speedMultiplier <= 0) {
            const elapsedWallSec = (now - startTime) / 1000
            if (elapsedWallSec > 0.5 && currentTimeSec > 0) {
              speedMultiplier = currentTimeSec / elapsedWallSec
            }
          }

          let remainingSeconds: number | undefined
          if (speedMultiplier > 0) {
            remainingSeconds = Math.max(0, Math.round((totalDuration - currentTimeSec) / speedMultiplier))
          }

          const speedFormatted = speedMultiplier > 0 ? `${speedMultiplier.toFixed(1)}x` : ''

          this.sendProgress({
            id: taskId,
            status: 'compressing',
            progress: progressPercent,
            receivedBytes: Math.round((currentSize * progressPercent) / 100),
            totalBytes: currentSize,
            speedText: speedFormatted,
            etaSeconds: remainingSeconds,
            speed: 0
          })
        }
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          try {
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath)
            }
          } catch {}
          const errorLines = stderrBuffer.trim().split('\n').filter(l => l.trim().length > 0)
          const lastError = errorLines.slice(-3).join('\n') || `FFmpeg 退出码: ${code}`
          resolve({ success: false, error: lastError })
        } else {
          resolve({ success: true })
        }
      })

      proc.on('error', (err) => {
        logger.error('Downloader', `[VideoCompress] FFmpeg 启动失败: ${err.message}`)
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath)
          }
        } catch {}
        resolve({ success: false, error: `FFmpeg 启动失败: ${err.message}` })
      })

      const abortHandler = () => {
        try { proc.kill('SIGKILL') } catch {}
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath)
          }
        } catch {}
        resolve({ success: false, error: '压缩已取消' })
      }
      abortController.signal.addEventListener('abort', abortHandler, { once: true })
    })
  }
}

export const downloader = new Downloader()
