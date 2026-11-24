import { state } from '@/composables/settings/types'
import { saveAdBlockSources } from '@/composables/settings/useSettingsMutations'

/**
 * 重新编译所有已启用的广告过滤规则源
 */
export const recompileRules = async () => {
  const enabledIds = state.adBlockSources.filter(s => s.enabled).map(s => s.id)
  await window.electronAPI.compileAdBlockRules(enabledIds)
}

/**
 * 同步单个广告过滤规则源并触发重编译
 */
export const syncAdBlockSourceItem = async (sourceId: string) => {
  const s = state.adBlockSources.find(item => item.id === sourceId)
  if (!s) return { success: false, count: 0, error: '规则源不存在' }

  const res = await window.electronAPI.syncAdBlockSource(s.url, s.id)
  if (res.success) {
    s.ruleCount = res.count
    s.lastUpdated = Date.now()
    await saveAdBlockSources([...state.adBlockSources])
    await recompileRules()
  }
  return res
}

/**
 * 并发拉取所有启用的广告过滤规则源并编译规则
 */
export const syncAllAdBlockSources = async () => {
  const enabledSources = state.adBlockSources.filter(item => item.enabled)
  if (enabledSources.length === 0) {
    await recompileRules()
    return 0
  }

  let totalSynced = 0
  await Promise.all(
    enabledSources.map(async (s) => {
      try {
        const res = await window.electronAPI.syncAdBlockSource(s.url, s.id)
        if (res.success) {
          s.ruleCount = res.count
          s.lastUpdated = Date.now()
          totalSynced++
        }
      } catch {}
    })
  )

  if (totalSynced > 0) {
    await saveAdBlockSources([...state.adBlockSources])
  }
  await recompileRules()
  return totalSynced
}
