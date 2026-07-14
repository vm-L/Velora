import { reactive } from 'vue'

export interface ResourceItem {
  id: string
  name: string
  url: string
}

export const state = reactive({
  closeBehavior: 'tray',
  cmsResources: [] as ResourceItem[],
  externalSites: [] as ResourceItem[],
  loaded: false
})

export const useSettings = () => {
  const loadSettings = async () => {
    state.closeBehavior = (await window.electronAPI.getSetting('closeBehavior')) || 'tray'
    state.cmsResources = (await window.electronAPI.getSetting('cmsResources')) || []
    state.externalSites = (await window.electronAPI.getSetting('externalSites')) || []
    state.loaded = true
  }

  const setCloseBehavior = async (behavior: string) => {
    state.closeBehavior = behavior
    await window.electronAPI.setSetting('closeBehavior', behavior)
  }

  const saveCmsResources = async (resources: ResourceItem[]) => {
    state.cmsResources = resources
    await window.electronAPI.setSetting('cmsResources', resources)
  }

  const saveExternalSites = async (sites: ResourceItem[]) => {
    state.externalSites = sites
    await window.electronAPI.setSetting('externalSites', sites)
  }

  return { state, loadSettings, setCloseBehavior, saveCmsResources, saveExternalSites }
}
