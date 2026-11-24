import { resolveVideoCompressSpeedLimit } from '@/utils/speedLimit'
import {
  BUILTIN_ADBLOCK_SOURCES,
  DEFAULT_VIDEO_THROTTLE_SCOPES,
  isValidVideoThrottleScope,
  state,
  type AdBlockSource
} from '@/composables/settings/types'
import {
  setCloseBehavior,
  setTheme,
  saveImageDirectory,
  saveAudioDirectory,
  saveVideoDirectory,
  saveFileDirectory,
  saveMaxConcurrentDownloads,
  saveMaxMemoryBufferMB,
  saveAutoMatchDownloadSubdir,
  saveEnableVideoCompress,
  saveVideoCompressTargetGB,
  saveVideoCompressMinBitrateKbps,
  saveVideoCompressSpeedLimit,
  saveVideoThrottleScopes,
  saveLocalResources,
  saveCmsResources,
  saveExternalSites,
  saveCustomStyles,
  saveCustomScripts,
  saveCustomParseRules,
  saveCustomWaterfallRules,
  saveCustomDuplicateRules,
  saveAdBlockSources,
  saveLanShareEnabled,
  saveLanSharePort,
  saveLanSharePassword,
  saveLanShareAllowEdit,
  saveLanShareSettings
} from '@/composables/settings/useSettingsMutations'
import {
  recompileRules,
  syncAdBlockSourceItem,
  syncAllAdBlockSources
} from '@/composables/settings/useSettingsAdBlock'
import {
  exportConfigBackup,
  importConfigBackup,
  exportResourceBackup,
  importResourceBackup
} from '@/composables/settings/useSettingsBackup'

export type {
  ResourceItem,
  AdBlockSource,
  CustomScript,
  ParseRuleItem,
  ParseRule,
  WaterfallRule,
  DuplicateMarkRule,
  VideoThrottleScope,
  SettingsState
} from '@/composables/settings/types'

export { BUILTIN_ADBLOCK_SOURCES, state } from '@/composables/settings/types'

export const useSettings = () => {
  const loadSettings = async () => {
    if (!window.electronAPI) return

    // Batch fetch all settings in a single atomic IPC call
    const all = (await window.electronAPI.getAllSettings()) || {}

    state.closeBehavior = all['closeBehavior'] || 'tray'
    state.theme = all['theme'] || 'light'
    state.imageDirectory = all['imageDirectory'] || ''
    state.audioDirectory = all['audioDirectory'] || ''
    state.videoDirectory = all['videoDirectory'] || ''
    state.fileDirectory = all['fileDirectory'] || ''
    state.maxConcurrentDownloads = typeof all['maxConcurrentDownloads'] === 'number' ? all['maxConcurrentDownloads'] : 3
    state.maxMemoryBufferMB = typeof all['maxMemoryBufferMB'] === 'number' ? all['maxMemoryBufferMB'] : 128
    state.autoMatchDownloadSubdir = all['autoMatchDownloadSubdir'] !== undefined ? all['autoMatchDownloadSubdir'] : true
    state.enableVideoCompress = all['enableVideoCompress'] === true
    const savedTarget = all['videoCompressTargetGB'] ?? all['videoCompressThresholdGB']
    state.videoCompressTargetGB = typeof savedTarget === 'number' ? savedTarget : 1.5
    const savedMinBitrate = all['videoCompressMinBitrateKbps']
    state.videoCompressMinBitrateKbps = typeof savedMinBitrate === 'number' ? savedMinBitrate : 1500
    state.videoCompressSpeedLimit = resolveVideoCompressSpeedLimit({
      videoCompressSpeedLimit: all['videoCompressSpeedLimit'],
      videoCompressSpeedPreset: all['videoCompressSpeedPreset']
    })
    const savedThrottleScopes = all['videoThrottleScopes']
    state.videoThrottleScopes = Array.isArray(savedThrottleScopes)
      ? Array.from(new Set(savedThrottleScopes.filter(isValidVideoThrottleScope)))
      : [...DEFAULT_VIDEO_THROTTLE_SCOPES]
    state.localResources = all['localResources'] || []
    state.cmsResources = all['cmsResources'] || []
    state.externalSites = all['externalSites'] || []
    state.customStyles = all['customStyles'] || {}
    state.customScripts = all['customScripts'] || {}
    state.customParseRules = all['customParseRules'] || {}
    state.customWaterfallRules = all['customWaterfallRules'] || {}
    state.customDuplicateRules = all['customDuplicateRules'] || {}
    state.lanShareEnabled = all['lanShareEnabled'] === true
    state.lanSharePort = typeof all['lanSharePort'] === 'number' ? all['lanSharePort'] : 8899
    state.lanSharePassword = all['lanSharePassword'] || ''
    state.lanShareAllowEdit = all['lanShareAllowEdit'] === true

    // Load adblock sources & merge built-ins
    const savedSources: AdBlockSource[] = all['adBlockSources'] || []
    const mergedSources = [...BUILTIN_ADBLOCK_SOURCES]
    for (const saved of savedSources) {
      const idx = mergedSources.findIndex(b => b.id === saved.id)
      if (idx !== -1) {
        mergedSources[idx] = { ...mergedSources[idx], ...saved, isBuiltIn: true }
      } else {
        mergedSources.push({ ...saved, isBuiltIn: false })
      }
    }
    state.adBlockSources = mergedSources

    state.loaded = true

    // Background asynchronous adblock rules compilation & update without blocking startup
    const runBackgroundAdBlock = () => {
      recompileRules().finally(() => {
        syncAllAdBlockSources().catch(err => {
          window.electronAPI.log('warn', 'AdBlock', 'Background auto update failed: ' + err.message)
        })
      })
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(runBackgroundAdBlock, { timeout: 3000 })
    } else {
      setTimeout(runBackgroundAdBlock, 1000)
    }
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
    saveAutoMatchDownloadSubdir,
    saveEnableVideoCompress,
    saveVideoCompressTargetGB,
    saveVideoCompressMinBitrateKbps,
    saveVideoCompressSpeedLimit,
    saveVideoThrottleScopes,
    saveLocalResources,
    saveCmsResources,
    saveExternalSites,
    saveCustomStyles,
    saveCustomScripts,
    saveCustomParseRules,
    saveCustomWaterfallRules,
    saveCustomDuplicateRules,
    saveAdBlockSources,
    syncAdBlockSourceItem,
    syncAllAdBlockSources,
    recompileRules,
    exportResourceBackup,
    importResourceBackup,
    exportConfigBackup,
    importConfigBackup,
    saveLanShareEnabled,
    saveLanSharePort,
    saveLanSharePassword,
    saveLanShareAllowEdit,
    saveLanShareSettings
  }
}
