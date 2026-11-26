<template>
  <div class="browser-workspace">
    <!-- Tab Bar -->
    <div class="tab-bar">
      <div v-for="tab in workspace?.tabs || []" :key="tab.id" class="tab"
        :class="{ active: workspace?.activeTabId === tab.id }" @click="setActiveTab(tab.id)"
        @auxclick="onTabAuxClick($event, tab.id)" @mousedown="onTabMouseDown($event)">
        <div class="tab-favicon">
          <img v-if="tab.favicon" :src="tab.favicon" referrerpolicy="no-referrer" />
          <div v-else class="favicon-placeholder" :class="{ loading: tab.loading }"></div>
        </div>
        <div class="tab-title">{{ tab.title }}</div>
        <button class="tab-close" @click.stop="onCloseTab(tab.id)">
          <VIcon name="close" size="12" />
        </button>
      </div>

      <!-- New Tab Button -->
      <button class="new-tab-btn" @click="onAddDefaultTab">
        <VIcon name="plus" size="16" />
      </button>
    </div>

    <!-- Function Bar -->
    <div class="function-bar">
      <div class="nav-btn-group">
        <v-button variant="icon" class="func-btn" v-tooltip="'后退'" @click="onBack">
          <VIcon name="arrow-left" size="16" />
        </v-button>
        <v-button variant="icon" class="func-btn" v-tooltip="'前进'" @click="onForward">
          <VIcon name="arrow-right" size="16" />
        </v-button>
        <v-button variant="icon" class="func-btn" v-tooltip="'刷新'" @click="onRefresh">
          <VIcon name="refresh" size="16" />
        </v-button>
        <v-button variant="icon" class="func-btn" v-tooltip="'主页'" @click="onGoHome($event)" @auxclick="onGoHomeAux($event)">
          <VIcon name="home" size="16" />
        </v-button>
      </div>

      <div class="address-bar-container">
        <input 
          type="text" 
          class="address-bar-input" 
          v-model="addressInputUrl" 
          @keyup.enter="handleAddressBarEnter"
          @focus="handleAddressBarFocus"
          placeholder="输入网址" 
        />
      </div>
      <div class="func-spacer"></div>
      <div class="func-group">
        <v-button variant="icon" class="func-btn" :class="{ 'active': parseRuleVisible }" v-tooltip="'解析规则'" @click="toggleParseRule">
          <VIcon name="magic" size="16" />
        </v-button>

        <v-button variant="icon" class="func-btn" :class="{ 'active': scriptInjectorVisible }" v-tooltip="'注入脚本'" @click="toggleScriptInjector">
          <VIcon name="js" size="16" />
        </v-button>

        <v-button variant="icon" class="func-btn" :class="{ 'active': inspectorVisible }" v-tooltip="'注入样式'" @click="toggleInspector">
          <VIcon name="css" size="16" />
        </v-button>

        <v-button variant="icon" class="func-btn" :class="{ 'active': duplicateMarkVisible }" v-tooltip="'标记重复'" @click="toggleDuplicateMark">
          <VIcon name="duplicate-mark" size="16" />
        </v-button>

        <WaterfallDropdown
          :rules="currentDomainWaterfallRules"
          :selected-rule-id="selectedWaterfallRuleId"
          :is-active="isCurrentTabWaterfallActive"
          @start-wizard="onStartWaterfallWizard"
          @toggle-active="toggleWaterfallActive"
          @select-rule="onSelectWaterfallRule"
          @delete-rule="onDeleteWaterfallRule"
        />

        <v-button variant="icon" class="func-btn" :class="{ 'active': isPickingElementImage }" v-tooltip="'捕获图片'"
          @click="pickElementImage">
          <VIcon name="pick-image" size="16" />
        </v-button>

        <v-button variant="icon" class="func-btn" :class="{ 'active': isPickingElementText }" v-tooltip="'复制文本'"
          @click="pickElementText">
          <VIcon name="copy-text" size="16" />
        </v-button>

        <SnifferDropdown type="video" title="视频嗅探器" tooltip="视频嗅探器" :items="activeTab?.sniffedVideos || []"
          :page-url="getCurrentPageOrigin()" @clear="onClearSniffed('video')" @preview="onPreviewSniffedVideo">
          <template #icon>
            <VIcon name="video-sniffer" size="16" />
          </template>
        </SnifferDropdown>

        <SnifferDropdown type="audio" title="音频嗅探器" tooltip="音频嗅探器" :items="activeTab?.sniffedAudios || []"
          :page-url="getCurrentPageOrigin()" @clear="onClearSniffed('audio')" @preview="onPreviewSniffedAudio">
          <template #icon>
            <VIcon name="audio-sniffer" size="16" />
          </template>
        </SnifferDropdown>

        <PanSnifferDropdown
          tooltip="网盘嗅探"
          :items="activeTab?.sniffedPanLinks || []"
          @clear="onClearSniffedPanLinks"
          @parse="onParseSniffedPanLink"
        />

        <div class="func-divider"></div>

        <v-button variant="icon" class="func-btn tooltip-left" v-tooltip="'开发者工具'" @click="onDevTools">
          <VIcon name="code" size="16" />
        </v-button>

      </div>
    </div>

    <!-- Waterfall Picking Banner -->
    <div v-if="waterfallPickingStep > 0" class="waterfall-picking-banner">
      <div class="banner-content">
        <span class="picking-badge">
          {{ waterfallPickingStep === 2 ? '步骤 2/4' : '步骤 3/4' }}
        </span>
        <span class="picking-instruction">
          {{ waterfallPickingStep === 2 ? '请在网页中点击【下一页】按钮或链接 (Alt+滚轮可微调选择范围)' : '请在网页中点击【内容主体 / 列表区域】容器 (Alt+滚轮可微调选择范围)' }}
        </span>
      </div>
      <v-button size="small" variant="secondary" @click="cancelWaterfallPicking">取消</v-button>
    </div>

    <!-- Duplicate Picking Banner -->
    <div v-if="duplicatePickingType" class="waterfall-picking-banner">
      <div class="banner-content">
        <span class="picking-badge">元素拾取</span>
        <span class="picking-instruction">
          {{ duplicatePickingType === 'mount' ? '请在网页中点击【挂载元素 / 卡片容器】(Alt+滚轮可微调选择范围)' : '请在网页中点击【标题元素】(Alt+滚轮可微调选择范围)' }}
        </span>
      </div>
      <v-button size="small" variant="secondary" @click="cancelDuplicatePicking">取消</v-button>
    </div>

    <!-- Webviews -->
    <div class="webview-container" :class="{ 'pointer-disabled': isInteracting || isDraggingAnyDialog }">
      <!-- 极简空白占位页 -->
      <div v-if="activeTab?.isBlank" class="blank-tab-placeholder">
        <div class="blank-placeholder-card">
          <div class="blank-icon-wrap">
            <img src="/icon.png" class="blank-resource-icon" alt="Velora Logo" />
          </div>
          <div class="blank-subtitle">输入网址开始浏览</div>
        </div>
      </div>

      <template v-for="tab in workspace?.tabs || []" :key="tab.id">
        <webview v-if="!tab.isBlank" v-show="workspace?.activeTabId === tab.id"
          :src="tab.url" :id="`webview-${tab.id}`" :partition="sitePartition" class="webview-el" @dom-ready="onDomReady(tab.id)"
          @load-commit="onLoadCommit($event, tab.id)" @page-title-updated="onTitleUpdated($event, tab.id)"
          @page-favicon-updated="onFaviconUpdated($event, tab.id)" @did-start-loading="onStartLoading(tab.id)" @did-navigate="onDidNavigate($event, tab.id)" @did-navigate-in-page="onDidNavigate($event, tab.id)"
          @did-stop-loading="onStopLoading(tab.id)" @context-menu="handleWebviewContextMenu($event, tab.id)" allowpopups>
        </webview>
      </template>
    </div>

    <!-- Hidden Webviews for Concurrent Silent Link Parsing -->
    <div
      v-for="target in silentParseTargets"
      :key="target.id"
      style="position: fixed; top: -9999px; left: -9999px; width: 1280px; height: 800px; opacity: 0; pointer-events: none; overflow: hidden; z-index: -999;"
    >
      <webview
        :src="target.url"
        :id="`silent-webview-${target.id}`"
        :partition="sitePartition"
        allowpopups
      ></webview>
    </div>

    <!-- Hidden Webviews for Waterfall Pre-rendering Pipeline -->
    <div
      v-for="session in activeWaterfallSessionsList"
      :key="session.tabId"
      style="position: fixed; top: -9999px; left: -9999px; width: 1280px; height: 800px; opacity: 0; pointer-events: none; overflow: hidden; z-index: -999;"
    >
      <webview
        v-if="session.nextUrl && session.status !== 'finished'"
        :src="session.nextUrl"
        :id="`waterfall-bg-webview-${session.tabId}`"
        :partition="sitePartition"
        allowpopups
        @did-stop-loading="onWaterfallBgStopLoading(session.tabId)"
        @did-fail-load="onWaterfallBgFailLoad($event, session.tabId)"
      ></webview>
    </div>

    <!-- Audio Player Dialog -->
    <AudioPlayerDialog v-if="activeAudioPreview" v-show="!isElementPickingActive" :url="activeAudioPreview" :page-url="getCurrentPageOrigin()" @close="activeAudioPreview = null"
      @download="onDownloadAudio" />

    <!-- Video Player Dialog -->
    <VideoPlayerDialog v-if="activeVideoPreview" v-show="!isElementPickingActive" :url="activeVideoPreview" :page-url="getCurrentPageOrigin()" @close="activeVideoPreview = null"
      @download="onDownloadVideo" />

    <!-- Parse Rule Dialog -->
    <ParseRuleDialog
      v-model="parseRuleVisible"
      v-show="!isElementPickingActive"
      :resource-id="resourceId"
      :current-url="getCurrentPageUrl()"
      @save="onSaveParseRule"
    />

    <!-- Waterfall Wizard Modal -->
    <WaterfallWizardModal
      v-model:visible="waterfallWizardVisible"
      v-show="!isElementPickingActive"
      :step="waterfallWizardStep"
      :initial-domain="wizardTempDomain"
      :initial-next-selector="wizardTempNextSelector"
      :initial-content-selector="wizardTempContentSelector"
      :rules="settingsState.customWaterfallRules[resourceId] || []"
      @start-picking-next="onStartPickingNext"
      @restart-picking="onRestartPicking"
      @confirm="onConfirmWaterfallRule"
      @cancel="cancelWaterfallPicking"
    />

    <!-- Script Injector Dialog -->
    <ScriptInjectorDialog v-model="scriptInjectorVisible" v-show="!isElementPickingActive" :url="getCurrentPageUrl()"
      :scripts="settingsState.customScripts[resourceId] || []" @executeScript="onExecuteScript" @save="onSaveScript"
      @delete="onDeleteScript"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <!-- Inspector Dialog -->
    <InspectorDialog v-model="inspectorVisible" v-show="!isElementPickingActive" :url="getCurrentPageUrl()"
      :domain-rules="settingsState.customStyles[resourceId] || {}" @applyPreview="onApplyPreview" @save="onSaveRules"
      @delete="onDeleteStyle"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <!-- Duplicate Mark Dialog -->
    <DuplicateMarkDialog
      ref="duplicateMarkDialogRef"
      v-model="duplicateMarkVisible"
      :url="getCurrentPageUrl()"
      :resource-id="resourceId"
      :rules="currentResourceDuplicateRules"
      @pick-mount="onPickMountElement"
      @preview="onPreviewDuplicateRule"
      @save="onSaveDuplicateRules"
      @delete="onDeleteDuplicateRule"
      @test="onTestDuplicateRule"
      @interaction-start="isInteracting = true"
      @interaction-end="isInteracting = false"
    />

    <!-- Image Preview Dialogs -->
    <ImagePreviewDialog v-for="img in activeImagePreviews" :key="img.id" v-show="!isElementPickingActive" :id="img.id" :url="img.url" :urls="img.urls"
      :zIndex="img.zIndex" :initialX="img.x" :initialY="img.y" :page-url="getCurrentPageOrigin()" @close="onClosePreview" @focus="onFocusPreview"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <ParseRuleSelectDialog
      v-model:visible="ruleSelectModalVisible"
      v-show="!isElementPickingActive"
      :rules="pendingMatchingRules"
      @select="onRuleSelected"
      @cancel="onRuleSelectCancelled"
    />

    <!-- Context Menu -->
    <div v-show="contextMenuVisible" class="context-menu" tabindex="-1" ref="contextMenuRef" @blur="hideAllContextMenus" @keydown.esc="hideAllContextMenus"
      :style="{ top: contextMenuPos.y + 'px', left: contextMenuPos.x + 'px' }" @click.stop>
      <div class="menu-item" @click="triggerPickImage">
        <VIcon name="pick-image" size="14" />
        <span>捕获图片</span>
      </div>
      <div class="menu-item" @click="triggerCopyText">
        <VIcon name="copy-text" size="14" />
        <span>复制文本</span>
      </div>
      <div class="menu-item" @click="triggerSilentParse">
        <VIcon name="magic" size="14" />
        <span>{{ isContextMenuTargetLink ? '解析链接' : '解析页面' }}</span>
      </div>
      <div v-if="contextMenuPanText" class="menu-item" @click="triggerParsePanLink">
        <VIcon name="cloud-download" size="14" />
        <span>解析网盘链接</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick, defineAsyncComponent } from 'vue';
import { useWorkspaces } from '@/composables/useWorkspaces';
import { useSettings } from '@/composables/useSettings';
import { useElementPickerSession } from '@/composables/useElementPickerSession';
import { useSaveMediaDialog } from '@/composables/useSaveMediaDialog';
import { getSitePartition } from '@/utils/sitePartition';

import { useBrowserMediaSniffer } from '@/composables/browser/useBrowserMediaSniffer';
import { useBrowserCustomization } from '@/composables/browser/useBrowserCustomization';
import { useBrowserSilentParser } from '@/composables/browser/useBrowserSilentParser';
import { useBrowserWaterfall } from '@/composables/browser/useBrowserWaterfall';
import { useBrowserDuplicateMark } from '@/composables/browser/useBrowserDuplicateMark';
import { useBrowserContextMenu } from '@/composables/browser/useBrowserContextMenu';
import { useBrowserWebviewBridge } from '@/composables/browser/useBrowserWebviewBridge';

import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import SnifferDropdown from '@/components/features/SnifferDropdown.vue';
import PanSnifferDropdown from '@/components/features/PanSnifferDropdown.vue';
import WaterfallDropdown from '@/components/features/WaterfallDropdown.vue';
import { extractAllPanShareLinks, type SniffedPanLink } from '@/composables/pan/shareTextParser';
import { useGlobalPanParseModal } from '@/composables/pan/useGlobalPanParseModal';

const InspectorDialog = defineAsyncComponent(() => import('@/components/features/InspectorDialog.vue'));
const ScriptInjectorDialog = defineAsyncComponent(() => import('@/components/features/ScriptInjectorDialog.vue'));
const DuplicateMarkDialog = defineAsyncComponent(() => import('@/components/features/DuplicateMarkDialog.vue'));
const ParseRuleDialog = defineAsyncComponent(() => import('@/components/features/ParseRuleDialog.vue'));
const ParseRuleSelectDialog = defineAsyncComponent(() => import('@/components/features/ParseRuleSelectDialog.vue'));
const WaterfallWizardModal = defineAsyncComponent(() => import('@/components/features/WaterfallWizardModal.vue'));
const ImagePreviewDialog = defineAsyncComponent(() => import('@/components/features/ImagePreviewDialog.vue'));
const AudioPlayerDialog = defineAsyncComponent(() => import('@/components/features/AudioPlayerDialog.vue'));
const VideoPlayerDialog = defineAsyncComponent(() => import('@/components/features/VideoPlayerDialog.vue'));

const props = defineProps<{
  resourceId: string;
  resourceUrl: string;
}>();

const sitePartition = computed(() => getSitePartition(props.resourceId));

const { isDraggingAnyDialog } = useSaveMediaDialog();
const { isElementPickingActive, endElementPickingSession } = useElementPickerSession();
const { initWorkspace, getWorkspace, addTab, closeTab, updateTab } = useWorkspaces();
const { state: settingsState } = useSettings();

const isInteracting = ref(false);
const addressInputUrl = ref('');

const workspace = computed(() => getWorkspace(props.resourceId));
const activeTab = computed(() => workspace.value?.tabs.find(t => t.id === workspace.value?.activeTabId));

const currentResourceUrl = computed(() => {
  const site = settingsState.externalSites.find(r => r.id === props.resourceId);
  if (site && site.url) return site.url;
  return props.resourceUrl;
});

const getResourceIcon = () => {
  const isExt = settingsState.externalSites.find(r => r.id === props.resourceId);
  return isExt?.icon;
};

const activeWebview = () => {
  if (!workspace.value?.activeTabId) return null;
  return document.getElementById(`webview-${workspace.value.activeTabId}`) as any;
};

const getCurrentPageUrl = (): string => {
  const wv = activeWebview();
  if (wv && typeof wv.getURL === 'function') {
    try {
      const u = wv.getURL();
      if (u && u !== 'about:blank') return u;
    } catch {}
  }
  return activeTab.value?.url || props.resourceUrl || '';
};

const getCurrentPageOrigin = (): string => {
  const url = getCurrentPageUrl();
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.origin && u.origin !== 'null') ? u.origin : url;
  } catch {
    return url;
  }
};

const syncAddressBar = () => {
  if (activeTab.value?.isBlank) {
    addressInputUrl.value = '';
    return;
  }
  const wv = activeWebview();
  if (wv && wv.getURL) {
    addressInputUrl.value = wv.getURL();
  } else if (activeTab.value?.url) {
    addressInputUrl.value = activeTab.value.url;
  }
};

const handleAddressBarFocus = (e: FocusEvent) => {
  (e.target as HTMLInputElement).select();
};

const handleAddressBarEnter = () => {
  if (!addressInputUrl.value) return;
  let url = addressInputUrl.value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  addressInputUrl.value = url;

  if (activeTab.value?.isBlank) {
    updateTab(props.resourceId, activeTab.value.id, {
      url,
      title: 'Loading...',
      loading: true,
      isBlank: false
    });
  } else {
    const wv = activeWebview();
    if (wv && wv.loadURL) {
      wv.loadURL(url);
    }
  }
};

const onBack = () => {
  if (activeTab.value?.isBlank) return;
  const wv = activeWebview();
  if (wv && wv.canGoBack()) wv.goBack();
};

const onForward = () => {
  if (activeTab.value?.isBlank) return;
  const wv = activeWebview();
  if (wv && wv.canGoForward()) wv.goForward();
};

const onRefresh = () => {
  if (activeTab.value?.isBlank) return;
  const wv = activeWebview();
  if (wv) wv.reload();
};

const onDevTools = () => {
  if (activeTab.value?.isBlank) return;
  const wv = activeWebview();
  if (wv) {
    if (typeof wv.isDevToolsOpened === 'function' && wv.isDevToolsOpened()) {
      wv.closeDevTools();
    } else if (typeof wv.openDevTools === 'function') {
      wv.openDevTools();
    }
  }
};

const setActiveTab = (tabId: string) => {
  if (workspace.value) {
    workspace.value.activeTabId = tabId;
  }
};

const onTabMouseDown = (e: MouseEvent) => {
  if (e.button === 1) {
    e.preventDefault();
  }
};

const onAddDefaultTab = () => {
  addTab(props.resourceId, '', undefined, true, true);
  addressInputUrl.value = '';
  nextTick(() => {
    const input = document.querySelector('.address-bar-input') as HTMLInputElement | null;
    input?.focus();
  });
};

const onGoHome = (e?: MouseEvent) => {
  const homeUrl = currentResourceUrl.value;
  if (!homeUrl) return;

  if (e && (e.ctrlKey || e.metaKey)) {
    addTab(props.resourceId, homeUrl, getResourceIcon(), true, false);
    return;
  }

  if (!activeTab.value) {
    addTab(props.resourceId, homeUrl, getResourceIcon(), true, false);
    return;
  }

  if (activeTab.value.isBlank) {
    updateTab(props.resourceId, activeTab.value.id, {
      url: homeUrl,
      title: 'Loading...',
      loading: true,
      favicon: getResourceIcon(),
      isBlank: false
    });
  } else {
    const wv = activeWebview();
    if (wv && wv.loadURL) {
      wv.loadURL(homeUrl);
    }
  }
  addressInputUrl.value = homeUrl;
};

const onGoHomeAux = (e: MouseEvent) => {
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    const homeUrl = currentResourceUrl.value;
    if (homeUrl) {
      addTab(props.resourceId, homeUrl, getResourceIcon(), true, false);
    }
  }
};

const init = () => {
  if (props.resourceId && currentResourceUrl.value) {
    initWorkspace(props.resourceId, currentResourceUrl.value, getResourceIcon());
  }
};

// 功能互斥调度前置转发，确保 7 个 Composable 按无环顺序装配
let deactivateOtherFeaturesImpl: (exclude: string) => Promise<void> = async () => {};
const deactivateOtherFeatures = (exclude: string) => deactivateOtherFeaturesImpl(exclude);

const {
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
  handleVideoQuickDownload,
  flushSniffedBufferForTab,
  setupMediaSniffedListener
} = useBrowserMediaSniffer({
  resourceId: () => props.resourceId,
  workspace,
  activeTab,
  getCurrentPageOrigin,
  updateTab
});

const {
  inspectorVisible,
  toggleInspector,
  onApplyPreview,
  onSaveRules,
  onDeleteStyle,
  refreshWebviewStyles,
  scriptInjectorVisible,
  toggleScriptInjector,
  onExecuteScript,
  onSaveScript,
  onDeleteScript,
  applyCustomScriptsToWebview,
  refreshWebviewScripts,
  isPickingElementImage,
  isPickingElementText,
  pickElementImage,
  pickElementText,
  cancelActivePickers
} = useBrowserCustomization({
  resourceId: () => props.resourceId,
  workspace,
  activeTab,
  activeWebview,
  onRefresh,
  addImagePreview,
  deactivateOtherFeatures
});

const {
  parseRuleVisible,
  toggleParseRule,
  onSaveParseRule,
  silentParseTargets,
  ruleSelectModalVisible,
  pendingMatchingRules,
  onRuleSelected,
  onRuleSelectCancelled,
  startSilentParse
} = useBrowserSilentParser({
  resourceId: () => props.resourceId,
  activeTab,
  getCurrentPageOrigin,
  onRefresh
});

const {
  waterfallWizardVisible,
  waterfallWizardStep,
  waterfallPickingStep,
  wizardTempDomain,
  wizardTempNextSelector,
  wizardTempContentSelector,
  activeWaterfallSessionsList,
  currentDomainWaterfallRules,
  selectedWaterfallRuleId,
  isCurrentTabWaterfallActive,
  onStartWaterfallWizard,
  onStartPickingNext,
  onRestartPicking,
  cancelWaterfallPicking,
  onConfirmWaterfallRule,
  onSelectWaterfallRule,
  onDeleteWaterfallRule,
  onWaterfallBgStopLoading,
  onWaterfallBgFailLoad,
  onWaterfallTriggerBottom,
  retryWaterfall,
  destroyWaterfallSession,
  destroyAllWaterfallSessions,
  checkDomReadyWaterfall,
  checkAutoApplyWaterfall,
  toggleWaterfallActive
} = useBrowserWaterfall({
  resourceId: () => props.resourceId,
  workspace,
  activeTab,
  applyCustomScriptsToWebview,
  onRefresh,
  deactivateOtherFeatures
});

const {
  duplicateMarkVisible,
  duplicatePickingType,
  duplicateMarkDialogRef,
  currentResourceDuplicateRules,
  toggleDuplicateMark,
  onPickMountElement,
  cancelDuplicatePicking,
  onPreviewDuplicateRule,
  onSaveDuplicateRules,
  onDeleteDuplicateRule,
  onTestDuplicateRule,
  applyDuplicateMarksToTab
} = useBrowserDuplicateMark({
  resourceId: () => props.resourceId,
  workspace,
  activeTab,
  deactivateOtherFeatures
});

deactivateOtherFeaturesImpl = async (exclude: string) => {
  if (exclude !== 'js' && scriptInjectorVisible.value) {
    scriptInjectorVisible.value = false;
  }
  if (exclude !== 'css' && inspectorVisible.value) {
    inspectorVisible.value = false;
  }
  if (exclude !== 'duplicateMark' && duplicateMarkVisible.value) {
    duplicateMarkVisible.value = false;
  }
  if (exclude !== 'duplicatePicking' && duplicatePickingType.value) {
    cancelDuplicatePicking();
  }
  await cancelActivePickers(exclude);
  if (exclude !== 'waterfall' && waterfallPickingStep.value > 0) {
    cancelWaterfallPicking();
  }
};

const { openPanParseModal } = useGlobalPanParseModal();

const onClearSniffedPanLinks = () => {
  if (!activeTab.value) return;
  updateTab(props.resourceId, activeTab.value.id, { sniffedPanLinks: [] });
};

const onParseSniffedPanLink = (item: SniffedPanLink) => {
  openPanParseModal(item.url, item.password);
};

const scanPanLinksInTab = async (tabId: string) => {
  const wv = document.getElementById(`webview-${tabId}`) as any;
  if (!wv || typeof wv.executeJavaScript !== 'function') return;
  try {
    const payload = await wv.executeJavaScript(`
      (function() {
        try {
          const anchors = [];
          const nodes = document.querySelectorAll('a[href]');
          const limit = Math.min(nodes.length, 300);
          for (let i = 0; i < limit; i++) {
            const a = nodes[i];
            const href = a.href || a.getAttribute('href') || '';
            if (!href || !/^https?:\\/\\//i.test(href)) continue;
            const text = (a.innerText || a.textContent || '').trim().slice(0, 100);
            const parentText = (a.parentElement && (a.parentElement.innerText || a.parentElement.textContent) || '').trim().slice(0, 160);
            anchors.push({ href, text, context: parentText });
          }
          const bodyText = ((document.body && document.body.innerText) || '').slice(0, 120000);
          return { anchors, bodyText };
        } catch (err) {
          return null;
        }
      })();
    `);
    if (!payload) return;
    const links = extractAllPanShareLinks(payload.bodyText || '', payload.anchors || []);
    updateTab(props.resourceId, tabId, { sniffedPanLinks: links });
  } catch {
    // 忽略跨域/销毁中的 webview 扫描错误
  }
};

const {
  contextMenuVisible,
  contextMenuPos,
  isContextMenuTargetLink,
  contextMenuPanText,
  contextMenuRef,
  handleWebviewContextMenu,
  hideAllContextMenus,
  handleWindowClick,
  triggerPickImage,
  triggerCopyText,
  triggerSilentParse,
  triggerParsePanLink
} = useBrowserContextMenu({
  workspace,
  isPickingElementImage,
  isPickingElementText,
  pickElementImage,
  pickElementText,
  startSilentParse,
  onParsePanLink: (rawText) => openPanParseModal(rawText)
});

const {
  onDomReady,
  onLoadCommit,
  onStartLoading,
  onDidNavigate,
  onStopLoading,
  onTitleUpdated,
  onFaviconUpdated
} = useBrowserWebviewBridge({
  resourceId: () => props.resourceId,
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
});

const onCloseTab = (tabId: string) => {
  if (!workspace.value) return;

  // 如果当前只剩最后一个标签页，转为空白页
  if (workspace.value.tabs.length === 1 && workspace.value.tabs[0].id === tabId) {
    const currentTab = workspace.value.tabs[0];
    // 如果已经处于空白页，静默保持，避免重载
    if (currentTab.isBlank) {
      return;
    }
    const wv = document.getElementById(`webview-${tabId}`) as any;
    if (wv) {
      if (typeof wv.closeDevTools === 'function') {
        try { wv.closeDevTools(); } catch {}
      }
      if (typeof wv.stop === 'function') {
        try { wv.stop(); } catch {}
      }
    }
    destroyWaterfallSession(tabId);
    updateTab(props.resourceId, tabId, {
      url: '',
      title: '新标签页',
      loading: false,
      favicon: undefined,
      isBlank: true,
      sniffedImages: [],
      sniffedVideos: [],
      sniffedAudios: [],
      sniffedPanLinks: []
    });
    addressInputUrl.value = '';
    nextTick(() => {
      const input = document.querySelector('.address-bar-input') as HTMLInputElement | null;
      input?.focus();
    });
    return;
  }

  const wv = document.getElementById(`webview-${tabId}`) as any;
  if (wv) {
    if (typeof wv.closeDevTools === 'function') {
      try { wv.closeDevTools(); } catch {}
    }
    if (typeof wv.stop === 'function') {
      try { wv.stop(); } catch {}
    }
  }
  destroyWaterfallSession(tabId);
  closeTab(props.resourceId, tabId);
};

const onTabAuxClick = (e: MouseEvent, tabId: string) => {
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    onCloseTab(tabId);
  }
};

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'F5') {
    e.preventDefault();
    onRefresh();
  } else if (e.key === 'F12') {
    e.preventDefault();
  }
};

let offWebviewNewWindowFn: (() => void) | undefined;
let offMediaSniffedFn: (() => void) | undefined;

onMounted(() => {
  init();
  document.addEventListener('click', hideAllContextMenus);
  if (window.electronAPI && window.electronAPI.onWebviewNewWindow) {
    offWebviewNewWindowFn = window.electronAPI.onWebviewNewWindow((data: { url: string, webContentsId: number } | string) => {
      const url = typeof data === 'string' ? data : data.url;
      const webContentsId = typeof data === 'string' ? -1 : data.webContentsId;

      if (!workspace.value) return;

      let isOurs = false;
      if (workspace.value.tabs.some(t => t.webContentsId === webContentsId)) {
        isOurs = true;
      } else {
        const webviews = document.querySelectorAll('webview') as NodeListOf<any>;
        for (const wv of webviews) {
          if (wv.getWebContentsId && wv.getWebContentsId() === webContentsId) {
            const tabId = wv.id.replace('webview-', '');
            if (workspace.value.tabs.some(t => t.id === tabId)) {
              isOurs = true;
              break;
            }
          }
        }
      }

      if (isOurs || webContentsId === -1) {
        addTab(props.resourceId, url, getResourceIcon());
      }
    });
  }

  offMediaSniffedFn = setupMediaSniffedListener();

  // Click-away to close context menu
  window.addEventListener('click', handleWindowClick);
  // Global hotkeys
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', hideAllContextMenus);
  window.removeEventListener('click', handleWindowClick);
  window.removeEventListener('keydown', handleGlobalKeydown);
  offWebviewNewWindowFn?.();
  offMediaSniffedFn?.();
  offWebviewNewWindowFn = undefined;
  offMediaSniffedFn = undefined;
  endElementPickingSession();
  destroyAllWaterfallSessions();
});

watch(() => props.resourceId, () => {
  init();
});

watch(() => workspace.value?.tabs.length, (newLen) => {
  if (newLen === 0) {
    // 当标签页完全清空时，默认打开一个空白标签页
    addTab(props.resourceId, '', undefined, true, true);
  }
});

watch(() => workspace.value?.activeTabId, () => {
  setTimeout(syncAddressBar, 50);
});
</script>

<style scoped lang="less">
.browser-workspace {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--border-light);
  overflow: hidden;
}

.tab-bar {
  display: flex;
  align-items: flex-end;
  height: 44px;
  background: var(--border-color);
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
  background: var(--bg-surface-hover);
}

.tab.active {
  background: var(--bg-surface);
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
  background: radial-gradient(circle at 0 0, transparent 10px, var(--bg-surface) 10px);
}

.tab.active::after {
  right: -10px;
  background: radial-gradient(circle at 10px 0, transparent 10px, var(--bg-surface) 10px);
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
  background: var(--border-color);
}

.favicon-placeholder.loading {
  background: transparent;
  border: 2px solid var(--border-color);
  border-top-color: var(--color-accent);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tab-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  line-height: 1;
}

.tab.active .tab-title {
  color: var(--text-primary);
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
  color: var(--text-secondary);
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
  background: var(--border-color);
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
  color: var(--text-secondary);
  margin-left: 4px;
  margin-bottom: 3px;
  transition: background-color 0.2s;
}

.new-tab-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

/* Function Bar */
.function-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg-surface);
  padding: 0 12px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.nav-btn-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}

.func-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.func-divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
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
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.func-btn svg {
  display: block;
}

.func-btn:hover {
  background: var(--border-light);
  color: var(--text-primary);
}

.func-btn.active {
  background: var(--border-light);
  color: var(--text-primary);
}

.func-btn.active:hover {
  background: var(--border-color);
  color: var(--text-primary);
}



.webview-container {
  flex: 1;
  position: relative;
  background: var(--bg-app);
  padding: 16px;
}

.webview-el {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--bg-surface);
  border-radius: 0;
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}

.pointer-disabled webview {
  pointer-events: none;
}

.blank-tab-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  box-shadow: var(--shadow-soft);
  user-select: none;
  -webkit-user-select: none;
}

.blank-placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 40px;
  max-width: 380px;
}

.blank-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;

  .blank-resource-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    border-radius: 8px;
  }
}

.blank-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
}

/* Custom Context Menu */
.context-menu {
  position: fixed;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24), 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 6px;
  width: 150px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;
  animation: menu-show 0.12s cubic-bezier(0.16, 1, 0.3, 1);
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
  color: var(--text-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.menu-item:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.menu-item svg {
  flex-shrink: 0;
}

.url-opener-container {
  position: relative;
  display: flex;
}

.url-opener-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.url-opener-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  width: 320px;
  box-shadow: var(--shadow-soft);
  z-index: 100;
  display: flex;
  gap: 8px;
  animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.url-opener-dropdown input {
  flex: 1;
  background: var(--bg-app);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 0 12px;
  height: 32px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
}

.url-opener-dropdown input:focus {
  border-color: var(--text-secondary);
}

.url-opener-dropdown .open-btn {
  background: var(--border-light);
  color: var(--text-primary);
  border: none;
  border-radius: 6px;
  padding: 0 12px;
  height: 32px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 500;
}

.url-opener-dropdown .open-btn:hover {
  background: var(--border-color);
}

.address-bar-container {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 420px;
  min-width: 200px;
}
.address-bar-input {
  width: 100%;
  height: 28px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s ease;
}
.address-bar-input:focus {
  background: var(--bg-surface);
  border-color: var(--color-accent);
  /* Use a safe shadow fallback just in case RGB variable is missing */
  box-shadow: 0 0 0 2px rgba(100, 100, 100, 0.2);
}

.waterfall-picking-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  z-index: 50;
  animation: slideDown 0.15s ease-out;

  .banner-content {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .picking-badge {
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-accent);
    background: var(--bg-surface-active);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }

  .picking-instruction {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
  }
}
</style>
