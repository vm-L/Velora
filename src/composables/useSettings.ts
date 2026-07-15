import { reactive } from 'vue'

export interface ResourceItem {
  id: string
  name: string
  url: string
  icon?: string
}

export const state = reactive({
  closeBehavior: 'tray',
  imageDirectory: '',
  cmsResources: [] as ResourceItem[],
  externalSites: [] as ResourceItem[],
  customStyles: {} as Record<string, Record<string, { selector: string, css: string }[]>>,
  loaded: false
})

export const useSettings = () => {
  const loadSettings = async () => {
    state.closeBehavior = (await window.electronAPI.getSetting('closeBehavior')) || 'tray'
    state.imageDirectory = (await window.electronAPI.getSetting('imageDirectory')) || ''
    state.cmsResources = (await window.electronAPI.getSetting('cmsResources')) || []
    state.externalSites = (await window.electronAPI.getSetting('externalSites')) || []
    state.customStyles = (await window.electronAPI.getSetting('customStyles')) || {}
    state.loaded = true
  }

  const setCloseBehavior = async (behavior: string) => {
    state.closeBehavior = behavior
    await window.electronAPI.setSetting('closeBehavior', behavior)
  }

  const saveImageDirectory = async (dir: string) => {
    state.imageDirectory = dir
    await window.electronAPI.setSetting('imageDirectory', dir)
  }

  const saveCmsResources = async (resources: ResourceItem[]) => {
    state.cmsResources = resources
    await window.electronAPI.setSetting('cmsResources', resources)
  }

  const saveExternalSites = async (sites: ResourceItem[]) => {
    state.externalSites = sites
    await window.electronAPI.setSetting('externalSites', sites)
  }

  const saveCustomStyles = async (styles: Record<string, Record<string, { selector: string, css: string }[]>>) => {
    state.customStyles = styles
    await window.electronAPI.setSetting('customStyles', JSON.parse(JSON.stringify(styles)))
  }

  return { state, loadSettings, setCloseBehavior, saveImageDirectory, saveCmsResources, saveExternalSites, saveCustomStyles }
}
