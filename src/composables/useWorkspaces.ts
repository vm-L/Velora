import { reactive } from 'vue'
import type { SniffedPanLink } from '@/composables/pan/shareTextParser'

export interface Tab {
  id: string
  url: string
  title: string
  favicon?: string
  loading: boolean
  webContentsId?: number
  sniffedImages: { url: string, timestamp: number }[]
  sniffedVideos: { url: string, timestamp: number }[]
  sniffedAudios: { url: string, timestamp: number }[]
  sniffedPanLinks: SniffedPanLink[]
  isBlank?: boolean
}

export interface Workspace {
  activeTabId: string | null
  tabs: Tab[]
}

const workspaces = reactive<Record<string, Workspace>>({})

export const useWorkspaces = () => {
  const generateId = () => Math.random().toString(36).substr(2, 9)

  const initWorkspace = (resourceId: string, defaultUrl: string, favicon?: string) => {
    if (!workspaces[resourceId] || workspaces[resourceId].tabs.length === 0) {
      const tabId = generateId()
      workspaces[resourceId] = {
        activeTabId: tabId,
        tabs: [{
          id: tabId,
          url: defaultUrl,
          title: 'Loading...',
          loading: true,
          favicon,
          sniffedImages: [],
          sniffedVideos: [],
          sniffedAudios: [],
          sniffedPanLinks: []
        }]
      }
    }
    return workspaces[resourceId]
  }

  const getWorkspace = (resourceId: string) => workspaces[resourceId]

  const addTab = (resourceId: string, url: string, favicon?: string, activate = true, isBlank = false) => {
    const ws = workspaces[resourceId]
    if (!ws) return null
    const tabId = generateId()
    ws.tabs.push({
      id: tabId,
      url,
      title: isBlank ? '新标签页' : 'Loading...',
      loading: !isBlank,
      favicon: isBlank ? undefined : favicon,
      isBlank,
      sniffedImages: [],
      sniffedVideos: [],
      sniffedAudios: [],
      sniffedPanLinks: []
    })
    if (activate) {
      ws.activeTabId = tabId
    }
    return tabId
  }

  const closeTab = (resourceId: string, tabId: string) => {
    const ws = workspaces[resourceId]
    if (!ws) return
    const index = ws.tabs.findIndex(t => t.id === tabId)
    if (index === -1) return
    
    ws.tabs.splice(index, 1)
    
    if (ws.activeTabId === tabId) {
      if (ws.tabs.length > 0) {
        // Switch to the adjacent tab (preferably the right one, or the last one)
        ws.activeTabId = ws.tabs[Math.min(index, ws.tabs.length - 1)].id
      } else {
        ws.activeTabId = null
      }
    }
  }

  const updateTab = (resourceId: string, tabId: string, data: Partial<Tab>) => {
    const ws = workspaces[resourceId]
    if (!ws) return
    const tab = ws.tabs.find(t => t.id === tabId)
    if (tab) {
      Object.assign(tab, data)
    }
  }

  const resetWorkspace = (resourceId: string) => {
    const ws = workspaces[resourceId]
    if (!ws) return
    const win = typeof window !== 'undefined' ? (window as any) : null
    if (win?._sniffedBuffer instanceof Map) {
      for (const tab of ws.tabs) {
        if (typeof tab.webContentsId === 'number') {
          win._sniffedBuffer.delete(tab.webContentsId)
        }
      }
    }
    delete workspaces[resourceId]
  }

  return { workspaces, initWorkspace, getWorkspace, addTab, closeTab, updateTab, resetWorkspace }
}
