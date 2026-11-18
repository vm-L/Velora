import { ref } from 'vue';

export interface PanAccountInfo {
  type: string;
  name: string;
  quotaText?: string;
  totalSpace?: number;
  usedSpace?: number;
  updatedAt: number;
}

const panAccounts = ref<PanAccountInfo[]>([]);
const isLoaded = ref(false);

const PAN_NAME_MAP: Record<string, string> = {
  quark: '夸克网盘',
  uc: 'UC网盘',
  baidu: '百度网盘',
  '123pan': '123云盘',
  xunlei: '迅雷云盘',
  '115': '115网盘',
  lanzou: '蓝奏云',
  '139': '中国移动云盘',
  guangya: '光鸭云盘',
  ilanzou: '蓝奏云优享版'
};

export const usePanAccounts = () => {
  const loadAccounts = async () => {
    if (window.electronAPI?.getPanAccounts) {
      try {
        const list = await window.electronAPI.getPanAccounts();
        panAccounts.value = list || [];
        isLoaded.value = true;
      } catch (err) {
        console.error('Failed to load pan accounts:', err);
      }
    }
  };

  const getPanName = (type: string): string => {
    return PAN_NAME_MAP[type] || type;
  };

  const getAccount = (type: string) => {
    return panAccounts.value.find((a) => a.type === type);
  };

  const refreshQuota = async (type: string): Promise<string | undefined> => {
    if (window.electronAPI?.refreshPanQuota) {
      try {
        const res = await window.electronAPI.refreshPanQuota(type);
        if (res && res.success && res.quotaText) {
          const acc = panAccounts.value.find((a) => a.type === type);
          if (acc) {
            acc.quotaText = res.quotaText;
            acc.usedSpace = res.used;
            acc.totalSpace = res.total;
          }
          return res.quotaText;
        }
      } catch (err) {
        console.error('Failed to refresh pan quota:', err);
      }
    }
    return undefined;
  };

  return {
    panAccounts,
    isLoaded,
    loadAccounts,
    getPanName,
    getAccount,
    refreshQuota
  };
};
