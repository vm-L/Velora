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
  private activeDownloads: Map<string, any> = new Map()
  private mainWindow: any = null

  setWindow(window: any) {
    this.mainWindow = window
  }

  async startDownload(cmd: DownloadCommand) {
    // TODO: Implement download logic
  }

  pauseDownload(id: string) {
    // TODO: Implement pause logic
  }

  cancelDownload(id: string) {
    // TODO: Implement cancel logic
  }
}

export const downloader = new Downloader()
