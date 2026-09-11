import { reactive } from 'vue'
import type { ConfigBackupSectionKey } from '../types/backup'

export interface ResourceItem {
  id: string
  name: string
  url: string
  path?: string
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
  localResources: ResourceItem[]
  cmsResources: ResourceItem[]
  externalSites: ResourceItem[]
  customStyles: Record<string, Record<string, string>>
  customScripts: Record<string, CustomScript[]>
  customParseRules: Record<string, ParseRule[]>
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
  localResources: [] as ResourceItem[],
  cmsResources: [] as ResourceItem[],
  externalSites: [] as ResourceItem[],
  customStyles: {} as Record<string, Record<string, string>>,
  customScripts: {} as Record<string, CustomScript[]>,
  customParseRules: {} as Record<string, ParseRule[]>,
  adBlockSources: [] as AdBlockSource[],
  lanShareEnabled: false,
  lanSharePort: 8899,
  lanSharePassword: '',
  lanShareAllowEdit: false,
  loaded: false
})

export const useSettings = () => {
  const loadSettings = async () => {
    if (!window.electronAPI) return;

    // Batch fetch all settings in a single atomic IPC call
    const all = (await window.electronAPI.getAllSettings()) || {};

    state.closeBehavior = all['closeBehavior'] || 'tray'
    state.theme = all['theme'] || 'light'
    state.imageDirectory = all['imageDirectory'] || ''
    state.audioDirectory = all['audioDirectory'] || ''
    state.videoDirectory = all['videoDirectory'] || ''
    state.fileDirectory = all['fileDirectory'] || ''
    state.maxConcurrentDownloads = all['maxConcurrentDownloads'] || 3
    state.maxMemoryBufferMB = all['maxMemoryBufferMB'] || 128
    state.autoMatchDownloadSubdir = all['autoMatchDownloadSubdir'] !== undefined ? all['autoMatchDownloadSubdir'] : true
    state.enableVideoCompress = all['enableVideoCompress'] || false
    const savedTarget = all['videoCompressTargetGB'] ?? all['videoCompressThresholdGB']
    state.videoCompressTargetGB = typeof savedTarget === 'number' ? savedTarget : 1.5
    const savedMinBitrate = all['videoCompressMinBitrateKbps']
    state.videoCompressMinBitrateKbps = typeof savedMinBitrate === 'number' ? savedMinBitrate : 1500
    state.localResources = all['localResources'] || []
    state.cmsResources = all['cmsResources'] || []
    state.externalSites = all['externalSites'] || []
    state.customStyles = all['customStyles'] || {}
    state.customScripts = all['customScripts'] || {}
    state.customParseRules = all['customParseRules'] || {}
    state.lanShareEnabled = all['lanShareEnabled'] || false
    state.lanSharePort = all['lanSharePort'] || 8899
    state.lanSharePassword = all['lanSharePassword'] || ''
    state.lanShareAllowEdit = all['lanShareAllowEdit'] || false

    // Load adblock sources & merge built-ins
    const savedSources: AdBlockSource[] = all['adBlockSources'] || [];
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

    // Background asynchronous adblock rules compilation & update without blocking startup
    const runBackgroundAdBlock = () => {
      recompileRules().finally(() => {
        syncAllAdBlockSources().catch(err => {
          window.electronAPI.log('warn', 'AdBlock', 'Background auto update failed: ' + err.message);
        });
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(runBackgroundAdBlock, { timeout: 3000 });
    } else {
      setTimeout(runBackgroundAdBlock, 1000);
    }
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

  const saveAutoMatchDownloadSubdir = async (enabled: boolean) => {
    state.autoMatchDownloadSubdir = enabled
    await window.electronAPI.setSetting('autoMatchDownloadSubdir', enabled)
  }

  const saveEnableVideoCompress = async (enabled: boolean) => {
    state.enableVideoCompress = enabled
    await window.electronAPI.setSetting('enableVideoCompress', enabled)
  }

  const saveVideoCompressTargetGB = async (gb: number) => {
    state.videoCompressTargetGB = gb
    await window.electronAPI.setSetting('videoCompressTargetGB', gb)
  }

  const saveVideoCompressMinBitrateKbps = async (kbps: number) => {
    state.videoCompressMinBitrateKbps = kbps
    await window.electronAPI.setSetting('videoCompressMinBitrateKbps', kbps)
  }

  const saveLocalResources = async (resources: ResourceItem[]) => {
    state.localResources = resources
    await window.electronAPI.setSetting('localResources', JSON.parse(JSON.stringify(resources)))
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

  const exportConfigBackup = async (selectedKeys: ConfigBackupSectionKey[]) => {
    const payload: any = {
      type: 'velora-config-backup',
      version: '1.3.6',
      timestamp: Date.now(),
      data: {}
    };

    if (selectedKeys.includes('general')) {
      payload.data.general = {
        theme: state.theme,
        closeBehavior: state.closeBehavior
      };
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
      };
    }

    if (selectedKeys.includes('videoCompress')) {
      payload.data.videoCompress = {
        enableVideoCompress: state.enableVideoCompress,
        videoCompressTargetGB: state.videoCompressTargetGB,
        videoCompressMinBitrateKbps: state.videoCompressMinBitrateKbps
      };
    }

    if (selectedKeys.includes('lanShare')) {
      payload.data.lanShare = {
        lanShareEnabled: state.lanShareEnabled,
        lanSharePort: state.lanSharePort,
        lanSharePassword: state.lanSharePassword,
        lanShareAllowEdit: state.lanShareAllowEdit
      };
    }

    if (selectedKeys.includes('externalSites')) {
      const sites = JSON.parse(JSON.stringify(state.externalSites || []));
      payload.data.externalSites = sites;
      // 保持与旧版字段名 webResources 的兼容
      payload.data.webResources = sites;
    }

    if (selectedKeys.includes('localResources')) {
      payload.data.localResources = JSON.parse(JSON.stringify(state.localResources || []));
    }

    if (selectedKeys.includes('cmsResources')) {
      payload.data.cmsResources = JSON.parse(JSON.stringify(state.cmsResources || []));
    }

    if (selectedKeys.includes('customParseRules')) {
      payload.data.customParseRules = JSON.parse(JSON.stringify(state.customParseRules || {}));
    }

    if (selectedKeys.includes('customScripts')) {
      payload.data.customScripts = JSON.parse(JSON.stringify(state.customScripts || {}));
      payload.data.customStyles = JSON.parse(JSON.stringify(state.customStyles || {}));
    }

    if (selectedKeys.includes('adBlockSources')) {
      payload.data.adBlockSources = JSON.parse(JSON.stringify(state.adBlockSources || []));
    }

    return await window.electronAPI.exportResourcesJson(payload);
  };

  const importConfigBackup = async (
    backupData: any,
    selectedKeys: ConfigBackupSectionKey[],
    mode: 'merge' | 'overwrite'
  ) => {
    const data = backupData?.data || {};

    // 1. 常规与外观
    if (selectedKeys.includes('general') && data.general) {
      if (data.general.theme) await setTheme(data.general.theme);
      if (data.general.closeBehavior) await setCloseBehavior(data.general.closeBehavior);
    }

    // 2. 下载与存储
    if (selectedKeys.includes('download') && data.download) {
      const d = data.download;
      if (d.imageDirectory) await saveImageDirectory(d.imageDirectory);
      if (d.audioDirectory) await saveAudioDirectory(d.audioDirectory);
      if (d.videoDirectory) await saveVideoDirectory(d.videoDirectory);
      if (d.fileDirectory) await saveFileDirectory(d.fileDirectory);
      if (typeof d.maxConcurrentDownloads === 'number') await saveMaxConcurrentDownloads(d.maxConcurrentDownloads);
      if (typeof d.maxMemoryBufferMB === 'number') await saveMaxMemoryBufferMB(d.maxMemoryBufferMB);
      if (typeof d.autoMatchDownloadSubdir === 'boolean') await saveAutoMatchDownloadSubdir(d.autoMatchDownloadSubdir);
    }

    // 3. 视频自动压缩
    if (selectedKeys.includes('videoCompress') && data.videoCompress) {
      const v = data.videoCompress;
      if (typeof v.enableVideoCompress === 'boolean') await saveEnableVideoCompress(v.enableVideoCompress);
      if (typeof v.videoCompressTargetGB === 'number') await saveVideoCompressTargetGB(v.videoCompressTargetGB);
      if (typeof v.videoCompressMinBitrateKbps === 'number') await saveVideoCompressMinBitrateKbps(v.videoCompressMinBitrateKbps);
    }

    // 4. 局域网服务
    if (selectedKeys.includes('lanShare') && data.lanShare) {
      const l = data.lanShare;
      await saveLanShareSettings({
        enabled: typeof l.lanShareEnabled === 'boolean' ? l.lanShareEnabled : state.lanShareEnabled,
        port: typeof l.lanSharePort === 'number' ? l.lanSharePort : state.lanSharePort,
        password: typeof l.lanSharePassword === 'string' ? l.lanSharePassword : state.lanSharePassword,
        allowEdit: typeof l.lanShareAllowEdit === 'boolean' ? l.lanShareAllowEdit : state.lanShareAllowEdit
      });
    }

    // 5. 网页资源站点 (兼容新旧字段名 externalSites / webResources)
    const newWebResources: ResourceItem[] = data.externalSites || data.webResources || [];
    if (selectedKeys.includes('externalSites') && newWebResources.length > 0) {
      if (mode === 'overwrite') {
        await saveExternalSites(newWebResources);
      } else {
        const currentWebMap = new Map((state.externalSites || []).map(r => [r.id, r]));
        for (const item of newWebResources) {
          if (!currentWebMap.has(item.id)) {
            currentWebMap.set(item.id, item);
          }
        }
        await saveExternalSites(Array.from(currentWebMap.values()));
      }
    }

    // 6. 本地资源挂载
    const newLocalResources: ResourceItem[] = data.localResources || [];
    if (selectedKeys.includes('localResources') && newLocalResources.length > 0) {
      if (mode === 'overwrite') {
        await saveLocalResources(newLocalResources);
      } else {
        const currentLocalMap = new Map((state.localResources || []).map(r => [r.id, r]));
        for (const item of newLocalResources) {
          if (!currentLocalMap.has(item.id)) {
            currentLocalMap.set(item.id, item);
          }
        }
        await saveLocalResources(Array.from(currentLocalMap.values()));
      }
    }

    // 7. CMS 资源站
    const newCmsResources: ResourceItem[] = data.cmsResources || [];
    if (selectedKeys.includes('cmsResources') && newCmsResources.length > 0) {
      if (mode === 'overwrite') {
        await saveCmsResources(newCmsResources);
      } else {
        const currentCmsMap = new Map((state.cmsResources || []).map(r => [r.id, r]));
        for (const item of newCmsResources) {
          if (!currentCmsMap.has(item.id)) {
            currentCmsMap.set(item.id, item);
          }
        }
        await saveCmsResources(Array.from(currentCmsMap.values()));
      }
    }

    // 8. 域名解析规则
    const newParseRules: Record<string, ParseRule[]> = data.customParseRules || {};
    if (selectedKeys.includes('customParseRules') && Object.keys(newParseRules).length > 0) {
      if (mode === 'overwrite') {
        await saveCustomParseRules(newParseRules);
      } else {
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
      }
    }

    // 9. 自定义注入脚本与样式
    const newScripts: Record<string, CustomScript[]> = data.customScripts || {};
    const newStyles: Record<string, Record<string, string>> = data.customStyles || {};
    if (selectedKeys.includes('customScripts')) {
      if (mode === 'overwrite') {
        if (data.customScripts) await saveCustomScripts(newScripts);
        if (data.customStyles) await saveCustomStyles(newStyles);
      } else {
        if (data.customScripts) {
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
        }
        if (data.customStyles) {
          const mergedStyles = { ...(state.customStyles || {}), ...newStyles };
          await saveCustomStyles(mergedStyles);
        }
      }
    }

    // 10. 广告过滤规则源
    const newAdSources: AdBlockSource[] = data.adBlockSources || [];
    if (selectedKeys.includes('adBlockSources') && newAdSources.length > 0) {
      if (mode === 'overwrite') {
        await saveAdBlockSources(newAdSources);
      } else {
        const currentSourcesMap = new Map(state.adBlockSources.map(s => [s.id, s]));
        for (const s of newAdSources) {
          if (!currentSourcesMap.has(s.id)) {
            currentSourcesMap.set(s.id, s);
          }
        }
        await saveAdBlockSources(Array.from(currentSourcesMap.values()));
      }
      await recompileRules();
    }
  };

  const exportResourceBackup = async () => {
    return await exportConfigBackup(['externalSites', 'localResources', 'cmsResources', 'customParseRules', 'customScripts']);
  };

  const importResourceBackup = async (backupData: any, mode: 'overwrite' | 'merge') => {
    await importConfigBackup(backupData, ['externalSites', 'localResources', 'cmsResources', 'customParseRules', 'customScripts'], mode);
  };

  const saveLanShareEnabled = async (enabled: boolean) => {
    state.lanShareEnabled = enabled;
    await window.electronAPI.setSetting('lanShareEnabled', enabled);
    if (enabled) {
      await window.electronAPI.restartLanServer();
    } else {
      await window.electronAPI.stopLanServer();
    }
  };

  const saveLanSharePort = async (port: number) => {
    state.lanSharePort = port;
    await window.electronAPI.setSetting('lanSharePort', port);
    if (state.lanShareEnabled) {
      await window.electronAPI.restartLanServer();
    }
  };

  const saveLanSharePassword = async (password: string) => {
    state.lanSharePassword = password;
    await window.electronAPI.setSetting('lanSharePassword', password);
    if (state.lanShareEnabled) {
      await window.electronAPI.restartLanServer();
    }
  };

  const saveLanShareAllowEdit = async (allowEdit: boolean) => {
    state.lanShareAllowEdit = allowEdit;
    await window.electronAPI.setSetting('lanShareAllowEdit', allowEdit);
    if (state.lanShareEnabled) {
      await window.electronAPI.restartLanServer();
    }
  };

  const saveLanShareSettings = async (options: { enabled: boolean; port: number; password: string; allowEdit: boolean }) => {
    state.lanShareEnabled = options.enabled;
    state.lanSharePort = options.port;
    state.lanSharePassword = options.password;
    state.lanShareAllowEdit = options.allowEdit;
    await window.electronAPI.setSetting('lanShareEnabled', options.enabled);
    await window.electronAPI.setSetting('lanSharePort', options.port);
    await window.electronAPI.setSetting('lanSharePassword', options.password);
    await window.electronAPI.setSetting('lanShareAllowEdit', options.allowEdit);
    if (options.enabled) {
      return await window.electronAPI.restartLanServer();
    } else {
      await window.electronAPI.stopLanServer();
      return { success: true, running: false };
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
    saveAutoMatchDownloadSubdir,
    saveEnableVideoCompress,
    saveVideoCompressTargetGB,
    saveVideoCompressMinBitrateKbps,
    saveLocalResources,
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
