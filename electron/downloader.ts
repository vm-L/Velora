import { net } from 'electron'
import fs from 'fs'
import path from 'path'

export interface DownloadCommand {
  id: string
  url: string
  savePath: string
  startBytes: number
}

class Downloader {
  private activeDownloads: Map<string, { abortController: AbortController, stream: fs.WriteStream }> = new Map()
  private mainWindow: any = null

  setWindow(window: any) {
    this.mainWindow = window
  }

  async startDownload(cmd: DownloadCommand) {
    const { id, url, savePath, startBytes } = cmd
    
    // Ensure directory exists
    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const abortController = new AbortController()
    
    try {
      const headers: any = { 'Referer': '' }
      if (startBytes > 0) {
        headers['Range'] = `bytes=${startBytes}-`
      }

      const response = await net.fetch(url, { 
        headers, 
        signal: abortController.signal as any 
      })

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Check content length to get total bytes
      const contentLength = response.headers.get('content-length')
      const totalBytes = contentLength ? parseInt(contentLength, 10) + startBytes : 0

      // If range request is not supported, server might return 200 with full file. 
      // We must check if startBytes > 0 and status is 200, which means range not supported.
      let flags = 'a'
      let actualStartBytes = startBytes
      if (startBytes > 0 && response.status === 200) {
        flags = 'w'
        actualStartBytes = 0 // Server didn't respect range, start from scratch
      }

      const fileStream = fs.createWriteStream(savePath, { flags })
      this.activeDownloads.set(id, { abortController, stream: fileStream })

      if (this.mainWindow) {
        this.mainWindow.webContents.send('download-progress', {
          id,
          totalBytes,
          receivedBytes: actualStartBytes,
          status: 'downloading'
        })
      }

      if (response.body) {
        let receivedBytes = actualStartBytes
        let lastReportTime = Date.now()
        let lastReportBytes = receivedBytes

        const reader = response.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            fileStream.write(Buffer.from(value))
            receivedBytes += value.length

            const now = Date.now()
            if (now - lastReportTime > 500) { // report every 500ms
              const speed = ((receivedBytes - lastReportBytes) / (now - lastReportTime)) * 1000
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
          }
        }
        
        fileStream.end()
        this.activeDownloads.delete(id)
        if (this.mainWindow) {
          this.mainWindow.webContents.send('download-progress', { id, receivedBytes, totalBytes, status: 'completed' })
        }
      } else {
        throw new Error("No response body")
      }
    } catch (err: any) {
      if (this.activeDownloads.has(id)) {
        const entry = this.activeDownloads.get(id)!
        entry.stream.end()
        this.activeDownloads.delete(id)
      }
      
      if (err.name === 'AbortError') {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('download-progress', { id, status: 'paused' })
        }
      } else {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('download-progress', { id, status: 'error', errorMsg: err.message })
        }
      }
    }
  }

  pauseDownload(id: string) {
    if (this.activeDownloads.has(id)) {
      const entry = this.activeDownloads.get(id)!
      entry.abortController.abort() // This throws AbortError in fetch
    }
  }

  cancelDownload(id: string) {
    this.pauseDownload(id)
  }
}

export const downloader = new Downloader()
