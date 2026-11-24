import { reactive } from 'vue'
import { DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT } from '@/utils/speedLimit'

export interface ResourceItem {
  id: string
  name: string
  url: string
  path?: string
  icon?: string
  iconOriginalUrl?: string
}

export interface AdBlockSource {
  id: string
  name: string
  url: string
  enabled: boolean
  isBuiltIn?: boolean
  ruleCount: number
  lastUpdated?: number
}

export const BUILTIN_ADBLOCK_SOURCES: AdBlockSource[] = [
  {
    id: 'easylist',
    name: 'EasyList (通用基础广告规则)',
    url: 'https://easylist-downloads.adblockplus.org/easylist.txt',
    enabled: true,
    isBuiltIn: true,
    ruleCount: 0
  },
  {
    id: 'easylist_china',
    name: 'EasyList China (中文广告规则)',
    url: 'https://easylist-downloads.adblockplus.org/easylistchina.txt',
    enabled: false,
    isBuiltIn: true,
    ruleCount: 0
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy (隐私追踪拦截规则)',
    url: 'https://easylist-downloads.adblockplus.org/easyprivacy.txt',
    enabled: false,
    isBuiltIn: true,
    ruleCount: 0
  },
  {
    id: 'cjx_annoyance',
    name: "CJX's Annoyance List (烦人元素规则)",
    url: 'https://raw.githubusercontent.com/cjx8263045/cjxlist/master/cjx-annoyance.txt',
    enabled: false,
    isBuiltIn: true,
    ruleCount: 0
  }
]

export interface CustomScript {
  id: string
  name: string
  domain: string
  code: string
  runAt: 'document-start' | 'dom-ready' | 'document-end'
}

export interface ParseRuleItem {
  id: string
  key: string
  value: string
  regex?: string
}

export interface ParseRule {
  id: string
  domain: string
  actionType: 'download' | 'copy'
  items: ParseRuleItem[]
}

export interface WaterfallRule {
  id: string
  name?: string
  domain: string
  nextSelector: string
  contentSelector: string
  enabled?: boolean
}

export interface DuplicateMarkRule {
  id: string
  name?: string
  domain: string
  mountSelector: string
  titleSelector: string
  titleAttribute?: string
  offsetX: number
  offsetY: number
  enabled?: boolean
  regexPattern?: string
}

export type VideoThrottleScope = 'autoCompress' | 'manualCompress'

export const DEFAULT_VIDEO_THROTTLE_SCOPES: VideoThrottleScope[] = ['autoCompress']
const VALID_THROTTLE_SCOPES = new Set<VideoThrottleScope>(['autoCompress', 'manualCompress'])

export const isValidVideoThrottleScope = (val: any): val is VideoThrottleScope =>
  VALID_THROTTLE_SCOPES.has(val)

export interface SettingsState {
  closeBehavior: string
  theme: string
  imageDirectory: string
  audioDirectory: string
  videoDirectory: string
  fileDirectory: string
  maxConcurrentDownloads: number
  maxMemoryBufferMB: number
  autoMatchDownloadSubdir: boolean
  enableVideoCompress: boolean
  videoCompressTargetGB: number
  videoCompressMinBitrateKbps: number
  videoCompressSpeedLimit: number
  videoThrottleScopes: VideoThrottleScope[]
  localResources: ResourceItem[]
  cmsResources: ResourceItem[]
  externalSites: ResourceItem[]
  customStyles: Record<string, Record<string, string>>
  customScripts: Record<string, CustomScript[]>
  customParseRules: Record<string, ParseRule[]>
  customWaterfallRules: Record<string, WaterfallRule[]>
  customDuplicateRules: Record<string, DuplicateMarkRule[]>
  adBlockSources: AdBlockSource[]
  lanShareEnabled: boolean
  lanSharePort: number
  lanSharePassword: string
  lanShareAllowEdit: boolean
  loaded: boolean
}

export const state = reactive<SettingsState>({
  closeBehavior: 'tray',
  theme: 'light',
  imageDirectory: '',
  audioDirectory: '',
  videoDirectory: '',
  fileDirectory: '',
  maxConcurrentDownloads: 3,
  maxMemoryBufferMB: 128,
  autoMatchDownloadSubdir: true,
  enableVideoCompress: false,
  videoCompressTargetGB: 1.5,
  videoCompressMinBitrateKbps: 1500,
  videoCompressSpeedLimit: DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT,
  videoThrottleScopes: [...DEFAULT_VIDEO_THROTTLE_SCOPES],
  localResources: [] as ResourceItem[],
  cmsResources: [] as ResourceItem[],
  externalSites: [] as ResourceItem[],
  customStyles: {} as Record<string, Record<string, string>>,
  customScripts: {} as Record<string, CustomScript[]>,
  customParseRules: {} as Record<string, ParseRule[]>,
  customWaterfallRules: {} as Record<string, WaterfallRule[]>,
  customDuplicateRules: {} as Record<string, DuplicateMarkRule[]>,
  adBlockSources: [] as AdBlockSource[],
  lanShareEnabled: false,
  lanSharePort: 8899,
  lanSharePassword: '',
  lanShareAllowEdit: false,
  loaded: false
})
