<template>
  <div class="browser-workspace">
    <!-- Tab Bar -->
    <div class="tab-bar">
      <div v-for="tab in workspace?.tabs || []" :key="tab.id"
           class="tab" :class="{ active: workspace?.activeTabId === tab.id }"
           @click="setActiveTab(tab.id)">
        <div class="tab-favicon">
          <img v-if="tab.favicon" :src="tab.favicon" />
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
  </div>
</template>

<script setup lang="ts">
import { watch, onMounted, computed } from 'vue'
import { useWorkspaces } from '../composables/useWorkspaces'

const props = defineProps<{
  resourceId: string
  resourceUrl: string
}>()

const { initWorkspace, getWorkspace, addTab, closeTab, updateTab } = useWorkspaces()

const workspace = computed(() => getWorkspace(props.resourceId))

const init = () => {
  if (props.resourceId && props.resourceUrl) {
    initWorkspace(props.resourceId, props.resourceUrl)
  }
}

onMounted(() => {
  init()
  if (window.electronAPI && window.electronAPI.onWebviewNewWindow) {
    window.electronAPI.onWebviewNewWindow((url) => {
      // Add as new tab in current workspace
      addTab(props.resourceId, url)
    })
  }
})

watch(() => props.resourceId, () => {
  init()
})

watch(() => workspace.value?.tabs.length, (newLen) => {
  if (newLen === 0) {
    // Re-create default tab when all tabs are closed
    initWorkspace(props.resourceId, props.resourceUrl)
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
  addTab(props.resourceId, props.resourceUrl)
}

// Webview Events
const onDomReady = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false })
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

const onFaviconUpdated = (event: any, tabId: string) => {
  if (event.favicons && event.favicons.length > 0) {
    updateTab(props.resourceId, tabId, { favicon: event.favicons[0] })
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
