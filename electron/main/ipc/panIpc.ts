import { BrowserWindow, ipcMain, session } from 'electron'
import { downloader, getHeadersForUrl } from '../../downloader'
import { PAN_CONFIGS } from '../../pan/accountManager'
import { panService } from '../../pan/service'
import { registerPanPreview } from '../mediaStreamServer'
import { getMainWindow } from '../windowManager'

export function registerPanIpc(): void {
  ipcMain.handle('get-pan-accounts', async () => {
    return panService.getPublicAccounts()
  })

  ipcMain.handle('login-pan-account', async (event, type: any) => {
    try {
      const parentWin = BrowserWindow.fromWebContents(event.sender) || getMainWindow() || undefined
      const account = await panService.login(type, parentWin)
      return { success: !!account, account: account ? panService.toPublicAccount(account) : undefined }
    } catch (err: any) {
      return { success: false, error: err?.message || '登录异常' }
    }
  })

  ipcMain.handle('logout-pan-account', async (_, type: any) => {
    if (typeof type !== 'string' || !PAN_CONFIGS[type as keyof typeof PAN_CONFIGS]) {
      return { success: false, error: '无效的网盘类型' }
    }
    panService.removeAccount(type as any)
    try {
      const partition = `persist:pan_auth_${type}`
      const authSession = session.fromPartition(partition)
      await authSession.clearStorageData()
      await authSession.clearCache()
      await authSession.clearAuthCache()
    } catch {}
    return { success: true }
  })

  ipcMain.handle('resolve-pan-resource', async (_, { url, password }: { url: string; password?: string }) => {
    try {
      const res = await panService.parseUrl(url, password)
      if (res.error && (!res.files || res.files.length === 0)) {
        return { success: false, error: res.error, data: res }
      }
      return { success: true, data: res }
    } catch (err: any) {
      return { success: false, error: err?.message || '解析网盘失败' }
    }
  })

  ipcMain.handle('pan-list-files', async (_, { type, pdirFid }: { type: any; pdirFid?: string }) => {
    return panService.listDriveFiles(type, pdirFid)
  })

  ipcMain.handle('pan-get-download-urls', async (_, { type, fids }: { type: any; fids: string[] }) => {
    return panService.getDriveDownloadUrls(type, fids)
  })

  ipcMain.handle('pan-delete-files', async (_, { type, fids }: { type: any; fids: string[] }) => {
    return panService.deleteDriveFiles(type, fids)
  })

  ipcMain.handle('pan-get-share-download-urls', async (_, { type, items }: { type: any; items: any[] }) => {
    return panService.getShareDownloadUrls(type, items)
  })

  ipcMain.handle('pan-refresh-quota', async (_, type: any) => {
    return panService.refreshQuota(type)
  })

  ipcMain.handle('pan-create-folder', async (_, { type, parentFid, name }: { type: any; parentFid: string; name: string }) => {
    return panService.createDriveFolder(type, parentFid, name)
  })

  ipcMain.handle('pan-rename-item', async (_, { type, fid, newName, isDirectory }: { type: any; fid: string; newName: string; isDirectory?: boolean }) => {
    return panService.renameDriveItem(type, fid, newName, isDirectory)
  })

  ipcMain.handle('pan-move-items', async (_, { type, fids, targetDirFid }: { type: any; fids: string[]; targetDirFid: string }) => {
    return panService.moveDriveItems(type, fids, targetDirFid)
  })

  ipcMain.handle('pan-create-share', async (_, { type, params }: { type: any; params: any }) => {
    return panService.createDriveShare(type, params)
  })

  ipcMain.handle('pan-save-share', async (_, { type, items, targetDirFid }: { type: any; items: any[]; targetDirFid: string }) => {
    return panService.saveShareToDrive(type, items, targetDirFid)
  })

  ipcMain.handle('pan-get-preview-url', async (_, { type, fid, filename }: { type: any; fid: string; filename?: string }) => {
    try {
      const res = await panService.getDriveDownloadUrls(type, [fid])
      if (!res.success) {
        return { success: false, error: res.error || '无法获取媒体直链' }
      }
      const link = res.links?.[fid]
      const url = link?.url || res.urls?.[fid]
      if (!url) {
        return { success: false, error: '无法获取媒体直链' }
      }
      const cachedHeaders = panService.getCachedHeadersForUrl(url) || {}
      const baseHeaders = getHeadersForUrl(url, undefined, undefined, undefined, { allowPanCookies: true, panType: String(type) })
      const mergedHeaders = { ...baseHeaders, ...cachedHeaders }

      const previewUrl = registerPanPreview(url, mergedHeaders, String(link?.filename || filename || 'media.mp4'))
      return { success: true, previewUrl }
    } catch (err: any) {
      return { success: false, error: err?.message || '获取预览流失败' }
    }
  })

  ipcMain.handle('pan-cleanup-temp-dir', async (_, { type, cleanupDirFid }: { type: any; cleanupDirFid: string }) => {
    try {
      if (!type || !cleanupDirFid) return { success: true }
      if (downloader.hasUnfinishedTempDirRef(String(type), String(cleanupDirFid))) {
        return { success: true }
      }
      await panService.cleanupTempDir(type, cleanupDirFid)
      return { success: true }
    } catch {
      return { success: false }
    }
  })
}
