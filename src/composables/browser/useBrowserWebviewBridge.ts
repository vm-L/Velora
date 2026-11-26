import type { ComputedRef, Ref } from 'vue';
import type { Tab, Workspace } from '@/composables/useWorkspaces';
import { useSettings } from '@/composables/useSettings';

const TAB_BASE_INJECT_SCRIPT = `
  (function() {
    // 1. Hide custom context menu on webview left click
    if (!window.__clickInjected) {
      window.__clickInjected = true;
      window.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          console.log('__webview_click__');
        }
      }, true);
    }

    // 2. 鼠标中键 / Ctrl+左键 / Meta+左键：在新标签页打开 (与 Chrome 行为完全一致)
    if (!window.__veloraLinkShortcutInjected) {
      window.__veloraLinkShortcutInjected = true;

      function findAnchor(e) {
        try {
          const path = e.composedPath ? e.composedPath() : [];
          for (let i = 0; i < path.length; i++) {
            const el = path[i];
            if (el && el.tagName) {
              const tag = el.tagName.toLowerCase();
              if (tag === 'a' || tag === 'area') {
                return el;
              }
            }
          }
        } catch (err) {}

        if (e.target && typeof e.target.closest === 'function') {
          try {
            return e.target.closest('a, area');
          } catch (err) {}
        }
        return null;
      }

      function handleLinkShortcutClick(e) {
        const isMiddleClick = (e.button === 1);
        const isCtrlOrMetaLeftClick = (e.button === 0 && (e.ctrlKey || e.metaKey));

        if (!isMiddleClick && !isCtrlOrMetaLeftClick) {
          return;
        }

        const anchor = findAnchor(e);
        if (!anchor) return;

        let rawHref = anchor.getAttribute('href');
        if (!rawHref && anchor.getAttribute('xlink:href')) {
          rawHref = anchor.getAttribute('xlink:href');
        }
        if (!rawHref) return;

        const trimmed = rawHref.trim();
        if (!trimmed || trimmed === '#' || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('javascript:')) {
          return;
        }

        let hrefStr = '';
        if (typeof anchor.href === 'string') {
          hrefStr = anchor.href;
        } else if (anchor.href && typeof anchor.href.baseVal === 'string') {
          hrefStr = anchor.href.baseVal;
        } else {
          hrefStr = trimmed;
        }

        let targetUrlObj;
        try {
          targetUrlObj = new URL(hrefStr, window.location.href);
        } catch (err) {
          return;
        }

        if (targetUrlObj.protocol !== 'http:' && targetUrlObj.protocol !== 'https:') {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }

        if (e.shiftKey) {
          console.log('__velora_open_fg_tab__:' + targetUrlObj.href);
        } else {
          console.log('__velora_open_bg_tab__:' + targetUrlObj.href);
        }
      }

      window.addEventListener('click', handleLinkShortcutClick, true);
      window.addEventListener('auxclick', handleLinkShortcutClick, true);
      window.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
          const anchor = findAnchor(e);
          if (anchor) {
            e.preventDefault();
          }
        }
      }, true);
    }
  })();
`;

export interface UseBrowserWebviewBridgeOptions {
  resourceId: () => string;
  workspace: ComputedRef<Workspace | undefined>;
  activeWebview: () => any;
  getResourceIcon: () => string | undefined;
  addTab: (resourceId: string, url: string, favicon?: string, activate?: boolean, isBlank?: boolean) => string | null;
  updateTab: (resourceId: string, tabId: string, data: Partial<Tab>) => void;
  contextMenuVisible: Ref<boolean>;
  syncAddressBar: () => void;
  refreshWebviewStyles: (tabId: string) => Promise<void>;
  refreshWebviewScripts: (tabId: string, runAt: string) => Promise<void>;
  applyDuplicateMarksToTab: (tabId: string) => Promise<void>;
  applyVideoQuickDownloadToTab: (tabId: string) => Promise<void>;
  handleVideoQuickDownload: (rawJson: string, tabId: string) => void;
  flushSniffedBufferForTab: (tabId: string, wcId: number) => void;
  checkDomReadyWaterfall: (tabId: string) => Promise<void>;
  checkAutoApplyWaterfall: (tabId: string) => void;
  onWaterfallTriggerBottom: (tabId: string) => Promise<void>;
  retryWaterfall: (tabId: string) => Promise<void>;
  destroyWaterfallSession: (tabId: string) => Promise<void>;
  scanPanLinksInTab?: (tabId: string) => Promise<void> | void;
}

/**
 * 浏览器工作区 Webview 生命周期事件回调与控制台消息协议桥接逻辑
 */
export function useBrowserWebviewBridge(options: UseBrowserWebviewBridgeOptions) {
  const {
    resourceId,
    workspace,
    activeWebview,
    getResourceIcon,
    addTab,
    updateTab,
    contextMenuVisible,
    syncAddressBar,
    refreshWebviewStyles,
    refreshWebviewScripts,
    applyDuplicateMarksToTab,
    applyVideoQuickDownloadToTab,
    handleVideoQuickDownload,
    flushSniffedBufferForTab,
    checkDomReadyWaterfall,
    checkAutoApplyWaterfall,
    onWaterfallTriggerBottom,
    retryWaterfall,
    destroyWaterfallSession,
    scanPanLinksInTab
  } = options;

  const { state: settingsState, saveExternalSites, saveCmsResources } = useSettings();

  const injectTabBaseScripts = async (tabId: string) => {
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview || typeof webview.executeJavaScript !== 'function') return;

    if (!webview.__veloraConsoleBound) {
      webview.__veloraConsoleBound = true;
      webview.addEventListener('console-message', (e: any) => {
        if (e.message === '__webview_click__') {
          contextMenuVisible.value = false;
        } else if (typeof e.message === 'string' && e.message.startsWith('__velora_open_bg_tab__:')) {
          const targetUrl = e.message.slice('__velora_open_bg_tab__:'.length);
          if (targetUrl && targetUrl !== 'about:blank') {
            addTab(resourceId(), targetUrl, getResourceIcon(), false);
          }
        } else if (typeof e.message === 'string' && e.message.startsWith('__velora_open_fg_tab__:')) {
          const targetUrl = e.message.slice('__velora_open_fg_tab__:'.length);
          if (targetUrl && targetUrl !== 'about:blank') {
            addTab(resourceId(), targetUrl, getResourceIcon(), true);
          }
        } else if (typeof e.message === 'string' && e.message.startsWith('__velora_wf_bottom__:')) {
          const triggerTabId = e.message.slice('__velora_wf_bottom__:'.length);
          onWaterfallTriggerBottom(triggerTabId || tabId);
        } else if (typeof e.message === 'string' && e.message.startsWith('__velora_wf_retry__:')) {
          const triggerTabId = e.message.slice('__velora_wf_retry__:'.length);
          retryWaterfall(triggerTabId || tabId);
        } else if (typeof e.message === 'string' && e.message.startsWith('__velora_video_quick_download__:')) {
          const rawJson = e.message.slice('__velora_video_quick_download__:'.length);
          handleVideoQuickDownload(rawJson, tabId);
        }
      });
    }

    try {
      await webview.executeJavaScript(TAB_BASE_INJECT_SCRIPT);
    } catch {}
  };

  const onDomReady = async (tabId: string) => {
    updateTab(resourceId(), tabId, { loading: false });
    refreshWebviewScripts(tabId, 'dom-ready');
    await injectTabBaseScripts(tabId);
    await applyDuplicateMarksToTab(tabId);
    await applyVideoQuickDownloadToTab(tabId);
    await checkDomReadyWaterfall(tabId);
  };

  const onLoadCommit = async (event: any, tabId: string) => {
    if (event.isMainFrame) {
      refreshWebviewStyles(tabId);
      refreshWebviewScripts(tabId, 'document-start');
      await injectTabBaseScripts(tabId);
    }
  };

  const onStartLoading = (tabId: string) => {
    updateTab(resourceId(), tabId, { loading: true });
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (webview && webview.getWebContentsId) {
      try {
        const wcId = webview.getWebContentsId();
        updateTab(resourceId(), tabId, { webContentsId: wcId });
        flushSniffedBufferForTab(tabId, wcId);
      } catch {
        // ignore
      }
    }
  };

  const onDidNavigate = (event?: any, tabId?: string) => {
    const targetId = tabId || workspace.value?.activeTabId;
    if (targetId) {
      destroyWaterfallSession(targetId);
      let newUrl = event?.url;
      if (!newUrl) {
        const wv = activeWebview();
        if (wv && typeof wv.getURL === 'function') {
          try { newUrl = wv.getURL(); } catch {}
        }
      }
      if (newUrl && newUrl !== 'about:blank') {
        updateTab(resourceId(), targetId, { url: newUrl, sniffedPanLinks: [] });
      }
    }
    syncAddressBar();
  };

  const onStopLoading = (tabId: string) => {
    updateTab(resourceId(), tabId, { loading: false });
    refreshWebviewScripts(tabId, 'document-end');
    checkAutoApplyWaterfall(tabId);
    applyDuplicateMarksToTab(tabId);
    applyVideoQuickDownloadToTab(tabId);
    scanPanLinksInTab?.(tabId);
  };

  const onTitleUpdated = (event: any, tabId: string) => {
    updateTab(resourceId(), tabId, { title: event.title });
  };

  const onFaviconUpdated = async (event: any, tabId: string) => {
    if (event.favicons && event.favicons.length > 0) {
      const faviconUrl = event.favicons[0];
      updateTab(resourceId(), tabId, { favicon: faviconUrl });

      if (!window.electronAPI || !window.electronAPI.fetchImageBase64) return;

      const resId = resourceId();
      let updated = false;
      const isExt = settingsState.externalSites.find(r => r.id === resId);

      if (isExt && (!isExt.icon || isExt.icon.length < 50)) {
        const base64 = await window.electronAPI.fetchImageBase64(faviconUrl);
        if (base64) {
          isExt.icon = base64;
          isExt.iconOriginalUrl = faviconUrl;
          await saveExternalSites([...settingsState.externalSites]);
          updated = true;
        }
      }

      if (!updated) {
        const isCms = settingsState.cmsResources.find(r => r.id === resId);
        if (isCms && (!isCms.icon || isCms.icon.length < 50)) {
          const base64 = await window.electronAPI.fetchImageBase64(faviconUrl);
          if (base64) {
            isCms.icon = base64;
            isCms.iconOriginalUrl = faviconUrl;
            await saveCmsResources([...settingsState.cmsResources]);
          }
        }
      }
    }
  };

  return {
    onDomReady,
    onLoadCommit,
    onStartLoading,
    onDidNavigate,
    onStopLoading,
    onTitleUpdated,
    onFaviconUpdated
  };
}
