import { ref, type ComputedRef } from 'vue';
import type { Tab, Workspace } from '@/composables/useWorkspaces';
import { useSettings } from '@/composables/useSettings';
import { useSaveMediaDialog } from '@/composables/useSaveMediaDialog';
import { useMessage } from '@/composables/useMessage';
import { logger } from '@/services/logger';
import { sanitizeFilename } from '@/utils/filename';
import { getVideoQuickDownloadScript } from '@/utils/videoQuickDownloadEngine';

export interface PreviewImage {
  id: string;
  url: string;       // 第一张或唯一图片的 URL（向下兼容）
  urls?: string[];   // 多图模式时传入的完整 URL 列表
  zIndex: number;
  x?: number;
  y?: number;
}

interface SniffedMediaItem {
  webContentsId: number;
  url: string;
  type: 'image' | 'video' | 'audio';
  timestamp: number;
}

export interface UseBrowserMediaSnifferOptions {
  resourceId: () => string;
  workspace: ComputedRef<Workspace | undefined>;
  activeTab: ComputedRef<Tab | undefined>;
  getCurrentPageOrigin: () => string;
  updateTab: (resourceId: string, tabId: string, data: Partial<Tab>) => void;
}

const SNIFFED_LIST_KEY_MAP = {
  image: 'sniffedImages',
  video: 'sniffedVideos',
  audio: 'sniffedAudios'
} as const;

function appendSniffedItemToTab(tab: Tab, data: Pick<SniffedMediaItem, 'type' | 'url' | 'timestamp'>): void {
  const key = SNIFFED_LIST_KEY_MAP[data.type];
  if (!key) return;
  const list = tab[key];
  if (!list.some((m) => m.url === data.url)) {
    list.push({ url: data.url, timestamp: data.timestamp });
  }
}

/**
 * 浏览器工作区媒体嗅探、预览弹窗与快捷下载逻辑
 */
export function useBrowserMediaSniffer(options: UseBrowserMediaSnifferOptions) {
  const { resourceId, workspace, activeTab, getCurrentPageOrigin, updateTab } = options;
  const { state: settingsState } = useSettings();
  const { openSaveMediaDialog } = useSaveMediaDialog();
  const { showMessage } = useMessage();

  const activeImagePreviews = ref<PreviewImage[]>([]);
  let highestZIndex = 1000;

  const activeAudioPreview = ref<string | null>(null);
  const activeVideoPreview = ref<string | null>(null);

  const addImagePreview = (urls: string[]) => {
    if (!urls || urls.length === 0) return;
    highestZIndex++;
    const id = 'preview_img_' + Math.random().toString(36).substr(2, 9);
    const offset = (activeImagePreviews.value.length % 5) * 30;
    activeImagePreviews.value.push({
      id,
      url: urls[0],
      urls,
      zIndex: highestZIndex,
      x: (window.innerWidth / 2 - 200) + offset,
      y: (window.innerHeight / 2 - 150) + offset
    });
  };

  const onClosePreview = (id: string) => {
    activeImagePreviews.value = activeImagePreviews.value.filter(img => img.id !== id);
  };

  const onFocusPreview = (id: string) => {
    const img = activeImagePreviews.value.find(item => item.id === id);
    if (img) {
      highestZIndex++;
      img.zIndex = highestZIndex;
    }
  };

  const onPreviewSniffedAudio = (url: string) => {
    activeAudioPreview.value = url;
  };

  const onPreviewSniffedVideo = (url: string) => {
    activeVideoPreview.value = url;
  };

  const onClearSniffed = (type: 'image' | 'video' | 'audio') => {
    if (activeTab.value) {
      activeTab.value[SNIFFED_LIST_KEY_MAP[type]] = [];
    }
  };

  const onDownloadAudio = (url: string) => {
    let name = '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      name = parts[parts.length - 1] || 'audio.mp3';
    } catch {
      name = 'audio.mp3';
    }
    openSaveMediaDialog({
      url,
      defaultName: name,
      defaultDir: settingsState.audioDirectory,
      type: 'audio',
      pageUrl: getCurrentPageOrigin()
    });
  };

  const onDownloadVideo = (url: string) => {
    let name = '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      name = parts[parts.length - 1] || 'video.mp4';
    } catch {
      name = 'video.mp4';
    }
    openSaveMediaDialog({
      url,
      defaultName: name,
      defaultDir: settingsState.videoDirectory,
      type: 'video',
      pageUrl: getCurrentPageOrigin()
    });
  };

  const applyVideoQuickDownloadToTab = async (tabId: string) => {
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview || typeof webview.executeJavaScript !== 'function') return;

    try {
      const isDark = settingsState.theme === 'dark' || document.documentElement.classList.contains('dark');
      const script = getVideoQuickDownloadScript({
        theme: isDark ? 'dark' : 'light'
      });
      await webview.executeJavaScript(script);
    } catch (err: any) {
      logger.warn('BrowserWorkspace', `执行视频快捷下载脚本失败: ${err?.message || err}`);
    }
  };

  const getBestSniffedVideo = (sniffedVideos: Array<{ url: string; timestamp: number }>): { url: string; timestamp: number } | null => {
    if (!sniffedVideos || sniffedVideos.length === 0) return null;

    // 1. 优先过滤掉单一的音视频切片片段（如 .m4s, .ts）
    const nonFragments = sniffedVideos.filter(item => {
      try {
        const pathname = new URL(item.url).pathname.toLowerCase();
        if (pathname.endsWith('.m4s') || pathname.endsWith('.ts')) return false;
      } catch {}
      return true;
    });

    const candidates = nonFragments.length > 0 ? nonFragments : sniffedVideos;

    // 2. 严格优先查找 .m3u8 完整播放列表
    const m3u8List = candidates.filter(item => {
      try {
        const u = new URL(item.url);
        return u.pathname.toLowerCase().endsWith('.m3u8') || u.href.toLowerCase().includes('.m3u8');
      } catch {
        return false;
      }
    });

    if (m3u8List.length > 0) {
      // 优先选择包含完整主播放源特征（如 time=0、master、playlist）的 m3u8，若无则取最新的一条 m3u8
      const preferred = m3u8List.find(m => m.url.includes('time=0') || m.url.includes('master') || m.url.includes('playlist')) || m3u8List[m3u8List.length - 1];
      return preferred;
    }

    // 3. 其次查找主流直链视频格式
    const directVideos = candidates.filter(item => {
      try {
        const pathname = new URL(item.url).pathname.toLowerCase();
        return /\.(mp4|webm|flv|f4v|mkv|mov|avi|wmv|3gp)$/i.test(pathname);
      } catch {
        return false;
      }
    });

    if (directVideos.length > 0) {
      return directVideos[directVideos.length - 1];
    }

    // 4. 回退到候选列表中最新的一项
    return candidates[candidates.length - 1];
  };

  const handleVideoQuickDownload = (rawJson: string, tabId: string) => {
    let payload: { src?: string; title?: string; pageUrl?: string } = {};
    try {
      payload = JSON.parse(rawJson);
    } catch {
      payload = { src: rawJson };
    }

    const rawSrc = (payload.src || '').trim();
    const pageTitle = (payload.title || '').trim();
    const currentTab = workspace.value?.tabs?.find(t => t.id === tabId);
    const sniffedVideos = currentTab?.sniffedVideos || [];
    const bestSniffed = getBestSniffedVideo(sniffedVideos);

    let targetUrl = '';
    const isRawFragment = rawSrc && (rawSrc.toLowerCase().includes('.m4s') || rawSrc.toLowerCase().includes('.ts'));

    // 1. 若原始 src 是非 blob 直链且不是局部切片（.m4s/.ts），直接使用
    if (rawSrc && (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) && !rawSrc.startsWith('blob:') && !isRawFragment) {
      targetUrl = rawSrc;
    } else if (bestSniffed) {
      // 2. 否则从嗅探器列表中提取最优的完整视频流（如 .m3u8 完整主播放列表）
      targetUrl = bestSniffed.url;
    } else if (rawSrc && !rawSrc.startsWith('blob:')) {
      targetUrl = rawSrc;
    }

    if (targetUrl) {
      let name = '';
      try {
        const u = new URL(targetUrl);
        const parts = u.pathname.split('/');
        name = parts[parts.length - 1] || '';
      } catch {}

      const isHls = targetUrl.toLowerCase().includes('.m3u8');
      if (isHls || !name || !name.includes('.')) {
        name = (pageTitle ? sanitizeFilename(pageTitle) : 'video') + '.mp4';
      } else {
        const hasValidExt = /\.(mp4|webm|mkv|flv|f4v|mov|avi|wmv|3gp)$/i.test(name);
        if (!hasValidExt) {
          name = name.replace(/\.[^.]+$/, '') + '.mp4';
        }
      }

      openSaveMediaDialog({
        url: targetUrl,
        defaultName: name,
        defaultDir: settingsState.videoDirectory,
        type: 'video',
        pageUrl: payload.pageUrl || getCurrentPageOrigin()
      });
      return;
    }

    // 3. 若为 blob 协议且暂未在嗅探器中捕获到直链，弹出 Toast 提示
    showMessage('未捕获到视频直链，请等待视频缓冲或在嗅探器中查看', 'info');
  };

  /**
   * 将按 webContentsId 暂存的嗅探记录回放至已绑定的标签页
   */
  const flushSniffedBufferForTab = (tabId: string, wcId: number) => {
    const win = window as any;
    if (!win._sniffedBuffer || !win._sniffedBuffer.has(wcId)) return;
    const buffered = win._sniffedBuffer.get(wcId);
    const tab = workspace.value?.tabs.find(t => t.id === tabId);
    if (!tab) return;
    for (const data of buffered) {
      appendSniffedItemToTab(tab, data);
    }
    win._sniffedBuffer.delete(wcId);
  };

  /**
   * 订阅主进程广播的媒体嗅探事件并返回取消监听函数
   */
  const setupMediaSniffedListener = (): (() => void) => {
    if (!window.electronAPI?.onMediaSniffed) {
      return () => {};
    }

    return window.electronAPI.onMediaSniffed((data: SniffedMediaItem) => {
      // data: { webContentsId: number, url: string, type: 'image'|'video'|'audio', timestamp: number }
      if (!workspace.value) return;

      let matchedTab = workspace.value.tabs.find(t => t.webContentsId === data.webContentsId);

      if (!matchedTab) {
        const webviews = document.querySelectorAll('webview') as NodeListOf<any>;
        for (const wv of webviews) {
          try {
            if (wv.getWebContentsId && wv.getWebContentsId() === data.webContentsId) {
              const tabId = wv.id.replace('webview-', '');
              matchedTab = workspace.value.tabs.find(t => t.id === tabId);
              if (matchedTab) {
                updateTab(resourceId(), tabId, { webContentsId: data.webContentsId });
              }
              break;
            }
          } catch {}
        }
      }

      if (!matchedTab) {
        const win = window as any;
        if (!win._sniffedBuffer) win._sniffedBuffer = new Map();
        if (!win._sniffedBuffer.has(data.webContentsId)) {
          if (win._sniffedBuffer.size >= 20) {
            const oldestKey = win._sniffedBuffer.keys().next().value;
            if (oldestKey !== undefined) win._sniffedBuffer.delete(oldestKey);
          }
          win._sniffedBuffer.set(data.webContentsId, []);
        }
        const buf = win._sniffedBuffer.get(data.webContentsId);
        buf.push(data);
        if (buf.length > 50) {
          buf.shift();
        }
        return;
      }

      appendSniffedItemToTab(matchedTab, data);
    });
  };

  return {
    activeImagePreviews,
    addImagePreview,
    onClosePreview,
    onFocusPreview,
    activeAudioPreview,
    activeVideoPreview,
    onPreviewSniffedAudio,
    onPreviewSniffedVideo,
    onClearSniffed,
    onDownloadAudio,
    onDownloadVideo,
    applyVideoQuickDownloadToTab,
    getBestSniffedVideo,
    handleVideoQuickDownload,
    flushSniffedBufferForTab,
    setupMediaSniffedListener
  };
}
