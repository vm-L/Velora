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
  value: string;
  regex?: string;
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
  enableVideoCompress: false,
  videoCompressThresholdGB: 1.5,
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
    state.enableVideoCompress = (await window.electronAPI.getSetting('enableVideoCompress')) || false
    const savedThreshold = await window.electronAPI.getSetting('videoCompressThresholdGB')
    state.videoCompressThresholdGB = typeof savedThreshold === 'number' ? savedThreshold : 1.5
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

  const saveEnableVideoCompress = async (enabled: boolean) => {
    state.enableVideoCompress = enabled
    await window.electronAPI.setSetting('enableVideoCompress', enabled)
  }

  const saveVideoCompressThresholdGB = async (gb: number) => {
    state.videoCompressThresholdGB = gb
    await window.electronAPI.setSetting('videoCompressThresholdGB', gb)
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

  const exportResourceBackup = async () => {
    const payload = {
      type: 'velora-resource-backup',
      version: '1.0.0',
      timestamp: Date.now(),
      data: {
        webResources: JSON.parse(JSON.stringify(state.externalSites || [])),
        customParseRules: JSON.parse(JSON.stringify(state.customParseRules || {})),
        customScripts: JSON.parse(JSON.stringify(state.customScripts || {})),
        cmsResources: JSON.parse(JSON.stringify(state.cmsResources || []))
      }
    };
    return await window.electronAPI.exportResourcesJson(payload);
  };

  const importResourceBackup = async (backupData: any, mode: 'overwrite' | 'merge') => {
    const data = backupData?.data || {};
    const newWebResources: ResourceItem[] = data.webResources || [];
    const newParseRules: Record<string, ParseRule[]> = data.customParseRules || {};
    const newScripts: Record<string, CustomScript[]> = data.customScripts || {};
    const newCmsResources: ResourceItem[] = data.cmsResources || [];

    if (mode === 'overwrite') {
      await saveExternalSites(newWebResources);
      await saveCustomParseRules(newParseRules);
      await saveCustomScripts(newScripts);
      await saveCmsResources(newCmsResources);
    } else {
      // 增量合并模式
      const currentWebMap = new Map((state.externalSites || []).map(r => [r.id, r]));
      for (const item of newWebResources) {
        if (!currentWebMap.has(item.id)) {
          currentWebMap.set(item.id, item);
        }
      }
      await saveExternalSites(Array.from(currentWebMap.values()));

      const mergedRules: Record<string, ParseRule[]> = { ...(state.customParseRules || {}) };
      for (const [resId, rules] of Object.entries(newParseRules)) {
        if (!mergedRules[resId]) {
          mergedRules[resId] = rules;
        } else {
          const existingIds = new Set(mergedRules[resId].map(r => r.id));
          for (const rule of rules) {
            if (!existingIds.has(rule.id)) {
              mergedRules[resId].push(rule);
            }
          }
        }
      }
      await saveCustomParseRules(mergedRules);

      const mergedScripts: Record<string, CustomScript[]> = { ...(state.customScripts || {}) };
      for (const [resId, scripts] of Object.entries(newScripts)) {
        if (!mergedScripts[resId]) {
          mergedScripts[resId] = scripts;
        } else {
          const existingIds = new Set(mergedScripts[resId].map(s => s.id));
          for (const script of scripts) {
            if (!existingIds.has(script.id)) {
              mergedScripts[resId].push(script);
            }
          }
        }
      }
      await saveCustomScripts(mergedScripts);

      const currentCmsMap = new Map((state.cmsResources || []).map(r => [r.id, r]));
      for (const item of newCmsResources) {
        if (!currentCmsMap.has(item.id)) {
          currentCmsMap.set(item.id, item);
        }
      }
      await saveCmsResources(Array.from(currentCmsMap.values()));
    }
  };

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
    saveEnableVideoCompress,
    saveVideoCompressThresholdGB,
    saveCmsResources, 
    saveExternalSites, 
    saveCustomStyles,
    saveCustomScripts,
    saveCustomParseRules,
    saveAdBlockSources,
    syncAdBlockSourceItem,
    syncAllAdBlockSources,
    recompileRules,
    exportResourceBackup,
    importResourceBackup
  }
}
