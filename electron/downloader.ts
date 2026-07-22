import { net } from 'electron'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { storeManager } from './store'

export interface DownloadCommand {
  id: string
  url: string
  savePath: string
  startBytes: number
}

export interface M3U8Segment {
  index: number
  url: string
  duration: number
}

export function logToFile(message: string) {
  const logPath = path.join(process.cwd(), 'app.log')
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message}\n`
  try {
    fs.appendFileSync(logPath, logLine, 'utf8')
  } catch (err) {
    console.error('Failed to write log to file:', err)
  }
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
      logToFile(`[M3U8Parser] 发现 Master Playlist，转向二级子列表: ${subPlaylistUrl}`)
      return parseM3U8(subPlaylistUrl, originHeaders)
    }
  }

  // 解析分片
  const lines = text.split('\n')
  const segments: M3U8Segment[] = []
  let currentDuration = 0
  let index = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('#EXTINF:')) {
      const durMatch = line.match(/#EXTINF:([\d\.]+)/)
      if (durMatch) {
        currentDuration = parseFloat(durMatch[1])
      }
    } else if (line && !line.startsWith('#')) {
      const segUrl = resolveUrl(playlistUrl, line)
      segments.push({
        index: index++,
        url: segUrl,
        duration: currentDuration
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
    logToFile(`[Downloader] MainWindow 已成功绑定和初始化。`)
  }

  async startDownload(cmd: DownloadCommand) {
    logToFile(`[Downloader] startDownload ID: ${cmd.id}, URL: ${cmd.url}, savePath: ${cmd.savePath}`)

    if (this.activeDownloads.has(cmd.id) || this.pendingQueue.some(c => c.id === cmd.id)) {
      logToFile(`[Downloader] 任务 ID ${cmd.id} 已在队列或下载中，跳过重复添加。`)
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
        receivedBytes: 0,
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

    try {
      const isM3U8 = cmd.url.toLowerCase().includes('.m3u8')
      if (isM3U8) {
        await this.downloadM3U8Task(cmd, abortController)
      } else {
        await this.downloadDirectFileTask(cmd, abortController)
      }
    } catch (err: any) {
      logToFile(`[Downloader] 任务 ${cmd.id} 执行异常: ${err.message}`)
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
   * M3U8 多分片并发下载、内存缓冲池 (Memory Buffer Flush) 保护磁盘、按序合并处理
   */
  private async downloadM3U8Task(cmd: DownloadCommand, abortController: AbortController) {
    const { id, url, savePath } = cmd
    logToFile(`[M3U8Downloader] 开始解析并下载 M3U8 资源: ${url}`)

    // 1. 读取最大内存限制设置 (默认为 1024MB = 1GB)
    let maxMemoryMB = 1024
    try {
      maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 1024
    } catch {
      maxMemoryMB = 1024
    }
    const maxMemoryBytes = maxMemoryMB * 1024 * 1024

    // 2. 准备请求 Headers
    let origin = ''
    try {
      origin = new URL(url).origin
    } catch {}
    const headers = {
      'Referer': origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    // 3. 解析分片
    const segments = await parseM3U8(url, headers)
    if (segments.length === 0) {
      throw new Error('M3U8 列表中未解析到任何可下载的分片视频')
    }
    logToFile(`[M3U8Downloader] 成功解析出 ${segments.length} 个 TS 视频分片`)

    // 保证保存目录存在
    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // 4. 建立物理合并流及内存缓冲池
    const fd = fs.openSync(savePath, 'w')
    const bufferMap = new Map<number, Buffer>()
    let currentBufferedBytes = 0
    let nextFlushIndex = 0
    let downloadedCount = 0
    let totalReceivedBytes = 0

    let lastReportTime = Date.now()
    let lastReportBytes = 0

    // 内存落盘刷新函数
    const flushMemoryToDisk = (forceAll: boolean = false) => {
      while (bufferMap.has(nextFlushIndex)) {
        const chunkBuf = bufferMap.get(nextFlushIndex)!
        fs.writeSync(fd, chunkBuf)
        currentBufferedBytes -= chunkBuf.length
        bufferMap.delete(nextFlushIndex)
        nextFlushIndex++
      }

      // 如果内存超过设定上限，或者强制刷新
      if (forceAll || currentBufferedBytes >= maxMemoryBytes) {
        logToFile(`[MemoryBuffer] 内存缓冲达到限制/完成 (${(currentBufferedBytes / 1024 / 1024).toFixed(2)} MB)，执行批量写盘，清理内存。`)
      }
    }

    // 分段并发池逻辑 (并发数: 6)
    const concurrency = 6
    let segQueueIndex = 0

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
            const buf = Buffer.from(await res.arrayBuffer())

            // 写入内存缓冲池
            bufferMap.set(seg.index, buf)
            currentBufferedBytes += buf.length
            downloadedCount++
            totalReceivedBytes += buf.length

            // 如果暂存的内存超过设置的限制（如 1GB），顺序落盘并释放内存
            if (currentBufferedBytes >= maxMemoryBytes) {
              flushMemoryToDisk(false)
            }

            // 汇报进度
            const now = Date.now()
            if (now - lastReportTime > 400 || downloadedCount === segments.length) {
              const speed = ((totalReceivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
              this.sendProgress({
                id,
                totalBytes: 0, // M3U8 使用分片和实际字节动态更新
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
              logToFile(`[M3U8Downloader] 分片 ${seg.index} 重试失败: ${e.message}`)
              throw new Error(`分片 ${seg.index} 下载失败`)
            }
            await new Promise(r => setTimeout(r, 500 * attempts))
          }
        }
      }
    }

    // 启动并发并发工作池
    const workers: Promise<void>[] = []
    for (let c = 0; c < concurrency; c++) {
      workers.push(fetchNextSegment())
    }

    try {
      await Promise.all(workers)
      // 强制刷入所有未落盘的内存 Buffer
      flushMemoryToDisk(true)
      fs.closeSync(fd)

      logToFile(`[M3U8Downloader] 任务 ${id} 全部 ${segments.length} 个分片下载并合并完成。文件已落盘。`)
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
   * 通用视频 (MP4 / AVI 等) 的流式下载与内存缓冲策略
   */
  private async downloadDirectFileTask(cmd: DownloadCommand, abortController: AbortController) {
    const { id, url, savePath, startBytes } = cmd
    logToFile(`[DirectDownloader] 开始单文件流式下载: ${url}, startBytes: ${startBytes}`)

    let maxMemoryMB = 1024
    try {
      maxMemoryMB = (await storeManager.getSetting('maxMemoryBufferMB')) || 1024
    } catch {
      maxMemoryMB = 1024
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

    if (startBytes > 0) {
      headers['Range'] = `bytes=${startBytes}-`
    }

    const response = await net.fetch(url, { headers, signal: abortController.signal as any })
    if (!response.ok && response.status !== 206) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const contentLength = response.headers.get('content-length')
    const totalBytes = contentLength ? parseInt(contentLength, 10) + startBytes : 0

    let flags = 'a'
    let actualStart = startBytes
    if (startBytes > 0 && response.status === 200) {
      flags = 'w'
      actualStart = 0
    }

    const fileStream = fs.createWriteStream(savePath, { flags })

    this.sendProgress({
      id,
      totalBytes,
      receivedBytes: actualStart,
      status: 'downloading'
    })

    if (!response.body) throw new Error('No response body')

    const nodeStream = Readable.fromWeb(response.body as any)
    let receivedBytes = actualStart
    let lastReportTime = Date.now()
    let lastReportBytes = receivedBytes

    // 内存缓冲
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

      // 超过内存上限时落盘
      if (memoryChunkBytes >= maxMemoryBytes) {
        flushStreamBuffer()
      }

      const now = Date.now()
      if (now - lastReportTime > 500) {
        const speed = ((receivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
        this.sendProgress({
          id,
          receivedBytes,
          totalBytes,
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
      totalBytes,
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
