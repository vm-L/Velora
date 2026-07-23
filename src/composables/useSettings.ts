import { reactive } from 'vue'

export interface ResourceItem {
  id: string
  name: string
  url: string
  icon?: string
  iconOriginalUrl?: string
}

export const state = reactive({
  closeBehavior: 'tray',
  theme: 'light',
  imageDirectory: '',
  audioDirectory: '',
  videoDirectory: '',
  fileDirectory: '',
  maxConcurrentDownloads: 3,
  maxMemoryBufferMB: 128,
  cmsResources: [] as ResourceItem[],
  externalSites: [] as ResourceItem[],
  customStyles: {} as Record<string, Record<string, string>>,
  loaded: false
})

export const useSettings = () => {
  const loadSettings = async () => {
    state.closeBehavior = (await window.electronAPI.getSetting('closeBehavior')) || 'tray'
    state.theme = (await window.electronAPI.getSetting('theme')) || 'light'
    state.imageDirectory = (await window.electronAPI.getSetting('imageDirectory')) || ''
    state.audioDirectory = (await window.electronAPI.getSetting('audioDirectory')) || ''
    state.videoDirectory = (await window.electronAPI.getSetting('videoDirectory')) || ''
    state.fileDirectory = (await window.electronAPI.getSetting('fileDirectory')) || ''
    state.maxConcurrentDownloads = (await window.electronAPI.getSetting('maxConcurrentDownloads')) || 3
    state.maxMemoryBufferMB = (await window.electronAPI.getSetting('maxMemoryBufferMB')) || 128
    state.cmsResources = (await window.electronAPI.getSetting('cmsResources')) || []
    state.externalSites = (await window.electronAPI.getSetting('externalSites')) || []
    state.customStyles = (await window.electronAPI.getSetting('customStyles')) || {}
    state.loaded = true
  }

  const setCloseBehavior = async (behavior: string) => {
    state.closeBehavior = behavior
    await window.electronAPI.setSetting('closeBehavior', behavior)
  }

  const setTheme = async (theme: 'light' | 'dark') => {
    state.theme = theme
    await window.electronAPI.setSetting('theme', theme)
  }

  const saveImageDirectory = async (dir: string) => {
    state.imageDirectory = dir
    await window.electronAPI.setSetting('imageDirectory', dir)
  }

  const saveAudioDirectory = async (dir: string) => {
    state.audioDirectory = dir
    await window.electronAPI.setSetting('audioDirectory', dir)
  }

  const saveVideoDirectory = async (dir: string) => {
    state.videoDirectory = dir
    await window.electronAPI.setSetting('videoDirectory', dir)
  }

  const saveFileDirectory = async (dir: string) => {
    state.fileDirectory = dir
    await window.electronAPI.setSetting('fileDirectory', dir)
  }

  const saveMaxConcurrentDownloads = async (count: number) => {
    state.maxConcurrentDownloads = count
    await window.electronAPI.setSetting('maxConcurrentDownloads', count)
  }

  const saveMaxMemoryBufferMB = async (mb: number) => {
    state.maxMemoryBufferMB = mb
    await window.electronAPI.setSetting('maxMemoryBufferMB', mb)
  }

  const saveCmsResources = async (resources: ResourceItem[]) => {
    state.cmsResources = resources
    await window.electronAPI.setSetting('cmsResources', JSON.parse(JSON.stringify(resources)))
  }

  const saveExternalSites = async (sites: ResourceItem[]) => {
    state.externalSites = sites
    await window.electronAPI.setSetting('externalSites', JSON.parse(JSON.stringify(sites)))
  }

  const saveCustomStyles = async (styles: Record<string, Record<string, string>>) => {
    state.customStyles = styles
    await window.electronAPI.setSetting('customStyles', JSON.parse(JSON.stringify(styles)))
  }

  return { 
    state, 
    loadSettings, 
    setCloseBehavior, 
    setTheme,
    saveImageDirectory, 
    saveAudioDirectory,
    saveVideoDirectory,
    saveFileDirectory,
    saveMaxConcurrentDownloads,
    saveMaxMemoryBufferMB,
    saveCmsResources, 
    saveExternalSites, 
    saveCustomStyles 
  }
}
