import {
  DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT,
  normalizeVideoCompressSpeedLimit
} from '@/utils/speedLimit'
import {
  state,
  isValidVideoThrottleScope,
  type SettingsState,
  type ResourceItem,
  type AdBlockSource,
  type CustomScript,
  type ParseRule,
  type WaterfallRule,
  type DuplicateMarkRule,
  type VideoThrottleScope
} from '@/composables/settings/types'

const saveSimpleSetting = async <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
  state[key] = value
  await window.electronAPI.setSetting(key as string, value)
}

const saveClonedSetting = async <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
  state[key] = value
  await window.electronAPI.setSetting(key as string, JSON.parse(JSON.stringify(value)))
}

export const setCloseBehavior = (behavior: string) => saveSimpleSetting('closeBehavior', behavior)
export const setTheme = (theme: 'light' | 'dark') => saveSimpleSetting('theme', theme)
export const saveImageDirectory = (dir: string) => saveSimpleSetting('imageDirectory', dir)
export const saveAudioDirectory = (dir: string) => saveSimpleSetting('audioDirectory', dir)
export const saveVideoDirectory = (dir: string) => saveSimpleSetting('videoDirectory', dir)
export const saveFileDirectory = (dir: string) => saveSimpleSetting('fileDirectory', dir)
export const saveMaxConcurrentDownloads = (count: number) => saveSimpleSetting('maxConcurrentDownloads', count)
export const saveMaxMemoryBufferMB = (mb: number) => saveSimpleSetting('maxMemoryBufferMB', mb)
export const saveAutoMatchDownloadSubdir = (enabled: boolean) => saveSimpleSetting('autoMatchDownloadSubdir', enabled)
export const saveEnableVideoCompress = (enabled: boolean) => saveSimpleSetting('enableVideoCompress', enabled)
export const saveVideoCompressTargetGB = (gb: number) => saveSimpleSetting('videoCompressTargetGB', gb)
export const saveVideoCompressMinBitrateKbps = (kbps: number) => saveSimpleSetting('videoCompressMinBitrateKbps', kbps)

export const saveVideoCompressSpeedLimit = async (limit: number) => {
  const validLimit = normalizeVideoCompressSpeedLimit(limit, DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT)
  await saveSimpleSetting('videoCompressSpeedLimit', validLimit)
}

export const saveVideoThrottleScopes = async (scopes: VideoThrottleScope[]) => {
  const plainScopes = Array.from(new Set((Array.isArray(scopes) ? scopes : []).filter(isValidVideoThrottleScope)))
  state.videoThrottleScopes = plainScopes
  await window.electronAPI.setSetting('videoThrottleScopes', [...plainScopes])
}

export const saveLocalResources = (resources: ResourceItem[]) => saveClonedSetting('localResources', resources)
export const saveCmsResources = (resources: ResourceItem[]) => saveClonedSetting('cmsResources', resources)
export const saveExternalSites = (sites: ResourceItem[]) => saveClonedSetting('externalSites', sites)
export const saveCustomStyles = (styles: Record<string, Record<string, string>>) => saveClonedSetting('customStyles', styles)
export const saveCustomScripts = (scripts: Record<string, CustomScript[]>) => saveClonedSetting('customScripts', scripts)
export const saveCustomParseRules = (rules: Record<string, ParseRule[]>) => saveClonedSetting('customParseRules', rules)
export const saveCustomWaterfallRules = (rules: Record<string, WaterfallRule[]>) => saveClonedSetting('customWaterfallRules', rules)
export const saveCustomDuplicateRules = (rules: Record<string, DuplicateMarkRule[]>) => saveClonedSetting('customDuplicateRules', rules)
export const saveAdBlockSources = (sources: AdBlockSource[]) => saveClonedSetting('adBlockSources', sources)

export const saveLanShareEnabled = async (enabled: boolean) => {
  state.lanShareEnabled = enabled
  await window.electronAPI.setSetting('lanShareEnabled', enabled)
  if (enabled) {
    await window.electronAPI.restartLanServer()
  } else {
    await window.electronAPI.stopLanServer()
  }
}

export const saveLanSharePort = async (port: number) => {
  state.lanSharePort = port
  await window.electronAPI.setSetting('lanSharePort', port)
  if (state.lanShareEnabled) {
    await window.electronAPI.restartLanServer()
  }
}

export const saveLanSharePassword = async (password: string) => {
  state.lanSharePassword = password
  await window.electronAPI.setSetting('lanSharePassword', password)
  if (state.lanShareEnabled) {
    await window.electronAPI.restartLanServer()
  }
}

export const saveLanShareAllowEdit = async (allowEdit: boolean) => {
  state.lanShareAllowEdit = allowEdit
  await window.electronAPI.setSetting('lanShareAllowEdit', allowEdit)
  if (state.lanShareEnabled) {
    await window.electronAPI.restartLanServer()
  }
}

export const saveLanShareSettings = async (options: { enabled: boolean; port: number; password: string; allowEdit: boolean }) => {
  state.lanShareEnabled = options.enabled
  state.lanSharePort = options.port
  state.lanSharePassword = options.password
  state.lanShareAllowEdit = options.allowEdit
  await window.electronAPI.setSetting('lanShareEnabled', options.enabled)
  await window.electronAPI.setSetting('lanSharePort', options.port)
  await window.electronAPI.setSetting('lanSharePassword', options.password)
  await window.electronAPI.setSetting('lanShareAllowEdit', options.allowEdit)
  if (options.enabled) {
    return await window.electronAPI.restartLanServer()
  } else {
    await window.electronAPI.stopLanServer()
    return { success: true, running: false }
  }
}
