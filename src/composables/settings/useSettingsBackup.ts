import type { ConfigBackupSectionKey } from '@/types/backup'
import { resolveVideoCompressSpeedLimit } from '@/utils/speedLimit'
import {
  state,
  type ResourceItem,
  type AdBlockSource,
  type CustomScript,
  type ParseRule,
  type WaterfallRule,
  type DuplicateMarkRule
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
  saveLanShareSettings
} from '@/composables/settings/useSettingsMutations'
import { recompileRules } from '@/composables/settings/useSettingsAdBlock'

const mergeItemsById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
  const mergedMap = new Map((existing || []).map(item => [item.id, item]))
  for (const item of incoming) {
    if (!mergedMap.has(item.id)) {
      mergedMap.set(item.id, item)
    }
  }
  return Array.from(mergedMap.values())
}

const mergeRecordArraysById = <T extends { id: string }>(
  existing: Record<string, T[]>,
  incoming: Record<string, T[]>
): Record<string, T[]> => {
  const merged: Record<string, T[]> = {}
  for (const [key, list] of Object.entries(existing || {})) {
    merged[key] = [...list]
  }
  for (const [resId, items] of Object.entries(incoming || {})) {
    merged[resId] = merged[resId]
      ? mergeItemsById(merged[resId], items)
      : [...items]
  }
  return merged
}

/**
 * 按选中分区导出全局配置备份 JSON
 */
export const exportConfigBackup = async (selectedKeys: ConfigBackupSectionKey[]) => {
  const payload: any = {
    type: 'velora-config-backup',
    version: '1.5.5',
    timestamp: Date.now(),
    data: {}
  }

  if (selectedKeys.includes('general')) {
    payload.data.general = {
      theme: state.theme,
      closeBehavior: state.closeBehavior
    }
  }

  if (selectedKeys.includes('download')) {
    payload.data.download = {
      imageDirectory: state.imageDirectory,
      audioDirectory: state.audioDirectory,
      videoDirectory: state.videoDirectory,
      fileDirectory: state.fileDirectory,
      maxConcurrentDownloads: state.maxConcurrentDownloads,
      maxMemoryBufferMB: state.maxMemoryBufferMB,
      autoMatchDownloadSubdir: state.autoMatchDownloadSubdir
    }
  }

  if (selectedKeys.includes('videoCompress')) {
    payload.data.videoCompress = {
      enableVideoCompress: state.enableVideoCompress,
      videoCompressTargetGB: state.videoCompressTargetGB,
      videoCompressMinBitrateKbps: state.videoCompressMinBitrateKbps,
      videoCompressSpeedLimit: state.videoCompressSpeedLimit,
      videoThrottleScopes: [...state.videoThrottleScopes]
    }
  }

  if (selectedKeys.includes('lanShare')) {
    payload.data.lanShare = {
      lanShareEnabled: state.lanShareEnabled,
      lanSharePort: state.lanSharePort,
      lanSharePassword: state.lanSharePassword,
      lanShareAllowEdit: state.lanShareAllowEdit
    }
  }

  if (selectedKeys.includes('externalSites')) {
    const sites = JSON.parse(JSON.stringify(state.externalSites || []))
    payload.data.externalSites = sites
    // 保持与旧版字段名 webResources 的兼容
    payload.data.webResources = sites
  }

  if (selectedKeys.includes('localResources')) {
    payload.data.localResources = JSON.parse(JSON.stringify(state.localResources || []))
  }

  if (selectedKeys.includes('cmsResources')) {
    payload.data.cmsResources = JSON.parse(JSON.stringify(state.cmsResources || []))
  }

  if (selectedKeys.includes('customParseRules')) {
    payload.data.customParseRules = JSON.parse(JSON.stringify(state.customParseRules || {}))
  }

  if (selectedKeys.includes('customScripts')) {
    payload.data.customScripts = JSON.parse(JSON.stringify(state.customScripts || {}))
    payload.data.customStyles = JSON.parse(JSON.stringify(state.customStyles || {}))
    payload.data.customWaterfallRules = JSON.parse(JSON.stringify(state.customWaterfallRules || {}))
    payload.data.customDuplicateRules = JSON.parse(JSON.stringify(state.customDuplicateRules || {}))
  }

  if (selectedKeys.includes('adBlockSources')) {
    payload.data.adBlockSources = JSON.parse(JSON.stringify(state.adBlockSources || []))
  }

  return await window.electronAPI.exportResourcesJson(payload)
}

/**
 * 导入配置备份 JSON（支持覆盖与按 ID 合并模式）
 */
export const importConfigBackup = async (
  backupData: any,
  selectedKeys: ConfigBackupSectionKey[],
  mode: 'merge' | 'overwrite'
) => {
  const data = backupData?.data || {}

  // 1. 常规与外观
  if (selectedKeys.includes('general') && data.general) {
    if (data.general.theme) await setTheme(data.general.theme)
    if (data.general.closeBehavior) await setCloseBehavior(data.general.closeBehavior)
  }

  // 2. 下载与存储
  if (selectedKeys.includes('download') && data.download) {
    const d = data.download
    if (d.imageDirectory) await saveImageDirectory(d.imageDirectory)
    if (d.audioDirectory) await saveAudioDirectory(d.audioDirectory)
    if (d.videoDirectory) await saveVideoDirectory(d.videoDirectory)
    if (d.fileDirectory) await saveFileDirectory(d.fileDirectory)
    if (typeof d.maxConcurrentDownloads === 'number') await saveMaxConcurrentDownloads(d.maxConcurrentDownloads)
    if (typeof d.maxMemoryBufferMB === 'number') await saveMaxMemoryBufferMB(d.maxMemoryBufferMB)
    if (typeof d.autoMatchDownloadSubdir === 'boolean') await saveAutoMatchDownloadSubdir(d.autoMatchDownloadSubdir)
  }

  // 3. 视频自动压缩
  if (selectedKeys.includes('videoCompress') && data.videoCompress) {
    const v = data.videoCompress
    if (typeof v.enableVideoCompress === 'boolean') await saveEnableVideoCompress(v.enableVideoCompress)
    if (typeof v.videoCompressTargetGB === 'number') await saveVideoCompressTargetGB(v.videoCompressTargetGB)
    if (typeof v.videoCompressMinBitrateKbps === 'number') await saveVideoCompressMinBitrateKbps(v.videoCompressMinBitrateKbps)
    if (v.videoCompressSpeedLimit !== undefined || v.videoCompressSpeedPreset !== undefined) {
      await saveVideoCompressSpeedLimit(
        resolveVideoCompressSpeedLimit(
          {
            videoCompressSpeedLimit: v.videoCompressSpeedLimit,
            videoCompressSpeedPreset: v.videoCompressSpeedPreset
          },
          state.videoCompressSpeedLimit
        )
      )
    }
    if (Array.isArray(v.videoThrottleScopes)) await saveVideoThrottleScopes(v.videoThrottleScopes)
  }

  // 4. 局域网服务
  if (selectedKeys.includes('lanShare') && data.lanShare) {
    const l = data.lanShare
    await saveLanShareSettings({
      enabled: typeof l.lanShareEnabled === 'boolean' ? l.lanShareEnabled : state.lanShareEnabled,
      port: typeof l.lanSharePort === 'number' ? l.lanSharePort : state.lanSharePort,
      password: typeof l.lanSharePassword === 'string' ? l.lanSharePassword : state.lanSharePassword,
      allowEdit: typeof l.lanShareAllowEdit === 'boolean' ? l.lanShareAllowEdit : state.lanShareAllowEdit
    })
  }

  // 5. 网页资源站点 (兼容新旧字段名 externalSites / webResources)
  const newWebResources: ResourceItem[] = data.externalSites || data.webResources || []
  if (selectedKeys.includes('externalSites') && newWebResources.length > 0) {
    await saveExternalSites(
      mode === 'overwrite'
        ? newWebResources
        : mergeItemsById(state.externalSites, newWebResources)
    )
  }

  // 6. 本地资源挂载
  const newLocalResources: ResourceItem[] = data.localResources || []
  if (selectedKeys.includes('localResources') && newLocalResources.length > 0) {
    await saveLocalResources(
      mode === 'overwrite'
        ? newLocalResources
        : mergeItemsById(state.localResources, newLocalResources)
    )
  }

  // 7. CMS 资源站
  const newCmsResources: ResourceItem[] = data.cmsResources || []
  if (selectedKeys.includes('cmsResources') && newCmsResources.length > 0) {
    await saveCmsResources(
      mode === 'overwrite'
        ? newCmsResources
        : mergeItemsById(state.cmsResources, newCmsResources)
    )
  }

  // 8. 域名解析规则
  const newParseRules: Record<string, ParseRule[]> = data.customParseRules || {}
  if (selectedKeys.includes('customParseRules') && Object.keys(newParseRules).length > 0) {
    await saveCustomParseRules(
      mode === 'overwrite'
        ? newParseRules
        : mergeRecordArraysById(state.customParseRules, newParseRules)
    )
  }

  // 9. 自定义注入脚本与样式及瀑布流规则与标记重复规则
  const newScripts: Record<string, CustomScript[]> = data.customScripts || {}
  const newStyles: Record<string, Record<string, string>> = data.customStyles || {}
  const newWaterfallRules: Record<string, WaterfallRule[]> = data.customWaterfallRules || {}
  const newDuplicateRules: Record<string, DuplicateMarkRule[]> = data.customDuplicateRules || {}
  if (selectedKeys.includes('customScripts')) {
    if (mode === 'overwrite') {
      if (data.customScripts) await saveCustomScripts(newScripts)
      if (data.customStyles) await saveCustomStyles(newStyles)
      if (data.customWaterfallRules) await saveCustomWaterfallRules(newWaterfallRules)
      if (data.customDuplicateRules) await saveCustomDuplicateRules(newDuplicateRules)
    } else {
      if (data.customScripts) {
        await saveCustomScripts(mergeRecordArraysById(state.customScripts, newScripts))
      }
      if (data.customStyles) {
        await saveCustomStyles({ ...(state.customStyles || {}), ...newStyles })
      }
      if (data.customWaterfallRules) {
        await saveCustomWaterfallRules(mergeRecordArraysById(state.customWaterfallRules, newWaterfallRules))
      }
      if (data.customDuplicateRules) {
        await saveCustomDuplicateRules(mergeRecordArraysById(state.customDuplicateRules, newDuplicateRules))
      }
    }
  }

  // 10. 广告过滤规则源
  const newAdSources: AdBlockSource[] = data.adBlockSources || []
  if (selectedKeys.includes('adBlockSources') && newAdSources.length > 0) {
    await saveAdBlockSources(
      mode === 'overwrite'
        ? newAdSources
        : mergeItemsById(state.adBlockSources, newAdSources)
    )
    await recompileRules()
  }
}

export const exportResourceBackup = async () => {
  return await exportConfigBackup(['externalSites', 'localResources', 'cmsResources', 'customParseRules', 'customScripts'])
}

export const importResourceBackup = async (backupData: any, mode: 'overwrite' | 'merge') => {
  await importConfigBackup(backupData, ['externalSites', 'localResources', 'cmsResources', 'customParseRules', 'customScripts'], mode)
}
