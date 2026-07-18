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

class Downloader {
  private activeDownloads: Map<string, { abortController: AbortController, stream: fs.WriteStream | null }> = new Map()
  private pendingQueue: DownloadCommand[] = []
  private mainWindow: any = null

  setWindow(window: any) {
    this.mainWindow = window
    logToFile(`[Downloader] MainWindow initialized and set.`)
  }

  async startDownload(cmd: DownloadCommand) {
    logToFile(`[Downloader] startDownload entering for ID: ${cmd.id}, URL: ${cmd.url}, savePath: ${cmd.savePath}, startBytes: ${cmd.startBytes}`)

    // Avoid duplicate task in queue or downloading
    if (this.activeDownloads.has(cmd.id)) {
      logToFile(`[Downloader] startDownload rejected: ID ${cmd.id} is already in activeDownloads.`)
      return
    }
    if (this.pendingQueue.some(c => c.id === cmd.id)) {
      logToFile(`[Downloader] startDownload rejected: ID ${cmd.id} is already in pendingQueue.`)
      return
    }

    logToFile(`[Downloader] Fetching maxConcurrentDownloads setting from storeManager...`)
    let maxConcurrent = 3
    try {
      maxConcurrent = (await storeManager.getSetting('maxConcurrentDownloads')) || 3
      logToFile(`[Downloader] Retrieved maxConcurrentDownloads: ${maxConcurrent}`)
    } catch (storeErr: any) {
      logToFile(`[Downloader] WARNING: Failed to get maxConcurrentDownloads setting (possibly store pending): ${storeErr.message}. Fallback to 3.`)
    }

    logToFile(`[Downloader] Current active downloads size: ${this.activeDownloads.size}`)
    if (this.activeDownloads.size < maxConcurrent) {
      logToFile(`[Downloader] Slot available. Starting runDownloadTaskWithRetry for ID: ${cmd.id}`)
      this.runDownloadTaskWithRetry(cmd)
    } else {
      logToFile(`[Downloader] Slots full (active: ${this.activeDownloads.size}/${maxConcurrent}). Pushing ID: ${cmd.id} to pendingQueue.`)
      this.pendingQueue.push(cmd)
      if (this.mainWindow) {
        this.mainWindow.webContents.send('download-progress', {
          id: cmd.id,
          totalBytes: 0,
          receivedBytes: 0,
          status: 'waiting',
          speed: 0
        })
      }
    }
  }

  private async runDownloadTaskWithRetry(cmd: DownloadCommand) {
    const maxRetries = 3
    let attempt = 0
    let currentStartBytes = cmd.startBytes

    logToFile(`[Downloader] [RetryLoop] Starting retry loop for ID: ${cmd.id}, maxRetries: ${maxRetries}`)

    while (attempt < maxRetries) {
      // If task has been removed from active slots (paused/canceled), stop retrying
      if (attempt > 0 && !this.activeDownloads.has(cmd.id)) {
        logToFile(`[Downloader] [RetryLoop] Task ${cmd.id} is no longer in activeDownloads (aborted by user). Stopping retry loop.`)
        break
      }

      logToFile(`[Downloader] [RetryLoop] Attempt ${attempt + 1}/${maxRetries} starting for ID: ${cmd.id}. startBytes: ${currentStartBytes}`)

      try {
        await this.executeDownload(cmd, currentStartBytes)
        logToFile(`[Downloader] [RetryLoop] executeDownload finished successfully for ID: ${cmd.id}. Breaking retry loop.`)
        break 
      } catch (err: any) {
        logToFile(`[Downloader] [RetryLoop] executeDownload threw error for ID: ${cmd.id} on attempt ${attempt + 1}: ${err.message}`)
        
        // If aborted by user, break retry loop immediately
        if (err.name === 'AbortError' || !this.activeDownloads.has(cmd.id)) {
          logToFile(`[Downloader] [RetryLoop] Detected AbortError or slot removal for ID: ${cmd.id}. Terminating retries.`)
          break
        }

        attempt++
        if (attempt >= maxRetries) {
          logToFile(`[Downloader] [RetryLoop] Exceeded max retries (${maxRetries}) for ID: ${cmd.id}. Marking as error.`)
          this.activeDownloads.delete(cmd.id)
          if (this.mainWindow) {
            this.mainWindow.webContents.send('download-progress', {
              id: cmd.id,
              status: 'error',
              errorMsg: err.message || '网络连接超时，请重试'
            })
          }
          break
        }

        const backoffTime = 1000 * Math.pow(2, attempt - 1)
        logToFile(`[Downloader] [RetryLoop] Waiting ${backoffTime}ms before next retry attempt for ID: ${cmd.id}...`)
        await new Promise((resolve) => setTimeout(resolve, backoffTime))

        // Read current local file size to perform range resume
        if (fs.existsSync(cmd.savePath)) {
          try {
            const stats = fs.statSync(cmd.savePath)
            currentStartBytes = stats.size
            logToFile(`[Downloader] [RetryLoop] Found partial file on disk. Size: ${currentStartBytes} bytes. Updating range offset.`)
          } catch (statErr: any) {
            logToFile(`[Downloader] [RetryLoop] Failed to stat file: ${statErr.message}. Resetting offset to 0.`)
            currentStartBytes = 0
          }
        } else {
          logToFile(`[Downloader] [RetryLoop] Local file does not exist. Resetting offset to 0.`)
          currentStartBytes = 0
        }
      }
    }

    logToFile(`[Downloader] [RetryLoop] Exit retry loop for ID: ${cmd.id}. Cleaning up slot.`)
    this.activeDownloads.delete(cmd.id)
    this.checkQueue()
  }

  private async executeDownload(cmd: DownloadCommand, startBytes: number) {
    const { id, url, savePath } = cmd
    const abortController = new AbortController()

    logToFile(`[Downloader] [Execute] executeDownload invoked for ID: ${id}, startBytes: ${startBytes}`)

    // Register active slot immediately before async calls
    this.activeDownloads.set(id, { abortController, stream: null })

    // Ensure directory exists
    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      logToFile(`[Downloader] [Execute] Creating directory: ${dir}`)
      fs.mkdirSync(dir, { recursive: true })
    }

    let fileStream: fs.WriteStream | null = null

    try {
      // Generate Referer based on resource URL Origin to bypass anti-hotlinking
      let origin = ''
      try {
        const urlObj = new URL(url)
        origin = urlObj.origin
      } catch (urlErr: any) {
        logToFile(`[Downloader] [Execute] Failed to parse URL origin: ${urlErr.message}`)
      }

      const headers: any = {
        'Referer': origin,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }

      if (startBytes > 0) {
        headers['Range'] = `bytes=${startBytes}-`
      }

      logToFile(`[Downloader] [Execute] Initiating net.fetch request to ${url} with headers: ${JSON.stringify(headers)}`)
      const response = await net.fetch(url, { 
        headers, 
        signal: abortController.signal as any 
      })

      logToFile(`[Downloader] [Execute] net.fetch response received. Status: ${response.status} ${response.statusText}`)
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const contentLength = response.headers.get('content-length')
      const totalBytes = contentLength ? parseInt(contentLength, 10) + startBytes : 0
      logToFile(`[Downloader] [Execute] Content-Length header: ${contentLength}. Resolved totalBytes: ${totalBytes}`)

      let flags = 'a'
      let actualStartBytes = startBytes
      if (startBytes > 0 && response.status === 200) {
        logToFile(`[Downloader] [Execute] WARNING: Server returned 200 instead of 206. Range not supported. Overwriting file.`)
        flags = 'w'
        actualStartBytes = 0
      }

      logToFile(`[Downloader] [Execute] Creating write stream with flags: "${flags}"`)
      fileStream = fs.createWriteStream(savePath, { flags })
      
      // Update slots with current active file stream
      if (this.activeDownloads.has(id)) {
        this.activeDownloads.set(id, { abortController, stream: fileStream })
      } else {
        logToFile(`[Downloader] [Execute] Task ${id} was aborted while net.fetch was establishing. Terminating stream.`)
        fileStream.end()
        return
      }

      logToFile(`[Downloader] [Execute] Sending progress "downloading" event to renderer. totalBytes: ${totalBytes}, receivedBytes: ${actualStartBytes}`)
      if (this.mainWindow) {
        this.mainWindow.webContents.send('download-progress', {
          id,
          totalBytes,
          receivedBytes: actualStartBytes,
          status: 'downloading'
        })
      }

      if (response.body) {
        logToFile(`[Downloader] [Execute] WebStream response.body found. Converting to Node Readable stream...`)
        const nodeStream = Readable.fromWeb(response.body as any)
        
        let receivedBytes = actualStartBytes
        let lastReportTime = Date.now()
        let lastReportBytes = receivedBytes
        let chunkCount = 0

        // Track data events to update progress & speed
        nodeStream.on('data', (chunk: Buffer) => {
          chunkCount++
          receivedBytes += chunk.length

          const now = Date.now()
          if (now - lastReportTime > 500) {
            const speed = ((receivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
            if (chunkCount % 5 === 0) { // Limit log verbosity
              logToFile(`[Downloader] [Execute] Pipe writing ID: ${id}, received: ${receivedBytes}/${totalBytes} bytes, speed: ${(speed / 1024).toFixed(2)} KB/s`)
            }
            if (this.mainWindow) {
              this.mainWindow.webContents.send('download-progress', {
                id,
                receivedBytes,
                totalBytes,
                speed,
                status: 'downloading'
              })
            }
            lastReportTime = now
            lastReportBytes = receivedBytes
          }
        })

        logToFile(`[Downloader] [Execute] Piping nodeStream to fileStream...`)
        // Wrap stream piping in a promise to control async flow correctly
        await new Promise<void>((resolve, reject) => {
          nodeStream.pipe(fileStream!)

          fileStream!.on('finish', () => {
            logToFile(`[Downloader] [Execute] fileStream "finish" event triggered.`)
            resolve()
          })

          nodeStream.on('error', (err) => {
            logToFile(`[Downloader] [Execute] nodeStream error: ${err.message}`)
            reject(err)
          })

          fileStream!.on('error', (err) => {
            logToFile(`[Downloader] [Execute] fileStream error: ${err.message}`)
            reject(err)
          })

          abortController.signal.addEventListener('abort', () => {
            logToFile(`[Downloader] [Execute] abortController triggered inside Promise.`)
            reject(new DOMException('The user aborted a request.', 'AbortError'))
          })
        })

        logToFile(`[Downloader] [Execute] Stream pipe promise resolved. receivedBytes total: ${receivedBytes}. Sending "completed" event...`)
        if (this.mainWindow) {
          this.mainWindow.webContents.send('download-progress', {
            id,
            receivedBytes,
            totalBytes,
            status: 'completed',
            speed: 0
          })
        }
      } else {
        throw new Error("No response body")
      }
    } catch (err: any) {
      logToFile(`[Downloader] [Execute] Exception caught in executeDownload for ID: ${id}: ${err.message}`)
      if (fileStream) {
        fileStream.end()
      }
      
      if (err.name === 'AbortError') {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('download-progress', { id, status: 'paused' })
        }
      }
      throw err // Re-throw to retry loop
    }
  }

  private async checkQueue() {
    logToFile(`[Downloader] checkQueue invoked. activeDownloads size: ${this.activeDownloads.size}, pendingQueue length: ${this.pendingQueue.length}`)
    
    let maxConcurrent = 3
    try {
      maxConcurrent = (await storeManager.getSetting('maxConcurrentDownloads')) || 3
    } catch (err: any) {
      logToFile(`[Downloader] checkQueue warning: Failed to get maxConcurrentDownloads from store: ${err.message}. Defaulting to 3.`)
    }

    while (this.activeDownloads.size < maxConcurrent && this.pendingQueue.length > 0) {
      const nextCmd = this.pendingQueue.shift()!
      logToFile(`[Downloader] checkQueue pulling next task: ID ${nextCmd.id} from pendingQueue.`)
      this.runDownloadTaskWithRetry(nextCmd)
    }
  }

  pauseDownload(id: string) {
    logToFile(`[Downloader] pauseDownload request received for ID: ${id}`)
    
    // Check pending queue
    const queueIndex = this.pendingQueue.findIndex(c => c.id === id)
    if (queueIndex !== -1) {
      logToFile(`[Downloader] pauseDownload: Found ID ${id} in pendingQueue. Removing and sending "paused" event.`)
      this.pendingQueue.splice(queueIndex, 1)
      if (this.mainWindow) {
        this.mainWindow.webContents.send('download-progress', { id, status: 'paused' })
      }
      this.checkQueue()
      return
    }

    // Check active slots
    if (this.activeDownloads.has(id)) {
      logToFile(`[Downloader] pauseDownload: Found ID ${id} in activeDownloads. Triggering abort signal.`)
      const entry = this.activeDownloads.get(id)!
      entry.abortController.abort()
      if (entry.stream) {
        entry.stream.end()
      }
      this.activeDownloads.delete(id)
    } else {
      logToFile(`[Downloader] pauseDownload warning: ID ${id} not found in active downloads or pending queue.`)
    }
  }

  cancelDownload(id: string) {
    logToFile(`[Downloader] cancelDownload request received for ID: ${id}`)
    this.pauseDownload(id)
  }
}

export const downloader = new Downloader()
