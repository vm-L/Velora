<template>
  <div class="browser-workspace">
    <!-- Tab Bar -->
    <div class="tab-bar">
      <div v-for="tab in workspace?.tabs || []" :key="tab.id"
           class="tab" :class="{ active: workspace?.activeTabId === tab.id }"
           @click="setActiveTab(tab.id)">
        <div class="tab-favicon">
          <img v-if="tab.favicon" :src="tab.favicon" referrerpolicy="no-referrer" />
          <div v-else class="favicon-placeholder" :class="{ loading: tab.loading }"></div>
        </div>
        <div class="tab-title">{{ tab.title }}</div>
        <button class="tab-close" @click.stop="onCloseTab(tab.id)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <!-- New Tab Button -->
      <button class="new-tab-btn" @click="onAddDefaultTab">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>

    <!-- Function Bar -->
    <div class="function-bar">
      <div class="func-spacer"></div>
      <div class="func-group">
        <button class="func-btn" data-tooltip="选取元素 (Pick Element)" @click="pickElement">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 3 10 21 14 14 21 10 3 3"></polygon>
          </svg>
        </button>
        <div class="func-divider"></div>
        <button class="func-btn" data-tooltip="后退" @click="onBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <button class="func-btn" data-tooltip="前进" @click="onForward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
        <button class="func-btn" data-tooltip="刷新" @click="onRefresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        <div class="func-divider"></div>
        <button class="func-btn" data-tooltip="开发者工具" @click="onDevTools">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </button>
        <button class="func-btn" data-tooltip="在默认浏览器中打开" @click="onOpenExternal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- Webviews -->
    <div class="webview-container">
      <webview v-for="tab in workspace?.tabs || []" :key="tab.id"
               v-show="workspace?.activeTabId === tab.id"
               :src="tab.url"
               :id="`webview-${tab.id}`"
               class="webview-el"
               @dom-ready="onDomReady(tab.id)"
               @page-title-updated="onTitleUpdated($event, tab.id)"
               @page-favicon-updated="onFaviconUpdated($event, tab.id)"
               @did-start-loading="onStartLoading(tab.id)"
               @did-stop-loading="onStopLoading(tab.id)"
               allowpopups
      ></webview>
    </div>

    <!-- Inspector Dialog -->
    <InspectorDialog
      v-model="inspectorVisible"
      :selector="inspectorSelector"
      :url="inspectorUrl"
      :domain-rules="currentDomainRules"
      @applyPreview="onApplyPreview"
      @save="onSaveRules"
      @repick="pickElement"
      @deleteRule="onDeleteRule"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useWorkspaces } from '../composables/useWorkspaces'
import { useSettings } from '../composables/useSettings'
import InspectorDialog from './InspectorDialog.vue'

const props = defineProps<{
  resourceId: string
  resourceUrl: string
}>()

const { initWorkspace, getWorkspace, addTab, closeTab, updateTab } = useWorkspaces()
const { state: settingsState, saveCustomStyles, saveCmsResources, saveExternalSites } = useSettings()

const workspace = computed(() => getWorkspace(props.resourceId))

const getResourceIcon = () => {
  const isExt = settingsState.externalSites.find(r => r.id === props.resourceId)
  if (isExt?.icon) return isExt.icon
  return undefined
}

const init = () => {
  if (props.resourceId && props.resourceUrl) {
    initWorkspace(props.resourceId, props.resourceUrl, getResourceIcon())
  }
}

onMounted(() => {
  init()
  if (window.electronAPI && window.electronAPI.onWebviewNewWindow) {
    window.electronAPI.onWebviewNewWindow((url) => {
      // Add as new tab in current workspace
      addTab(props.resourceId, url, getResourceIcon())
    })
  }
})

watch(() => props.resourceId, () => {
  init()
})

watch(() => workspace.value?.tabs.length, (newLen) => {
  if (newLen === 0) {
    // Re-create default tab when all tabs are closed
    initWorkspace(props.resourceId, props.resourceUrl, getResourceIcon())
  }
})

const setActiveTab = (tabId: string) => {
  if (workspace.value) {
    workspace.value.activeTabId = tabId
  }
}

const onCloseTab = (tabId: string) => {
  closeTab(props.resourceId, tabId)
}

const onAddDefaultTab = () => {
  addTab(props.resourceId, props.resourceUrl, getResourceIcon())
}

// Webview Events
const onDomReady = async (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false })
  
  // Inject saved styles
  refreshWebviewStyles(tabId)
}

const refreshWebviewStyles = async (tabId: string) => {
  const webview = document.getElementById(`webview-${tabId}`) as any
  if (!webview) return
  
  try {
    const urlStr = webview.getURL()
    const domain = new URL(urlStr).hostname
    const stylesObj = settingsState.customStyles[props.resourceId]
    let cssText = ''
    
    if (stylesObj && stylesObj[domain]) {
      for (const rule of stylesObj[domain]) {
        cssText += `${rule.selector} { ${rule.css} }\n`
      }
    }
    
    const code = `
      (function() {
        let style = document.getElementById('m3u8-permanent-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'm3u8-permanent-style';
          document.head.appendChild(style);
        }
        style.innerHTML = ${JSON.stringify(cssText)};
      })();
    `
    webview.executeJavaScript(code)
  } catch (e) {
    console.warn('Failed to parse URL or inject styles', e)
  }
}

const onStartLoading = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: true })
}

const onStopLoading = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false })
}

const onTitleUpdated = (event: any, tabId: string) => {
  updateTab(props.resourceId, tabId, { title: event.title })
}

const onFaviconUpdated = async (event: any, tabId: string) => {
  if (event.favicons && event.favicons.length > 0) {
    const faviconUrl = event.favicons[0]
    updateTab(props.resourceId, tabId, { favicon: faviconUrl })
    
    // Check if external resource needs updating
    const isExt = settingsState.externalSites.find(r => r.id === props.resourceId)
    
    if (isExt && isExt.icon !== faviconUrl) {
      isExt.icon = faviconUrl
      await saveExternalSites([...settingsState.externalSites])
    }
  }
}

// Function Bar Actions
const activeWebview = () => {
  if (!workspace.value?.activeTabId) return null
  return document.getElementById(`webview-${workspace.value.activeTabId}`) as any
}

const onBack = () => {
  const wv = activeWebview()
  if (wv && wv.canGoBack()) wv.goBack()
}

const onForward = () => {
  const wv = activeWebview()
  if (wv && wv.canGoForward()) wv.goForward()
}

const onRefresh = () => {
  const wv = activeWebview()
  if (wv) wv.reload()
}

const onDevTools = () => {
  const wv = activeWebview()
  if (wv) wv.openDevTools()
}

const onOpenExternal = () => {
  const wv = activeWebview()
  if (wv) {
    window.electronAPI.openExternal(wv.getURL())
  }
}

// Element Picker Logic
const inspectorVisible = ref(false)
const inspectorSelector = ref('')
const inspectorUrl = ref('')

const pickElement = async () => {
  if (!workspace.value?.activeTabId) return
  const webview = document.getElementById(`webview-${workspace.value.activeTabId}`) as any
  if (!webview) return
  
  const pickerScript = `
    new Promise((resolve) => {
      if (window.__elementPickerActive) return resolve(null);
      window.__elementPickerActive = true;
      
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '2147483647';
      overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.3)';
      overlay.style.border = '2px solid #3b82f6';
      overlay.style.transition = 'all 0.1s ease';
      document.body.appendChild(overlay);

      const onMouseOver = (e) => {
        e.stopPropagation();
        const rect = e.target.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.display = 'block';
      };

      const getSelector = (el) => {
        if (el.tagName.toLowerCase() === 'html') return 'html';
        let path = [];
        while (el && el.nodeType === Node.ELEMENT_NODE) {
          let selector = el.tagName.toLowerCase();
          if (el.id) {
            selector += '#' + CSS.escape(el.id);
            path.unshift(selector);
            break;
          } else {
            let index = 1;
            let sibling = el.previousElementSibling;
            while (sibling) {
              index++;
              sibling = sibling.previousElementSibling;
            }
            if (index !== 1 || el.nextElementSibling) {
              selector += ':nth-child(' + index + ')';
            }
          }
          path.unshift(selector);
          el = el.parentNode;
        }
        return path.join(' > ');
      };

      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const selector = getSelector(e.target);
        document.body.removeChild(overlay);
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('click', onClick, true);
        window.__elementPickerActive = false;
        resolve(selector);
      };

      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onClick, true);
    })
  `
  
  const selector = await webview.executeJavaScript(pickerScript)
  if (selector) {
    inspectorSelector.value = selector
    inspectorUrl.value = webview.getURL()
    inspectorVisible.value = true
  }
}

const onApplyPreview = (selector: string, css: string, isPreviewing: boolean = true) => {
  if (!workspace.value?.activeTabId) return
  const webview = document.getElementById(`webview-${workspace.value.activeTabId}`) as any
  if (!webview) return

  const code = `
    (function() {
      let style = document.getElementById('m3u8-live-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'm3u8-live-style';
        document.head.appendChild(style);
      }
      style.innerHTML = ${JSON.stringify(selector ? selector + ' { ' + css + ' }' : '')};

      let highlight = document.getElementById('m3u8-live-highlight');
      if (!highlight) {
        highlight = document.createElement('style');
        highlight.id = 'm3u8-live-highlight';
        document.head.appendChild(highlight);
      }
      highlight.innerHTML = ${JSON.stringify((selector && isPreviewing) ? selector + ' { outline: 2px dashed #ef4444 !important; outline-offset: -2px !important; }' : '')};
    })();
  `
  webview.executeJavaScript(code)
}

const onSaveRules = async (domain: string, selector: string, css: string) => {
  if (!selector || !css) return
  
  const newStyles = { ...settingsState.customStyles }
  if (!newStyles[props.resourceId]) newStyles[props.resourceId] = {}
  if (!newStyles[props.resourceId][domain]) newStyles[props.resourceId][domain] = []
  
  // Replace if selector exists, otherwise push
  const rules = newStyles[props.resourceId][domain]
  const existingIdx = rules.findIndex(r => r.selector === selector)
  if (existingIdx >= 0) {
    rules[existingIdx].css = css
  } else {
    rules.push({ selector, css })
  }
  
  await saveCustomStyles(newStyles)
  if (workspace.value?.activeTabId) {
    refreshWebviewStyles(workspace.value.activeTabId)
  }
}

const currentDomainRules = computed(() => {
  if (!inspectorUrl.value) return []
  try {
    const domain = new URL(inspectorUrl.value).hostname
    const stylesObj = settingsState.customStyles[props.resourceId]
    if (stylesObj && stylesObj[domain]) {
      return stylesObj[domain]
    }
  } catch (e) { }
  return []
})

const onDeleteRule = async (domain: string, selector: string) => {
  const newStyles = { ...settingsState.customStyles }
  if (newStyles[props.resourceId] && newStyles[props.resourceId][domain]) {
    newStyles[props.resourceId][domain] = newStyles[props.resourceId][domain].filter(r => r.selector !== selector)
    await saveCustomStyles(newStyles)
    if (workspace.value?.activeTabId) {
      refreshWebviewStyles(workspace.value.activeTabId)
    }
  }
}
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

.tab.active::before, .tab.active::after {
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
  to { transform: rotate(360deg); }
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

.tab:hover .tab-close, .tab.active .tab-close {
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
</style>
