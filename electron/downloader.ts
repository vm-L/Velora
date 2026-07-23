import { net } from 'electron'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'

import path from 'path'
import { Readable } from 'stream'
import { storeManager } from './store'
import { logger } from './logger'

export interface DownloadCommand {
  id: string
  url: string
  savePath: string
  startBytes: number
  downloadedSegments?: number
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
    let subPlaylistUrl = ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const nextLine = lines[i + 1]?.trim()
        if (nextLine && !nextLine.startsWith('#')) {
          subPlaylistUrl = resolveUrl(playlistUrl, nextLine)
          break
        }
      }
    }
    if (subPlaylistUrl) {
      logger.info('Downloader', `[M3U8Parser] 发现 Master Playlist，转向二级子列表: ${subPlaylistUrl}`)
      return parseM3U8(subPlaylistUrl, originHeaders)
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

class Downloader {
  private activeDownloads: Map<string, { abortController: AbortController }> = new Map()
  private pendingQueue: DownloadCommand[] = []
  private mainWindow: any = null

  setWindow(window: any) {
    this.mainWindow = window
    logger.info('Downloader', `[Downloader] MainWindow 已成功绑定和初始化。`)
  }

  async startDownload(cmd: DownloadCommand) {
    logger.info('Downloader', `[Downloader] startDownload ID: ${cmd.id}, URL: ${cmd.url}, savePath: ${cmd.savePath}, startBytes: ${cmd.startBytes}`)

    if (this.activeDownloads.has(cmd.id) || this.pendingQueue.some(c => c.id === cmd.id)) {
      logger.info('Downloader', `[Downloader] 任务 ID ${cmd.id} 已在队列或下载中，跳过重复添加。`)
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

  private async runTask(cmd: DownloadCommand) {
    const abortController = new AbortController()
    this.activeDownloads.set(cmd.id, { abortController })
    this.sendProgress({ id: cmd.id, status: 'resolving', speed: 0 })

    try {
      const isM3U8 = cmd.url.toLowerCase().includes('.m3u8')
      if (isM3U8) {
        await this.downloadM3U8Task(cmd, abortController)
      } else {
        await this.downloadDirectFileTask(cmd, abortController)
      }
    } catch (err: any) {
      logger.error('Downloader', `[Downloader] 任务 ${cmd.id} 执行异常: ${err.message}`)
      if (err.name === 'AbortError') {
        this.sendProgress({ id: cmd.id, status: 'paused' })
      } else {
        this.sendProgress({ id: cmd.id, status: 'error', errorMsg: err.message })
      }
    } finally {
      this.activeDownloads.delete(cmd.id)
      this.checkQueue()
    }
  }

  /**
   * M3U8 断点续传、多分片并发下载、内存缓冲池 (Memory Buffer Flush) 顺序追加合并
   */
  private async downloadM3U8Task(cmd: DownloadCommand, abortController: AbortController) {
    const { id, url, savePath } = cmd
    logger.info('Downloader', `[M3U8Downloader] 开始解析并下载 M3U8 资源: ${url}`)

    let maxMemoryMB = 128
    try {
      maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 128
    } catch {
      maxMemoryMB = 128
    }
    const maxMemoryBytes = maxMemoryMB * 1024 * 1024

    let origin = ''
    try {
      origin = new URL(url).origin
    } catch {}
    const headers = {
      'Referer': origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    const segments = await parseM3U8(url, headers)
    if (segments.length === 0) {
      throw new Error('M3U8 列表中未解析到任何可下载的分片视频')
    }
    logger.info('Downloader', `[M3U8Downloader] 成功解析出 ${segments.length} 个 TS 视频分片`)

    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const isTargetMp4 = savePath.toLowerCase().endsWith('.mp4')
    const finalSavePath = savePath
    const workSavePath = isTargetMp4 ? savePath + '.temp.ts' : savePath

    // 检查断点续传：目标文件是否已存在及大小
    let existingBytes = 0
    let skipSegments = 0
    let fileFlags = 'w'

    if (fs.existsSync(workSavePath)) {
      try {
        const stat = fs.statSync(workSavePath)
        existingBytes = stat.size
        if (existingBytes > 0) {
          if (cmd.downloadedSegments !== undefined && cmd.downloadedSegments > 0) {
            skipSegments = cmd.downloadedSegments;
            fileFlags = 'a';
            logger.info('Downloader', `[M3U8Downloader] 触发断点续传(精准): 跳过前 ${skipSegments}/${segments.length} 个分片`);
          } else {
            const testRes = await net.fetch(segments[0].url, { headers, signal: abortController.signal as any })
            if (testRes.ok) {
              let buf = Buffer.from(await testRes.arrayBuffer())
              if (segments[0].key && segments[0].key.method === 'AES-128') {
                try {
                   // dummy decrypt to get size
                } catch(e) {}
              }
              const avgSize = Math.max(1024, buf.byteLength)
              skipSegments = Math.min(segments.length - 1, Math.floor(existingBytes / avgSize))
              if (skipSegments > 0) {
                fileFlags = 'a'
                existingBytes = skipSegments * avgSize
                logger.info('Downloader', `[M3U8Downloader] 触发断点续传(估算): 已落盘 ${existingBytes} 字节，跳过前 ${skipSegments}/${segments.length} 个分片`)
              }
            }
          }
        }
      } catch (e: any) {
        logger.info('Downloader', `[M3U8Downloader] 检查续传状态失败: ${e.message}`)
      }
    }

    const fd = fs.openSync(workSavePath, fileFlags)
    const keyCache = new Map<string, Buffer>()
    const bufferMap = new Map<number, Buffer>()
    let currentBufferedBytes = 0
    let nextFlushIndex = skipSegments
    let downloadedCount = skipSegments
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
            downloadedCount++
            totalReceivedBytes += buf.length

            if (currentBufferedBytes >= maxMemoryBytes) {
              flushMemoryToDisk(false)
            }

            const now = Date.now()
            if (now - lastReportTime > 400 || downloadedCount === segments.length) {
              const speed = ((totalReceivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
              this.sendProgress({
                id,
                totalBytes: 0,
                receivedBytes: totalReceivedBytes,
                downloadedSegments: downloadedCount,
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
            if (attempts >= 3) {
              logger.info('Downloader', `[M3U8Downloader] 分片 ${seg.index} 重试失败: ${e.message}`)
              throw new Error(`分片 ${seg.index} 下载失败`)
            }
            await new Promise(r => setTimeout(r, 500 * attempts))
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
        logger.info('Downloader', `[M3U8Downloader] 准备将 TS 封装为 MP4: ${workSavePath} -> ${finalSavePath}`)
        this.sendProgress({ id, totalBytes: totalReceivedBytes, receivedBytes: totalReceivedBytes, status: 'processing', speed: 0 })
        
        await new Promise<void>((resolve, reject) => {
          const ffmpegBin = 'ffmpeg'
          const child = spawn(ffmpegBin, ['-y', '-i', workSavePath, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', finalSavePath])
          
          child.on('close', (code) => {
            if (code === 0) {
              try { fs.unlinkSync(workSavePath) } catch {}
              resolve()
            } else {
              reject(new Error(`FFmpeg exited with code ${code}`))
            }
          })
          child.on('error', reject)
          
          abortController.signal.addEventListener('abort', () => {
            child.kill('SIGKILL')
            reject(new DOMException('User aborted download', 'AbortError'))
          })
        })
      }

      logger.info('Downloader', `[M3U8Downloader] 任务 ${id} 全部 ${segments.length} 个分片断点续传/下载合并并封装成功。`)
      this.sendProgress({
        id,
        totalBytes: totalReceivedBytes,
        receivedBytes: totalReceivedBytes,
        downloadedSegments: segments.length,
        totalSegments: segments.length,
        status: 'completed',
        speed: 0
      })
    } catch (err) {
      try {
        fs.closeSync(fd)
      } catch {}
      throw err
    }
  }

  /**
   * 通用视频 (MP4 / AVI 等) 的断点续传、HTTP Range 分块多线程加速与内存缓冲
   */
  private async downloadDirectFileTask(cmd: DownloadCommand, abortController: AbortController) {
    const { id, url, savePath } = cmd

    let diskSize = 0;
    if (fs.existsSync(savePath)) {
      try {
        diskSize = fs.statSync(savePath).size;
      } catch {}
    }
    let startBytes = Math.max(cmd.startBytes || 0, diskSize);

    const chunkSize = 4 * 1024 * 1024 // 4MB
    // Align startBytes to chunk boundary
    if (startBytes > 0) {
      const downloadedChunksInitial = Math.floor(startBytes / chunkSize);
      startBytes = downloadedChunksInitial * chunkSize;
      
      if (diskSize > startBytes) {
         logger.info('Downloader', `[DirectDownloader] 将文件从 ${diskSize} 截断对齐到块边界 ${startBytes}`);
         try { fs.truncateSync(savePath, startBytes); } catch {}
      }
    }

    logger.info('Downloader', `[DirectDownloader] 开始单文件流式/多线程分块下载: ${url}, startBytes: ${startBytes}`)

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

    let origin = ''
    try {
      origin = new URL(url).origin
    } catch {}

    const headers: any = {
      'Referer': origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    // 1. 探测 Range 断点续传支持
    let isRangeSupported = false
    let totalBytes = 0

    try {
      const checkRes = await net.fetch(url, {
        headers: { ...headers, 'Range': `bytes=${startBytes}-${startBytes + 1}` },
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

    // 2. 若支持 Range 且剩余大于 2MB，支持断点续传 Range 8 线程并发加速
    const remainingBytes = totalBytes > startBytes ? totalBytes - startBytes : 0

    if (isRangeSupported && remainingBytes > 2 * 1024 * 1024) {
      logger.info('Downloader', `[DirectDownloader] 支持 Range 断点续传。从 ${startBytes} 字节起开辟 8 线程加速下载，剩余: ${remainingBytes} bytes`)
      const chunksCount = Math.ceil(remainingBytes / chunkSize)
      const chunks: Array<{ index: number; start: number; end: number }> = []
      
      for (let i = 0; i < chunksCount; i++) {
        const start = startBytes + i * chunkSize
        const end = Math.min(totalBytes - 1, startBytes + (i + 1) * chunkSize - 1)
        chunks.push({ index: i, start, end })
      }
      
      const fileFlags = startBytes > 0 ? 'a' : 'w';
      const fd = fs.openSync(savePath, fileFlags)
      const bufferMap = new Map<number, Buffer>()
      let currentBufferedBytes = 0
      let nextFlushIndex = 0
      let downloadedChunks = 0
      let totalReceivedBytes = startBytes

      let lastReportTime = Date.now()
      let lastReportBytes = totalReceivedBytes

      const flushMemoryToDisk = (forceAll = false) => {
        while (bufferMap.has(nextFlushIndex)) {
          const chunkBuf = bufferMap.get(nextFlushIndex)!
          fs.writeSync(fd, chunkBuf)
          currentBufferedBytes -= chunkBuf.length
          bufferMap.delete(nextFlushIndex)
          nextFlushIndex++
        }
        if (forceAll || currentBufferedBytes >= maxMemoryBytes) {
          logger.info('Downloader', `[MemoryBuffer] 单文件分块内存达到限制 (${(currentBufferedBytes / 1024 / 1024).toFixed(2)} MB)，批量写盘清内存。`)
        }
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
              const buf = Buffer.from(await chunkRes.arrayBuffer())

              bufferMap.set(chunkItem.index, buf)
              currentBufferedBytes += buf.length
              downloadedChunks++
              totalReceivedBytes += buf.length

              if (currentBufferedBytes >= maxMemoryBytes) {
                flushMemoryToDisk(false)
              }

              const now = Date.now()
              if (now - lastReportTime > 400 || downloadedChunks === chunks.length) {
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

              success = true
            } catch (err: any) {
              attempts++
              if (err.name === 'AbortError') throw err
              if (attempts >= 3) {
                throw new Error(`分块 ${chunkItem.index} 下载失败`)
              }
              await new Promise(r => setTimeout(r, 500 * attempts))
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

        logger.info('Downloader', `[DirectDownloader] 单文件 Range 8 线程断点续传完成: ${savePath}`)
        this.sendProgress({
          id,
          totalBytes,
          receivedBytes: totalBytes,
          status: 'completed',
          speed: 0
        })
        return
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

    this.sendProgress({
      id,
      receivedBytes,
      totalBytes: finalTotalBytes,
      status: 'completed',
      speed: 0
    })
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
    const queueIndex = this.pendingQueue.findIndex(c => c.id === id)
    if (queueIndex !== -1) {
      this.pendingQueue.splice(queueIndex, 1)
      this.sendProgress({ id, status: 'paused' })
      this.checkQueue()
      return
    }

    if (this.activeDownloads.has(id)) {
      const entry = this.activeDownloads.get(id)!
      entry.abortController.abort()
      this.activeDownloads.delete(id)
    }
  }

  cancelDownload(id: string) {
    this.pauseDownload(id)
  }
}

export const downloader = new Downloader()
