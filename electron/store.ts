import { ipcMain, app } from 'electron'
import { saveRuleCacheFileSync } from './adblock'

// A wrapper to handle the ESM nature of electron-store in a potentially CJS compiled environment
// Adds an in-memory mirror cache + debounced persistence so getSetting() has zero synchronous disk I/O
class StoreManager {
  private store: any = null
  private initPromise: Promise<void>
  private cache: Record<string, any> = {}
  private pendingWrites = new Map<string, any>()
  private flushTimer: NodeJS.Timeout | null = null

  constructor() {
    this.initPromise = this.init()
  }

  private async init() {
    const { default: Store } = await import('electron-store')
    this.store = new Store({
      defaults: {
        closeBehavior: 'tray',
        cmsResources: [],
        externalSites: [],
        imageDirectory: app.getPath('downloads'),
        audioDirectory: app.getPath('downloads'),
        videoDirectory: app.getPath('downloads'),
        fileDirectory: app.getPath('downloads'),
        maxConcurrentDownloads: 3,
        maxMemoryBufferMB: 128,
        autoMatchDownloadSubdir: true,
        lanShareEnabled: false,
        lanSharePort: 8899,
        lanSharePassword: '',
        lanShareAllowEdit: false,
        customDuplicateRules: {},
        videoCompressSpeedPreset: 'unlimited',
        videoThrottleScopes: ['autoCompress']
      }
    })

    const initialStore = { ...(this.store.store || {}) }

    // Migrate multi-MB adBlockCache out of config.json into standalone cache files
    if (initialStore.adBlockCache && typeof initialStore.adBlockCache === 'object') {
      for (const [sourceId, text] of Object.entries(initialStore.adBlockCache)) {
        if (typeof text === 'string' && text.length > 0) {
          saveRuleCacheFileSync(sourceId, text)
        }
      }
      delete initialStore.adBlockCache
      try {
        this.store.delete('adBlockCache')
      } catch {}
    }

    this.cache = initialStore
  }

  async getSetting(key: string) {
    await this.initPromise
    return this.cache[key]
  }

  async getAllSettings() {
    await this.initPromise
    return { ...this.cache }
  }

  private changeListeners: Array<(key: string, value: any) => void> = []

  onSettingChange(cb: (key: string, value: any) => void) {
    this.changeListeners.push(cb)
  }

  private scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flushToStore()
    }, 150)
  }

  private flushToStore() {
    if (!this.store || this.pendingWrites.size === 0) return
    const entries = Array.from(this.pendingWrites.entries())
    this.pendingWrites.clear()
    try {
      const nextStore = { ...(this.store.store || {}) }
      for (const [k, v] of entries) {
        if (v === undefined) {
          delete nextStore[k]
        } else {
          nextStore[k] = v
        }
      }
      this.store.store = nextStore
    } catch {
      for (const [k, v] of entries) {
        try {
          if (v === undefined) {
            this.store.delete(k)
          } else {
            this.store.set(k, v)
          }
        } catch {}
      }
    }
  }

  flushSync() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.flushToStore()
  }

  async setSetting(key: string, value: any) {
    await this.initPromise
    if (key === 'adBlockCache' && value && typeof value === 'object') {
      for (const [sourceId, text] of Object.entries(value)) {
        if (typeof text === 'string') {
          saveRuleCacheFileSync(sourceId, text)
        }
      }
      return
    }
    this.cache[key] = value
    this.pendingWrites.set(key, value)
    this.changeListeners.forEach(cb => cb(key, value))
    this.scheduleFlush()
  }
}

export const storeManager = new StoreManager()

export function setupStoreHandlers() {
  ipcMain.handle('get-setting', async (_, key) => {
    return await storeManager.getSetting(key)
  })

  ipcMain.handle('get-all-settings', async () => {
    return await storeManager.getAllSettings()
  })

  ipcMain.on('set-setting', async (_, key, value) => {
    await storeManager.setSetting(key, value)
  })
}
