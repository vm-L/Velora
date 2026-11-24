import { downloader } from '../../downloader'
import { getMainWindow } from '../windowManager'
import { registerDownloadIpc } from './downloadIpc'
import { registerLocalFsIpc } from './localFsIpc'
import { registerPanIpc } from './panIpc'
import { registerVideoAndLanIpc } from './videoAndLanIpc'
import { registerWindowAndSystemIpc } from './windowAndSystemIpc'

let isIpcInitialized = false

export function setupIpcHandlers(): void {
  if (isIpcInitialized) return
  isIpcInitialized = true

  downloader.setWindow(getMainWindow())

  registerWindowAndSystemIpc()
  registerDownloadIpc()
  registerLocalFsIpc()
  registerPanIpc()
  registerVideoAndLanIpc()
}
