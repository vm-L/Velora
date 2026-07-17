import { ipcMain, app } from 'electron'

// A wrapper to handle the ESM nature of electron-store in a potentially CJS compiled environment
class StoreManager {
  private store: any = null
  private initPromise: Promise<void>

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
        fileDirectory: app.getPath('downloads')
      }
    })
  }

  async getSetting(key: string) {
    await this.initPromise
    return this.store.get(key)
  }

  async setSetting(key: string, value: any) {
    await this.initPromise
    this.store.set(key, value)
  }
}

export const storeManager = new StoreManager()

export function setupStoreHandlers() {
  ipcMain.handle('get-setting', async (_, key) => {
    return await storeManager.getSetting(key)
  })

  ipcMain.on('set-setting', async (_, key, value) => {
    await storeManager.setSetting(key, value)
  })
}
