<template>
  <div class="browser-workspace">
    <!-- Tab Bar -->
    <div class="tab-bar">
      <div v-for="tab in workspace?.tabs || []" :key="tab.id" class="tab"
        :class="{ active: workspace?.activeTabId === tab.id }" @click="setActiveTab(tab.id)">
        <div class="tab-favicon">
          <img v-if="tab.favicon" :src="tab.favicon" referrerpolicy="no-referrer" />
          <div v-else class="favicon-placeholder" :class="{ loading: tab.loading }"></div>
        </div>
        <div class="tab-title">{{ tab.title }}</div>
        <button class="tab-close" @click.stop="onCloseTab(tab.id)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- New Tab Button -->
      <button class="new-tab-btn" @click="onAddDefaultTab">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>

    <!-- Function Bar -->
    <div class="function-bar">
      <div class="func-spacer"></div>
      <div class="func-group">
        <button class="func-btn" data-tooltip="注入样式" @click="inspectorVisible = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="currentColor" stroke="none">CSS</text>
          </svg>
        </button>

        <button class="func-btn" :class="{ 'active': isPickingElementImage }" data-tooltip="选取图片"
          @click="pickElementImage">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 3 7 12 9 9 12 7 3 3" fill="currentColor" stroke="currentColor" stroke-width="2"
              stroke-linejoin="round"></polygon>
            <rect x="11" y="12" width="11" height="9" rx="1.5" ry="1.5" stroke="currentColor" stroke-width="2"
              fill="none"></rect>
            <circle cx="14" cy="15" r="0.5" fill="currentColor" stroke="none"></circle>
            <path d="M11 19l3-3l2.5 2.5l2.5-3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
              stroke-linejoin="round" fill="none"></path>
          </svg>
        </button>

        <SnifferDropdown type="video" title="视频嗅探器" tooltip="视频嗅探器" :items="activeTab?.sniffedVideos || []"
          @clear="onClearSniffed('video')">
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="2" y1="7" x2="7" y2="7"></line>
              <line x1="2" y1="17" x2="7" y2="17"></line>
              <line x1="17" y1="17" x2="22" y2="17"></line>
              <line x1="17" y1="7" x2="22" y2="7"></line>
            </svg>
          </template>
        </SnifferDropdown>
        <div class="func-divider"></div>
        <button class="func-btn" data-tooltip="后退" @click="onBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <button class="func-btn" data-tooltip="前进" @click="onForward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
        <button class="func-btn" data-tooltip="刷新" @click="onRefresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        <div class="func-divider"></div>
        <button class="func-btn" data-tooltip="开发者工具" @click="onDevTools">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </button>

      </div>
    </div>

    <!-- Webviews -->
    <div class="webview-container" :class="{ 'pointer-disabled': isInteracting }">
      <webview v-for="tab in workspace?.tabs || []" :key="tab.id" v-show="workspace?.activeTabId === tab.id"
        :src="tab.url" :id="`webview-${tab.id}`" class="webview-el" @dom-ready="onDomReady(tab.id)"
        @load-commit="onLoadCommit($event, tab.id)"
        @page-title-updated="onTitleUpdated($event, tab.id)" @page-favicon-updated="onFaviconUpdated($event, tab.id)"
        @did-start-loading="onStartLoading(tab.id)" @did-stop-loading="onStopLoading(tab.id)"
        @context-menu="handleWebviewContextMenu($event, tab.id)" allowpopups></webview>
    </div>

    <!-- Inspector Dialog -->
    <InspectorDialog v-model="inspectorVisible" :url="activeTab?.url || ''"
      :domain-rules="settingsState.customStyles[resourceId] || {}" @applyPreview="onApplyPreview" @save="onSaveRules" 
      @interaction-start="isInteracting = true"
      @interaction-end="isInteracting = false" />

    <!-- Image Preview Dialogs -->
    <ImagePreviewDialog v-for="img in activeImagePreviews" :key="img.id" :id="img.id" :url="img.url" :urls="img.urls"
      :zIndex="img.zIndex" :initialX="img.x" :initialY="img.y" @close="onClosePreview" @focus="onFocusPreview"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <!-- Custom Context Menu -->
    <div v-show="contextMenuVisible" class="context-menu"
      :style="{ top: contextMenuPos.y + 'px', left: contextMenuPos.x + 'px' }">
      <div class="menu-item" @click="triggerPickImage">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <polygon points="3 3 7 12 9 9 12 7 3 3" fill="currentColor"></polygon>
          <rect x="11" y="12" width="11" height="9" rx="1.5" ry="1.5" fill="none"></rect>
          <circle cx="14" cy="15" r="0.5" fill="currentColor" stroke="none"></circle>
          <path d="M11 19l3-3l2.5 2.5l2.5-3.5l2 2" fill="none"></path>
        </svg>
        <span>选取图片</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useWorkspaces } from '../composables/useWorkspaces';
import { useSettings } from '../composables/useSettings';
import { useMessage } from '../composables/useMessage';

import InspectorDialog from './InspectorDialog.vue';
import SnifferDropdown from './SnifferDropdown.vue';
import ImagePreviewDialog from './ImagePreviewDialog.vue';
import { APP_PREFIX } from '../constants';


const props = defineProps<{
  resourceId: string;
  resourceUrl: string;
}>();

const { initWorkspace, getWorkspace, addTab, closeTab, updateTab } = useWorkspaces();
const { state: settingsState, saveCustomStyles, saveExternalSites, saveCmsResources } = useSettings();

const contextMenuVisible = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuTabId = ref('');

const handleWebviewContextMenu = (e: any, tabId: string) => {
  if (isPickingElementImage.value) return;
  e.preventDefault();

  const params = e.params || (e as any).detail?.params || (e as any).nativeEvent?.params || e;
  const px = typeof params?.x === 'number' ? params.x : 0;
  const py = typeof params?.y === 'number' ? params.y : 0;

  contextMenuPos.value = {
    x: px,
    y: py
  };
  contextMenuTabId.value = tabId;
  contextMenuVisible.value = true;
};

const triggerPickImage = () => {
  contextMenuVisible.value = false;
  pickElementImage();
};

const workspace = computed(() => getWorkspace(props.resourceId));
const activeTab = computed(() => workspace.value?.tabs.find(t => t.id === workspace.value?.activeTabId));

const getResourceIcon = () => {
  const isExt = settingsState.externalSites.find(r => r.id === props.resourceId);
  if (isExt?.icon) return isExt.icon;
  return undefined;
};

const init = () => {
  if (props.resourceId && props.resourceUrl) {
    initWorkspace(props.resourceId, props.resourceUrl, getResourceIcon());
  }
};

onMounted(() => {
  init();
  if (window.electronAPI && window.electronAPI.onWebviewNewWindow) {
    window.electronAPI.onWebviewNewWindow((url) => {
      // Add as new tab in current workspace
      addTab(props.resourceId, url, getResourceIcon());
    });
  }

  if (window.electronAPI && window.electronAPI.onMediaSniffed) {
    window.electronAPI.onMediaSniffed((data: any) => {
      // data: { webContentsId: number, url: string, type: 'image'|'video', timestamp: number }
      if (!workspace.value) return;

      for (const tab of workspace.value.tabs) {
        if (tab.webContentsId === data.webContentsId) {
          if (data.type === 'image') {
            if (!tab.sniffedImages.some(m => m.url === data.url)) {
              tab.sniffedImages.push({ url: data.url, timestamp: data.timestamp });
            }
          } else if (data.type === 'video') {
            if (!tab.sniffedVideos.some(m => m.url === data.url)) {
              tab.sniffedVideos.push({ url: data.url, timestamp: data.timestamp });
            }
          }
          break;
        }
      }
    });
  }

  // Click-away to close context menu
  window.addEventListener('click', handleWindowClick);
  // Global hotkeys
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleWindowClick);
  window.removeEventListener('keydown', handleGlobalKeydown);
});

const handleWindowClick = () => {
  contextMenuVisible.value = false;
};

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'F5') {
    e.preventDefault();
    onRefresh();
  } else if (e.key === 'F12') {
    e.preventDefault();
    onDevTools();
  }
};

watch(() => props.resourceId, () => {
  init();
});

watch(() => workspace.value?.tabs.length, (newLen) => {
  if (newLen === 0) {
    // Re-create default tab when all tabs are closed
    initWorkspace(props.resourceId, props.resourceUrl, getResourceIcon());
  }
});

watch(() => activeTab.value?.id, async (_newTabId, oldTabId) => {
  if (oldTabId) {
    const webview = document.getElementById(`webview-${oldTabId}`) as any;
    if (webview) {
      try {

        if (isPickingElementImage.value) {
          await webview.executeJavaScript(`
            if (window.__imgElementPickerCancel) window.__imgElementPickerCancel();
          `);
        }
      } catch (e) { }
    }
  }

  isPickingElementImage.value = false;
});

const setActiveTab = (tabId: string) => {
  if (workspace.value) {
    workspace.value.activeTabId = tabId;
  }
};

const onCloseTab = (tabId: string) => {
  closeTab(props.resourceId, tabId);
};

const onAddDefaultTab = () => {
  addTab(props.resourceId, props.resourceUrl, getResourceIcon());
};

// Webview Events
const onDomReady = async (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false });

  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (webview) {
    // Listen to console-message to hide custom context menu on webview left click
    webview.addEventListener('console-message', (e: any) => {
      if (e.message === '__webview_click__') {
        contextMenuVisible.value = false;
      }
    });

    const clickScript = `
      (function() {
        if (window.__clickInjected) return;
        window.__clickInjected = true;
        window.addEventListener('mousedown', (e) => {
          if (e.button === 0) { // left click
            console.log('__webview_click__');
          }
        }, true);
      })();
    `;
    webview.executeJavaScript(clickScript);
  }
};

const matchPattern = (pattern: string, url: string) => {
  let regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '.*');
  
  regexPattern = regexPattern.replace(/:\/\/\.\*\\\./g, '://(?:.*\\.)?');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(url);
};

const onLoadCommit = async (event: any, tabId: string) => {
  if (event.isMainFrame) {
    refreshWebviewStyles(tabId);
  }
};

const refreshWebviewStyles = async (tabId: string) => {
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview) return;

  try {
    const urlStr = webview.getURL();
    const stylesObj = settingsState.customStyles[props.resourceId];
    let cssText = '';

    if (stylesObj) {
      for (const [pattern, rules] of Object.entries(stylesObj)) {
        let isMatch = false;
        if (!pattern.includes('*') && !pattern.includes('/')) {
          try {
            isMatch = new URL(urlStr).hostname.endsWith(pattern);
          } catch(e) {}
        } else {
          isMatch = matchPattern(pattern, urlStr);
        }

        if (isMatch) {
          cssText += `${rules}\n`;
        }
      }
    }

    if (cssText) {
      await webview.insertCSS(cssText, { cssOrigin: 'user' });
    }
  } catch (e) {
    console.warn('Failed to inject CSS via insertCSS', e);
  }
};

const onStartLoading = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: true });
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (webview && webview.getWebContentsId) {
    try {
      const wcId = webview.getWebContentsId();
      updateTab(props.resourceId, tabId, { webContentsId: wcId });
    } catch (e) {
      // ignore
    }
  }
};

const onStopLoading = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false });
};

const onTitleUpdated = (event: any, tabId: string) => {
  updateTab(props.resourceId, tabId, { title: event.title });
};

const onFaviconUpdated = async (event: any, tabId: string) => {
  if (event.favicons && event.favicons.length > 0) {
    const faviconUrl = event.favicons[0];
    updateTab(props.resourceId, tabId, { favicon: faviconUrl });

    // Ensure electronAPI is available
    if (!window.electronAPI || !window.electronAPI.fetchImageBase64) return;

    let updated = false;
    const isExt = settingsState.externalSites.find(r => r.id === props.resourceId);
    
    if (isExt && (isExt.iconOriginalUrl !== faviconUrl || !isExt.icon || isExt.icon.length < 50)) {
      const base64 = await window.electronAPI.fetchImageBase64(faviconUrl);
      if (base64) {
        isExt.icon = base64;
        isExt.iconOriginalUrl = faviconUrl;
        await saveExternalSites([...settingsState.externalSites]);
        updated = true;
      }
    }

    if (!updated) {
      const isCms = settingsState.cmsResources.find(r => r.id === props.resourceId);
      if (isCms && (isCms.iconOriginalUrl !== faviconUrl || !isCms.icon || isCms.icon.length < 50)) {
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

// Function Bar Actions
const activeWebview = () => {
  if (!workspace.value?.activeTabId) return null;
  return document.getElementById(`webview-${workspace.value.activeTabId}`) as any;
};

const onBack = () => {
  const wv = activeWebview();
  if (wv && wv.canGoBack()) wv.goBack();
};

const onForward = () => {
  const wv = activeWebview();
  if (wv && wv.canGoForward()) wv.goForward();
};

const onRefresh = () => {
  const wv = activeWebview();
  if (wv) wv.reload();
};

const onDevTools = () => {
  const wv = activeWebview();
  if (wv) wv.openDevTools();
};



const onClearSniffed = (type: 'image' | 'video') => {
  if (activeTab.value) {
    if (type === 'image') {
      activeTab.value.sniffedImages = [];
    } else {
      activeTab.value.sniffedVideos = [];
    }
  }
};

// Image Preview Logic
interface PreviewImage {
  id: string;
  url: string;       // 第一张或唯一图片的 URL（向下兼容）
  urls?: string[];   // 多图模式时传入的完整 URL 列表
  zIndex: number;
  x?: number;
  y?: number;
}

const activeImagePreviews = ref<PreviewImage[]>([]);
let highestZIndex = 1000;

const onClosePreview = (id: string) => {
  activeImagePreviews.value = activeImagePreviews.value.filter(img => img.id !== id);
};

const onFocusPreview = (id: string) => {
  const img = activeImagePreviews.value.find(img => img.id === id);
  if (img) {
    highestZIndex++;
    img.zIndex = highestZIndex;
  }
};

// Element Picker Logic
const inspectorVisible = ref(false);
const inspectorSelector = ref('');
const isInteracting = ref(false);
const isPickingElementImage = ref(false);



/**
 * 选取图片：与选取元素操作流程相同，但点击后收集元素内所有图片资源，
 * 清洗 URL（去 query/fragment/@ 后内容），去重后展示在 ImagePreviewDialog 中。
 */
const pickElementImage = async () => {
  if (!workspace.value?.activeTabId) return;
  const webview = document.getElementById(`webview-${workspace.value.activeTabId}`) as any;
  if (!webview) return;

  // 再次点击则取消拾取模式
  if (isPickingElementImage.value) {
    try {
      await webview.executeJavaScript(`
        if (window.__imgElementPickerCancel) window.__imgElementPickerCancel();
      `);
    } catch (e) { }
    isPickingElementImage.value = false;
    return;
  }

  isPickingElementImage.value = true;

  const pickerScript = `
    new Promise((resolve) => {
      if (window.__imgElementPickerActive) {
        if (window.__imgElementPickerCancel) window.__imgElementPickerCancel();
      }
      window.__imgElementPickerActive = true;

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '2147483647';
      overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
      overlay.style.border = '2px solid #3b82f6';
      overlay.style.transition = 'all 0.1s ease';
      document.body.appendChild(overlay);

      const tooltip = document.createElement('div');
      tooltip.style.position = 'fixed';
      tooltip.style.zIndex = '2147483647';
      tooltip.style.backgroundColor = '#1e293b';
      tooltip.style.color = '#ffffff';
      tooltip.style.padding = '4px 8px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.fontSize = '12px';
      tooltip.style.fontFamily = 'system-ui, sans-serif';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      tooltip.style.display = 'none';
      tooltip.style.transition = 'all 0.1s ease';
      document.body.appendChild(tooltip);

      let currentEl = null;
      let selectedEl = null;
      let path = [];
      let pathIndex = 0;
      let childOverlays = [];

      const cleanUrl = (raw) => {
        if (!raw || raw.startsWith('data:')) return raw;
        try {
          const parsed = new URL(raw, window.location.href);
          let clean = parsed.origin + parsed.pathname;
          const atIdx = clean.indexOf('@');
          if (atIdx !== -1) clean = clean.substring(0, atIdx);
          return clean + parsed.search;
        } catch {
          return raw;
        }
      };

      const collectImages = (root) => {
        const urls = new Set();
        const elements = [root, ...root.querySelectorAll('*')];
        for (const el of elements) {
          if (el.tagName && el.tagName.toLowerCase() === 'img') {
            if (el.src) urls.add(cleanUrl(el.src));
            if (el.srcset) {
              el.srcset.split(',').forEach(part => {
                const u = part.trim().split(/\\s+/)[0];
                if (u) urls.add(cleanUrl(u));
              });
            }
          }
          try {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage;
            if (bg && bg !== 'none') {
              const re = /url\\(["']?(.*?)["']?\\)/g;
              let m;
              while ((m = re.exec(bg)) !== null) {
                if (m[1] && !m[1].startsWith('data:')) {
                  urls.add(cleanUrl(m[1]));
                }
              }
            }
          } catch {}
        }
        return [...urls].filter(Boolean);
      };

      const getAffectedImages = (root) => {
        let list = [];
        const walk = (node) => {
          if (!node) return;
          let isImg = node.tagName.toLowerCase() === 'img';
          if (!isImg) {
            try {
              const style = window.getComputedStyle(node);
              const bg = style.backgroundImage;
              if (bg && bg !== 'none' && bg.includes('url')) {
                isImg = true;
              }
            } catch(e) {}
          }
          if (isImg) {
            list.push(node);
          } else {
            for (const child of node.children) {
              walk(child);
            }
          }
        };
        walk(root);
        return list;
      };

      const updateHighlight = (el) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.display = 'block';

        let tagName = el.tagName.toLowerCase();
        let className = el.className ? '.' + [...el.classList].join('.') : '';
        if (className.length > 20) className = className.substring(0, 20) + '...';

        let imgCount = collectImages(el).length;

        let levelText = pathIndex === 0 ? ' (滚轮切换选择器范围)' : ' (层级 +' + pathIndex + ')';
        tooltip.textContent = tagName + className + levelText + ' - 包含图片: ' + imgCount + ' 张';

        let h = 220; // brand blue
        overlay.style.borderColor = '#3b82f6';
        overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
        tooltip.style.backgroundColor = '#1e293b';

        // Child highlighting for multiple levels
        childOverlays.forEach(o => o.style.display = 'none');
        if (pathIndex > 0) {
          const children = getAffectedImages(el);
          children.forEach((child, idx) => {
            let childOverlay = childOverlays[idx];
            if (!childOverlay) {
              childOverlay = document.createElement('div');
              childOverlay.style.position = 'fixed';
              childOverlay.style.pointerEvents = 'none';
              childOverlay.style.zIndex = '2147483646';
              childOverlay.style.border = '1px dashed #3b82f6'; // dashed blue border
              childOverlay.style.backgroundColor = 'transparent';
              childOverlay.style.transition = 'all 0.1s ease';
              document.body.appendChild(childOverlay);
              childOverlays.push(childOverlay);
            }
            const crect = child.getBoundingClientRect();
            childOverlay.style.top = crect.top + 'px';
            childOverlay.style.left = crect.left + 'px';
            childOverlay.style.width = crect.width + 'px';
            childOverlay.style.height = crect.height + 'px';
            childOverlay.style.display = 'block';
          });
        }

        let topPos = rect.top - 28;
        if (topPos < 5) topPos = rect.top + 5;
        let leftPos = rect.left + 5;

        tooltip.style.top = topPos + 'px';
        tooltip.style.left = leftPos + 'px';
        tooltip.style.display = 'block';
      };

      const onMouseOver = (e) => {
        e.stopPropagation();
        if (e.target === currentEl) return;
        currentEl = e.target;
        path = [];
        let temp = currentEl;
        while (temp && temp.tagName.toLowerCase() !== 'html') {
          path.push(temp);
          temp = temp.parentElement;
        }
        pathIndex = 0;
        selectedEl = path[pathIndex];
        updateHighlight(selectedEl);
      };

      const onWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          if (pathIndex < path.length - 1) {
            pathIndex++;
            selectedEl = path[pathIndex];
            updateHighlight(selectedEl);
          }
        } else if (e.deltaY > 0) {
          if (pathIndex > 0) {
            pathIndex--;
            selectedEl = path[pathIndex];
            updateHighlight(selectedEl);
          }
        }
      };

      const onContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        resolve([]);
      };

      const cleanup = () => {
        try { document.body.removeChild(overlay); } catch(e) {}
        try { document.body.removeChild(tooltip); } catch(e) {}
        childOverlays.forEach(o => {
          try { document.body.removeChild(o); } catch(e){}
        });
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('wheel', onWheel, { capture: true, passive: false });
        document.removeEventListener('contextmenu', onContextMenu, true);
        window.__imgElementPickerActive = false;
        window.__imgElementPickerCancel = null;
      };

      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const urls = collectImages(selectedEl || e.target);
        cleanup();
        resolve(urls);
      };

      window.__imgElementPickerCancel = () => {
        cleanup();
        resolve([]);
      };

      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('wheel', onWheel, { capture: true, passive: false });
      document.addEventListener('contextmenu', onContextMenu, true);
    })
  `;

  try {
    const urls: string[] = await webview.executeJavaScript(pickerScript);
    isPickingElementImage.value = false;
    if (urls && urls.length > 0) {
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
    }
  } catch (e) {
    isPickingElementImage.value = false;
  }
};


const onApplyPreview = async (cssString: string) => {
  if (!workspace.value?.activeTabId) return;
  const webview = document.getElementById(`webview-${workspace.value.activeTabId}`) as any;
  if (!webview) return;

  const code = `
    (function() {
      let style = document.getElementById('${APP_PREFIX}-live-style');
      if (!style) {
        style = document.createElement('style');
        style.id = '${APP_PREFIX}-live-style';
        document.head.appendChild(style);
      }
      style.innerHTML = ${JSON.stringify(cssString || '')};
    })();
  `;
  webview.executeJavaScript(code);
};

const onSaveRules = async (domain: string, cssString: string) => {
  if (!domain) return;

  const newStyles = { ...settingsState.customStyles };
  if (!newStyles[props.resourceId]) newStyles[props.resourceId] = {};
  
  if (cssString.trim()) {
    newStyles[props.resourceId][domain] = cssString;
  } else {
    delete newStyles[props.resourceId][domain];
  }

  await saveCustomStyles(newStyles);
  if (workspace.value?.activeTabId) {
    refreshWebviewStyles(workspace.value.activeTabId);
  }
};

// Removed currentDomainRules and onDeleteRule
</script>

<style scoped lang="less">
.browser-workspace {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #f1f5f9;
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: flex-end;
  height: 44px;
  background: #e2e8f0;
  padding: 0 8px;
  gap: 4px;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}

.tab {
  display: flex;
  align-items: center;
  height: 36px;
  min-width: 120px;
  max-width: 240px;
  background: transparent;
  border-radius: 10px 10px 0 0;
  padding: 0 12px;
  cursor: pointer;
  transition: background-color 0.2s, max-width 0.2s;
  flex: 1;
  position: relative;
}

.tab:hover:not(.active) {
  background: rgba(255, 255, 255, 0.4);
}

.tab.active {
  background: #ffffff;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.02);
  z-index: 2;
}

.tab.active::before,
.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  width: 10px;
  height: 10px;
}

/* Rounded inverted corners for active tab */
.tab.active::before {
  left: -10px;
  background: radial-gradient(circle at 0 0, transparent 10px, #ffffff 10px);
}

.tab.active::after {
  right: -10px;
  background: radial-gradient(circle at 10px 0, transparent 10px, #ffffff 10px);
}

.tab-favicon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.tab-favicon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.favicon-placeholder {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #cbd5e1;
}

.favicon-placeholder.loading {
  background: transparent;
  border: 2px solid #cbd5e1;
  border-top-color: #3b82f6;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tab-title {
  font-size: 13px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  line-height: 1;
}

.tab.active .tab-title {
  color: #0f172a;
  font-weight: 500;
}

.tab-close {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: #64748b;
  opacity: 0;
  transition: opacity 0.2s, background-color 0.2s;
  margin-left: 4px;
}

.tab-close svg {
  display: block;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: #e2e8f0;
  color: #ef4444;
}

.new-tab-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: transparent;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: #64748b;
  margin-left: 4px;
  margin-bottom: 3px;
  transition: background-color 0.2s;
}

.new-tab-btn:hover {
  background: rgba(255, 255, 255, 0.5);
  color: #334155;
}

/* Function Bar */
.function-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: #ffffff;
  padding: 0 12px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.func-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.func-divider {
  width: 1px;
  height: 16px;
  background-color: #cbd5e1;
  margin: 0 4px;
}

.func-spacer {
  flex: 1;
}

.func-btn {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s ease;
}

.func-btn svg {
  display: block;
}

.func-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.func-btn.active {
  background: #3b82f6;
  color: #ffffff;
}

.func-btn.active:hover {
  background: #2563eb;
  color: #ffffff;
}

/* Custom CSS Tooltip */
.func-btn::before,
.func-btn::after {
  position: absolute;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transition-delay: 0.1s;
  pointer-events: none;
  z-index: 100;
}

/* Tooltip text */
.func-btn::before {
  content: attr(data-tooltip);
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(4px) scale(0.95);
  background: #1e293b;
  color: #ffffff;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
}

/* Tooltip arrow */
.func-btn::after {
  content: '';
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-2px);
  border-width: 6px;
  border-style: solid;
  border-color: transparent transparent #1e293b transparent;
}

.func-btn:hover::before {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(8px) scale(1);
}

.func-btn:hover::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(2px);
}

.webview-container {
  flex: 1;
  position: relative;
  background: #ffffff;
}

.webview-el {
  width: 100%;
  height: 100%;
  border: none;
}

.pointer-disabled webview {
  pointer-events: none;
}

/* Custom Context Menu */
.context-menu {
  position: fixed;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.02);
  padding: 4px;
  width: 140px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;
  animation: menu-show 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes menu-show {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #334155;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.menu-item:hover {
  background: #3b82f6;
  color: #ffffff;
}

.menu-item svg {
  flex-shrink: 0;
}
</style>
