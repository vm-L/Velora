import { reactive } from 'vue'

export interface ResourceItem {
  id: string
  name: string
  url: string
  icon?: string
  iconOriginalUrl?: string
}

export interface AdBlockSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  isBuiltIn?: boolean;
  ruleCount: number;
  lastUpdated?: number;
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
];

export interface CustomScript {
  id: string;
  name: string;
  domain: string;
  code: string;
  runAt: 'document-start' | 'dom-ready' | 'document-end';
}

export interface ParseRuleItem {
  id: string;
  key: string;
  regex: string;
}

export interface ParseRule {
  id: string;
  domain: string;
  actionType: 'download' | 'copy';
  items: ParseRuleItem[];
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
  customScripts: {} as Record<string, CustomScript[]>,
  customParseRules: {} as Record<string, ParseRule[]>,
  adBlockSources: [] as AdBlockSource[],
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
    state.customScripts = (await window.electronAPI.getSetting('customScripts')) || {}
    state.customParseRules = (await window.electronAPI.getSetting('customParseRules')) || {}

    // Load adblock sources & merge built-ins
    const savedSources: AdBlockSource[] = (await window.electronAPI.getSetting('adBlockSources')) || [];
    const mergedSources = [...BUILTIN_ADBLOCK_SOURCES];
    for (const saved of savedSources) {
      const idx = mergedSources.findIndex(b => b.id === saved.id);
      if (idx !== -1) {
        mergedSources[idx] = { ...mergedSources[idx], ...saved, isBuiltIn: true };
      } else {
        mergedSources.push({ ...saved, isBuiltIn: false });
      }
    }
    state.adBlockSources = mergedSources;

    state.loaded = true;
    await recompileRules();

    // 静默后台自动更新所有已启用的规则源
    syncAllAdBlockSources().catch(err => {
      window.electronAPI.log('warn', 'AdBlock', 'Background auto update failed: ' + err.message);
    });
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

  
  const saveCustomScripts = async (scripts: Record<string, CustomScript[]>) => {
    state.customScripts = scripts
    await window.electronAPI.setSetting('customScripts', JSON.parse(JSON.stringify(scripts)))
  }

  const saveCustomParseRules = async (rules: Record<string, ParseRule[]>) => {
    state.customParseRules = rules
    await window.electronAPI.setSetting('customParseRules', JSON.parse(JSON.stringify(rules)))
  }

  const saveAdBlockSources = async (sources: AdBlockSource[]) => {
    state.adBlockSources = sources;
    await window.electronAPI.setSetting('adBlockSources', JSON.parse(JSON.stringify(sources)));
  }

  const recompileRules = async () => {
    const cachedData = (await window.electronAPI.getSetting('adBlockCache')) || {};
    const activeData: Record<string, string> = {};
    for (const s of state.adBlockSources) {
      if (s.enabled && cachedData[s.id]) {
        activeData[s.id] = cachedData[s.id];
      }
    }
    await window.electronAPI.compileAdBlockRules(activeData);
  }

  const syncAdBlockSourceItem = async (sourceId: string) => {
    const s = state.adBlockSources.find(item => item.id === sourceId);
    if (!s) return { success: false, count: 0, error: '规则源不存在' };

    const res = await window.electronAPI.syncAdBlockSource(s.url);
    if (res.success) {
      s.ruleCount = res.count;
      s.lastUpdated = Date.now();
      await saveAdBlockSources([...state.adBlockSources]);

      const cachedData = (await window.electronAPI.getSetting('adBlockCache')) || {};
      cachedData[s.id] = res.content || '';
      await window.electronAPI.setSetting('adBlockCache', cachedData);

      await recompileRules();
    }
    return res;
  }

  const syncAllAdBlockSources = async () => {
    const enabledSources = state.adBlockSources.filter(item => item.enabled);
    const cachedData = (await window.electronAPI.getSetting('adBlockCache')) || {};
    let totalSynced = 0;

    for (const s of enabledSources) {
      const res = await window.electronAPI.syncAdBlockSource(s.url);
      if (res.success) {
        s.ruleCount = res.count;
        s.lastUpdated = Date.now();
        cachedData[s.id] = res.content || '';
        totalSynced++;
      }
    }

    await saveAdBlockSources([...state.adBlockSources]);
    await window.electronAPI.setSetting('adBlockCache', cachedData);
    await recompileRules();
    return totalSynced;
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
    saveCustomStyles,
    saveCustomScripts,
    saveCustomParseRules,
    saveAdBlockSources,
    syncAdBlockSourceItem,
    syncAllAdBlockSources,
    recompileRules
  }
}
