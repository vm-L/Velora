/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electronAPI: {
    minimize: () => void
    maximize: () => void
    close: () => void
    onWindowMaximized: (callback: () => void) => void
    onWindowUnmaximized: (callback: () => void) => void
    setSetting: (key: string, value: any) => void
    getSetting: (key: string) => Promise<any>
    setCloseBehavior: (behavior: string) => void
    getCloseBehavior: () => Promise<string>
    onWebviewNewWindow: (callback: (url: string) => void) => void
    onMediaSniffed: (callback: (data: any) => void) => void
    copyImage: (url: string) => Promise<boolean>
    openExternal: (url: string) => void
    showItemInFolder: (filePath: string) => void
    selectDirectory: () => Promise<string | undefined>
    saveImages: (dirPath: string, files: { url: string, name: string }[]) => Promise<any[]>
    startDownload: (cmd: any) => void
    pauseDownload: (id: string) => void
    cancelDownload: (id: string) => void
    deleteFile: (filePath: string) => Promise<boolean>
    fileExists: (filePath: string) => Promise<boolean>
    onDownloadProgress: (callback: (data: any) => void) => void
  }
}
