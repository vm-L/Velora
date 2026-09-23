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

    <!-- Webviews -->
    <div class="webview-container" :class="{ 'pointer-disabled': isInteracting || isDraggingAnyDialog }">
      <webview v-for="tab in workspace?.tabs || []" :key="tab.id" v-show="workspace?.activeTabId === tab.id"
        :src="tab.url" :id="`webview-${tab.id}`" class="webview-el" @dom-ready="onDomReady(tab.id)"
        @load-commit="onLoadCommit($event, tab.id)" @page-title-updated="onTitleUpdated($event, tab.id)"
        @page-favicon-updated="onFaviconUpdated($event, tab.id)" @did-start-loading="onStartLoading(tab.id)" @did-navigate="onDidNavigate($event, tab.id)" @did-navigate-in-page="onDidNavigate($event, tab.id)"
        @did-stop-loading="onStopLoading(tab.id)" @context-menu="handleWebviewContextMenu($event, tab.id)" allowpopups>
      </webview>
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
        allowpopups
        @did-stop-loading="onWaterfallBgStopLoading(session.tabId)"
        @did-fail-load="onWaterfallBgFailLoad($event, session.tabId)"
      ></webview>
    </div>

    <!-- Audio Player Dialog -->
    <AudioPlayerDialog v-if="activeAudioPreview" :url="activeAudioPreview" :page-url="getCurrentPageOrigin()" @close="activeAudioPreview = null"
      @download="onDownloadAudio" />

    <!-- Video Player Dialog -->
    <VideoPlayerDialog v-if="activeVideoPreview" :url="activeVideoPreview" :page-url="getCurrentPageOrigin()" @close="activeVideoPreview = null"
      @download="onDownloadVideo" />

    <!-- Parse Rule Dialog -->
    <ParseRuleDialog v-model="parseRuleVisible" :resource-id="resourceId" :current-url="getCurrentPageUrl()" />

    <!-- Waterfall Wizard Modal -->
    <WaterfallWizardModal
      v-model:visible="waterfallWizardVisible"
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
    <ScriptInjectorDialog v-model="scriptInjectorVisible" :url="getCurrentPageUrl()"
      :scripts="settingsState.customScripts[resourceId] || []" @executeScript="onExecuteScript" @save="onSaveScript"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <!-- Inspector Dialog -->
    <InspectorDialog v-model="inspectorVisible" :url="getCurrentPageUrl()"
      :domain-rules="settingsState.customStyles[resourceId] || {}" @applyPreview="onApplyPreview" @save="onSaveRules"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <!-- Image Preview Dialogs -->
    <ImagePreviewDialog v-for="img in activeImagePreviews" :key="img.id" :id="img.id" :url="img.url" :urls="img.urls"
      :zIndex="img.zIndex" :initialX="img.x" :initialY="img.y" :page-url="getCurrentPageOrigin()" @close="onClosePreview" @focus="onFocusPreview"
      @interaction-start="isInteracting = true" @interaction-end="isInteracting = false" />

    <ParseRuleSelectDialog
      v-model:visible="ruleSelectModalVisible"
      :rules="pendingMatchingRules"
      @select="onRuleSelected"
      @cancel="onRuleSelectCancelled"
    />

    <!-- Context Menu -->
    <div v-show="contextMenuVisible" class="context-menu" tabindex="-1" ref="contextMenuRef" @blur="hideAllContextMenus"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick, defineAsyncComponent } from 'vue';
import { useWorkspaces } from '@/composables/useWorkspaces';
import { useSettings, type ParseRule, type ParseRuleItem } from '@/composables/useSettings';
import { logger } from '@/services/logger';
import { sanitizeFilename } from '@/utils/filename';

import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
const InspectorDialog = defineAsyncComponent(() => import('@/components/features/InspectorDialog.vue'));
const ScriptInjectorDialog = defineAsyncComponent(() => import('@/components/features/ScriptInjectorDialog.vue'));
import ParseRuleDialog from '@/components/features/ParseRuleDialog.vue';
import ParseRuleSelectDialog from '@/components/features/ParseRuleSelectDialog.vue';
import SnifferDropdown from '@/components/features/SnifferDropdown.vue';
import WaterfallDropdown from '@/components/features/WaterfallDropdown.vue';
import WaterfallWizardModal from '@/components/features/WaterfallWizardModal.vue';
import ImagePreviewDialog from '@/components/features/ImagePreviewDialog.vue';
import AudioPlayerDialog from '@/components/features/AudioPlayerDialog.vue';
import VideoPlayerDialog from '@/components/features/VideoPlayerDialog.vue';
import { APP_PREFIX } from '@/constants';
import { getPickerScript, getPickerCancelScript } from '@/utils/elementPicker';
import {
  getWaterfallParentInitScript,
  getWaterfallBackgroundExtractScript,
  getWaterfallQueryInitialNextUrlScript,
  getWaterfallDestroyScript,
  type WaterfallExtractResult
} from '@/utils/waterfallEngine';
import { isUrlMatchPattern, getDefaultUrlPattern } from '@/utils/urlMatcher';
import type { WaterfallRule } from '@/composables/useSettings';


import { useMessage } from '@/composables/useMessage';
import { useConfirm } from '@/composables/useConfirm';
import { useSaveMediaDialog } from '@/composables/useSaveMediaDialog';

const props = defineProps<{
  resourceId: string;
  resourceUrl: string;
}>();

const parseRuleVisible = ref(false);
const toggleParseRule = () => {
  parseRuleVisible.value = !parseRuleVisible.value;
};

const { showMessage } = useMessage();
const { confirm } = useConfirm();
const { openSaveMediaDialog, isDraggingAnyDialog } = useSaveMediaDialog();
const { initWorkspace, getWorkspace, addTab, closeTab, updateTab } = useWorkspaces();
const { state: settingsState, saveCustomStyles, saveCustomScripts, saveCustomWaterfallRules, saveExternalSites, saveCmsResources } = useSettings();

const contextMenuVisible = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuTabId = ref('');
const contextMenuTargetUrl = ref('');
const isContextMenuTargetLink = ref(false);
const contextMenuRef = ref<HTMLElement | null>(null);
const silentParseTargets = ref<Array<{ url: string; id: string }>>([]);

const handleWebviewContextMenu = (e: any, tabId: string) => {
  if (isPickingElementImage.value || isPickingElementText.value) return;
  if (e.preventDefault && typeof e.preventDefault === 'function') e.preventDefault();

  const params = e.params || (e as any).detail?.params || (e as any).nativeEvent?.params || e;
  const px = typeof params?.x === 'number' ? params.x : (typeof e.clientX === 'number' ? e.clientX : 0);
  const py = typeof params?.y === 'number' ? params.y : (typeof e.clientY === 'number' ? e.clientY : 0);

  const link = params?.linkURL || params?.linkUrl;
  const page = params?.pageURL || params?.pageUrl;
  const tab = workspace.value?.tabs.find(t => t.id === tabId);

  if (link) {
    isContextMenuTargetLink.value = true;
    contextMenuTargetUrl.value = link;
  } else {
    isContextMenuTargetLink.value = false;
    contextMenuTargetUrl.value = page || tab?.url || '';
  }

  contextMenuPos.value = {
    x: px,
    y: py
  };
  contextMenuTabId.value = tabId;
  contextMenuVisible.value = true;
  nextTick(() => {
    if (contextMenuRef.value) {
      contextMenuRef.value.focus();
      const menuWidth = contextMenuRef.value.offsetWidth || 150;
      const menuHeight = contextMenuRef.value.offsetHeight || 120;
      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;

      let finalX = px;
      let finalY = py;

      // 防止超出右视界：如果向右展开超出视界右边缘，向左翻转展开
      if (px + menuWidth > winWidth - 12) {
        finalX = Math.max(12, px - menuWidth);
      }

      // 防止超出下视界：如果向下展开超出视界下边缘，向上翻转展开
      if (py + menuHeight > winHeight - 12) {
        finalY = Math.max(12, py - menuHeight);
      }

      contextMenuPos.value = {
        x: finalX,
        y: finalY
      };
    }
  });
};

const hideAllContextMenus = (e?: MouseEvent | FocusEvent) => {
  if (e && e instanceof MouseEvent && e.button !== 0) return;
  contextMenuVisible.value = false;
};

const triggerPickImage = () => {
  contextMenuVisible.value = false;
  pickElementImage();
};

const triggerCopyText = () => {
  contextMenuVisible.value = false;
  pickElementText();
};


// 规则选择排队队列项类型
interface PendingRuleSelectItem {
  targetUrl: string;
  htmlText: string;
  toastId: string;
  shortLabel: string;
  matchedRules: ParseRule[];
  evaluator?: (expr: string) => Promise<any>;
}

const ruleSelectModalVisible = ref(false);
const pendingMatchingRules = ref<ParseRule[]>([]);
const pendingRuleSelectQueue: PendingRuleSelectItem[] = [];
let currentRuleSelectItem: PendingRuleSelectItem | null = null;

// 最大并发解析任务数限制（防止短时间拉起过多后台 webview 导致内存与 CPU 负载过高）
const MAX_CONCURRENT_PARSE = 3;
let activeParseCount = 0;
const parseTaskQueue: Array<() => Promise<void>> = [];

const enqueueParseTask = (task: () => Promise<void>) => {
  if (activeParseCount < MAX_CONCURRENT_PARSE) {
    runParseTask(task);
  } else {
    parseTaskQueue.push(task);
  }
};

const runParseTask = async (task: () => Promise<void>) => {
  activeParseCount++;
  try {
    await task();
  } finally {
    activeParseCount--;
    if (parseTaskQueue.length > 0) {
      const nextTask = parseTaskQueue.shift()!;
      runParseTask(nextTask);
    }
  }
};

// 统一 URL 通配符匹配
const matchDomainPattern = (urlStr: string, domainPattern: string): boolean => {
  return isUrlMatchPattern(domainPattern, urlStr);
};

// 解析单个 Rule Item (支持 /正则/、'固定常量' 及 全局变量名/JS表达式)
const evaluateParseItem = async (
  htmlText: string,
  item: ParseRuleItem,
  evaluator?: (expr: string) => Promise<any>
): Promise<string | string[] | null> => {
  const valPattern = (item.value ?? item.regex ?? '').trim();
  if (!valPattern) return null;

  // 1. 以 '/' 包裹：正则匹配，例如 /pattern/flags
  const isRegexPattern = /^\/(.+)\/([gimsuy]*)$/.test(valPattern);
  if (isRegexPattern) {
    const match = valPattern.match(/^\/(.+)\/([gimsuy]*)$/);
    if (match) {
      try {
        let patternStr = match[1];
        let flagsStr = match[2] || '';
        if (!flagsStr.includes('g')) flagsStr += 'g';

        const reg = new RegExp(patternStr, flagsStr);
        const matches: string[] = [];
        let m: RegExpExecArray | null;

        while ((m = reg.exec(htmlText)) !== null) {
          const val = m[1] !== undefined ? m[1] : m[0];
          matches.push(val);
          if (!reg.global) break;
        }

        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];
        return matches;
      } catch {
        return null;
      }
    }
  }

  // 2. 以单引号或双引号包裹：固定常量值，例如 'demo' 或 "hello world"
  const isQuotedString = /^'([\s\S]*)'$|^"([\s\S]*)"$/.test(valPattern);
  if (isQuotedString) {
    const match = valPattern.match(/^'([\s\S]*)'$|^"([\s\S]*)"$/);
    if (match) {
      return match[1] !== undefined ? match[1] : match[2];
    }
  }

  // 3. 直接输入：读取全局变量 / 执行 JS 表达式 (如 window.__playinfo__)
  if (evaluator) {
    try {
      const res = await evaluator(valPattern);
      if (res === undefined || res === null) return null;
      if (Array.isArray(res)) return res.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v)));
      if (typeof res === 'object') return JSON.stringify(res);
      return String(res);
    } catch {
      return null;
    }
  }

  return null;
};

// 执行特定匹配URL规则的所有行为类型
const executeMatchedRulesForDomain = async (
  _targetUrl: string,
  htmlText: string,
  selectedDomain: string,
  toastId: string,
  evaluator?: (expr: string) => Promise<any>,
  shortLabel?: string
) => {
  const allRules = settingsState.customParseRules[props.resourceId] || [];
  const domainRules = allRules.filter(r => r.domain === selectedDomain);

  let hasExec = false;

  for (const rule of domainRules) {
    if (rule.actionType === 'download') {
      hasExec = true;
      let nameResult: string | string[] | null = null;
      let urlResult: string | string[] | null = null;

      for (const it of rule.items) {
        if (it.key === '文件名称') {
          nameResult = await evaluateParseItem(htmlText, it, evaluator);
        } else if (it.key === '文件链接') {
          urlResult = await evaluateParseItem(htmlText, it, evaluator);
        }
      }

      const rawNameOptions = Array.isArray(nameResult) ? nameResult : (nameResult ? [nameResult] : []);
      const nameOptions = rawNameOptions.map(n => sanitizeFilename(n)).filter(Boolean);
      const urlOptions = Array.isArray(urlResult) ? urlResult : (urlResult ? [urlResult] : []);

      // 当下载类型没有匹配到文件名或文件链接时，弹出错误提示
      if (nameOptions.length === 0 || urlOptions.length === 0) {
        showMessage({
          id: toastId,
          text: `解析失败：未从页面匹配到有效的文件名或文件链接${shortLabel ? ` (${shortLabel})` : ''}`,
          type: 'error',
          duration: 2500
        });
        return;
      }

      // 配置并弹出全局下载保存弹窗
      openSaveMediaDialog({
        url: urlOptions[0],
        defaultName: nameOptions[0],
        defaultDir: settingsState.videoDirectory || settingsState.fileDirectory || '',
        type: 'video',
        nameOptions,
        urlOptions,
        pageUrl: getCurrentPageOrigin()
      });

      showMessage({
        id: toastId,
        text: `解析成功${shortLabel ? `: ${shortLabel}` : ''}`,
        type: 'success',
        duration: 1500
      });
    } else if (rule.actionType === 'copy') {
      hasExec = true;
      const copyObj: Record<string, any> = {};

      for (const it of rule.items) {
        const res = await evaluateParseItem(htmlText, it, evaluator);
        // 复制类型没有匹配到则不用提示，直接 value 值为空，当匹配到多个则使用数组
        copyObj[it.key] = res !== null ? res : '';
      }

      const jsonString = JSON.stringify(copyObj, null, 2);

      try {
        await navigator.clipboard.writeText(jsonString);
        showMessage({
          id: toastId,
          text: `解析成功，数据已复制到剪切板！${shortLabel ? ` (${shortLabel})` : ''}`,
          type: 'success',
          duration: 1500
        });
      } catch (err: any) {
        showMessage({
          id: toastId,
          text: `复制到剪切板失败: ${err.message || err}`,
          type: 'error',
          duration: 2500
        });
      }
    }
  }

  if (!hasExec) {
    showMessage({
      id: toastId,
      text: `所选规则暂无配置解析项${shortLabel ? ` (${shortLabel})` : ''}`,
      type: 'error',
      duration: 2000
    });
  }
};

// 规则选择排队调度管理
const requestRuleSelection = (item: PendingRuleSelectItem) => {
  if (ruleSelectModalVisible.value) {
    pendingRuleSelectQueue.push(item);
  } else {
    openNextRuleSelection(item);
  }
};

const openNextRuleSelection = (item: PendingRuleSelectItem) => {
  currentRuleSelectItem = item;
  pendingMatchingRules.value = item.matchedRules;
  ruleSelectModalVisible.value = true;
};

const onRuleSelected = async (selectedDomain: string) => {
  const current = currentRuleSelectItem;
  currentRuleSelectItem = null;
  ruleSelectModalVisible.value = false;

  if (current) {
    showMessage({
      id: current.toastId,
      text: `正在执行选定的解析规则 (${current.shortLabel})`,
      type: 'loading',
      duration: 0
    });
    executeMatchedRulesForDomain(
      current.targetUrl,
      current.htmlText,
      selectedDomain,
      current.toastId,
      current.evaluator,
      current.shortLabel
    ).catch(err => {
      logger.error('BrowserWorkspace', `执行选定规则失败: ${err}`);
    });
  }

  // 若队列中还有待确认任务，继续弹出下一个
  if (pendingRuleSelectQueue.length > 0) {
    const nextItem = pendingRuleSelectQueue.shift()!;
    nextTick(() => {
      openNextRuleSelection(nextItem);
    });
  }
};

const onRuleSelectCancelled = () => {
  const current = currentRuleSelectItem;
  currentRuleSelectItem = null;
  ruleSelectModalVisible.value = false;

  if (current) {
    showMessage({
      id: current.toastId,
      text: `已取消规则选择 (${current.shortLabel})`,
      type: 'info',
      duration: 1500
    });
  }

  // 若队列中还有待确认任务，继续弹出下一个
  if (pendingRuleSelectQueue.length > 0) {
    const nextItem = pendingRuleSelectQueue.shift()!;
    nextTick(() => {
      openNextRuleSelection(nextItem);
    });
  }
};

// 单个任务的独立执行逻辑
const executeSingleParseTask = async (task: {
  parseId: string;
  toastId: string;
  targetUrl: string;
  isLink: boolean;
  tabId: string;
  shortLabel: string;
}) => {
  const { parseId, toastId, targetUrl, isLink, tabId, shortLabel } = task;
  try {
    let htmlText = '';
    let evaluator: ((expr: string) => Promise<any>) | undefined;

    if (isLink) {
      // 解析超链接：在后台挂载独立静默 webview 容器
      silentParseTargets.value.push({ url: targetUrl, id: parseId });
      await nextTick();

      const hiddenWebview = document.getElementById(`silent-webview-${parseId}`) as any;
      if (!hiddenWebview) {
        throw new Error('创建后台解析容器失败');
      }

      // 等待 Webview 触发 dom-ready 事件（20 秒超时）
      await new Promise<void>((resolve, reject) => {
        let timer: any = null;
        let isDone = false;
        const onDomReady = () => {
          if (isDone) return;
          isDone = true;
          if (timer) clearTimeout(timer);
          hiddenWebview.removeEventListener('dom-ready', onDomReady);
          resolve();
        };

        hiddenWebview.addEventListener('dom-ready', onDomReady);

        timer = setTimeout(() => {
          if (isDone) return;
          isDone = true;
          hiddenWebview.removeEventListener('dom-ready', onDomReady);
          reject(new Error('页面加载超时（20秒）'));
        }, 20000);
      });

      // 匹配当前 Workspace 下与目标链接 URL 符合的自定义 JS 脚本并自动注入
      const workspaceScripts = settingsState.customScripts[props.resourceId] || [];
      const matchedScripts = workspaceScripts
        .filter(s => s.code && s.code.trim() && matchDomainPattern(targetUrl, s.domain))
        .map(s => s.code);

      for (const scriptCode of matchedScripts) {
        try {
          await hiddenWebview.executeJavaScript(scriptCode);
        } catch (e) {
          logger.warn('BrowserWorkspace', `注入自定义脚本失败: ${e}`);
        }
      }

      // 等待 600ms 以便动态 JS 渲染与 DOM 更新
      await new Promise(r => setTimeout(r, 600));

      // 收集可能需要求值的全局变量表达式
      const allRules = settingsState.customParseRules[props.resourceId] || [];
      const matchedRules = allRules.filter(r => matchDomainPattern(targetUrl, r.domain));
      const evalExprs: string[] = [];
      matchedRules.forEach(r => {
        r.items.forEach(it => {
          const val = (it.value ?? it.regex ?? '').trim();
          const isRegex = /^\/(.+)\/([gimsuy]*)$/.test(val);
          const isQuoted = /^'([\s\S]*)'$|^"([\s\S]*)"$/.test(val);
          if (val && !isRegex && !isQuoted) {
            evalExprs.push(val);
          }
        });
      });

      const evaluatedVars: Record<string, any> = {};
      for (const expr of evalExprs) {
        try {
          evaluatedVars[expr] = await hiddenWebview.executeJavaScript(expr);
        } catch {
          evaluatedVars[expr] = null;
        }
      }

      // 提取完整的 outerHTML，绑定求值器
      htmlText = await hiddenWebview.executeJavaScript('document.documentElement.outerHTML');
      evaluator = async (expr: string) => {
        if (expr in evaluatedVars) {
          return evaluatedVars[expr];
        }
        try {
          return await hiddenWebview.executeJavaScript(expr);
        } catch {
          return null;
        }
      };

      // 解析数据读取完毕，立即关闭销毁后台临时 webview
      silentParseTargets.value = silentParseTargets.value.filter(t => t.id !== parseId);
    } else {
      // 解析当前页面：直接获取当前活动 webview 的 DOM HTML，并在网页内部执行 JS 读取全局变量
      const webview = document.getElementById(`webview-${tabId}`) as any;
      if (webview && typeof webview.executeJavaScript === 'function') {
        try {
          htmlText = await webview.executeJavaScript('document.documentElement.outerHTML');
          evaluator = async (code: string) => {
            return await webview.executeJavaScript(code);
          };
        } catch (err: any) {
          showMessage({
            id: toastId,
            text: `获取当前页面内容失败: ${err.message || err}`,
            type: 'error',
            duration: 2500
          });
          return;
        }
      } else {
        throw new Error('未找到当前页面的浏览器实例');
      }
    }

    const allRules = settingsState.customParseRules[props.resourceId] || [];
    const matchedRules = allRules.filter(r => matchDomainPattern(targetUrl, r.domain));

    if (matchedRules.length === 0) {
      showMessage({
        id: toastId,
        text: `未匹配到任何解析规则 (${shortLabel})`,
        type: 'error',
        duration: 2500
      });
      return;
    }

    const matchedDomainSet = new Set<string>();
    matchedRules.forEach(r => matchedDomainSet.add(r.domain));
    const uniqueMatchedDomains = Array.from(matchedDomainSet);

    if (uniqueMatchedDomains.length === 1) {
      // 单个匹配URL：直接执行规则
      await executeMatchedRulesForDomain(targetUrl, htmlText, uniqueMatchedDomains[0], toastId, evaluator, shortLabel);
    } else {
      // 多个匹配URL：加入选择排队队列
      showMessage({
        id: toastId,
        text: `匹配到多个解析规则，请在弹窗中选择 (${shortLabel})`,
        type: 'info',
        duration: 2000
      });
      requestRuleSelection({
        targetUrl,
        htmlText,
        toastId,
        shortLabel,
        matchedRules,
        evaluator
      });
    }
  } catch (err: any) {
    showMessage({
      id: toastId,
      text: `解析发生异常 (${shortLabel}): ${err.message || err}`,
      type: 'error',
      duration: 2500
    });
  } finally {
    if (isLink) {
      silentParseTargets.value = silentParseTargets.value.filter(t => t.id !== parseId);
    }
  }
};

// 触发静默解析入口：支持多任务并发与队列调度
const triggerSilentParse = () => {
  const isLink = isContextMenuTargetLink.value;
  const targetUrl = contextMenuTargetUrl.value || activeTab.value?.url;
  const tabId = contextMenuTabId.value || workspace.value?.activeTabId || '';
  contextMenuVisible.value = false;

  if (!targetUrl) {
    showMessage({ text: '未找到可解析的目标链接', type: 'error' });
    return;
  }

  const parseId = Math.random().toString(36).substring(2, 9);
  const toastId = `silent-parse-${props.resourceId}-${parseId}`;

  let shortLabel = '';
  try {
    const u = new URL(targetUrl);
    shortLabel = u.hostname + (u.pathname.length > 1 ? (u.pathname.slice(0, 15) + (u.pathname.length > 15 ? '...' : '')) : '');
  } catch {
    shortLabel = isLink ? '链接' : '页面';
  }

  showMessage({
    id: toastId,
    text: `正在解析: ${shortLabel}`,
    type: 'loading',
    duration: 0
  });

  enqueueParseTask(async () => {
    await executeSingleParseTask({
      parseId,
      toastId,
      targetUrl,
      isLink,
      tabId,
      shortLabel
    });
  });
};
const workspace = computed(() => getWorkspace(props.resourceId));
const activeTab = computed(() => workspace.value?.tabs.find(t => t.id === workspace.value?.activeTabId));

const getResourceIcon = () => {
  const isExt = settingsState.externalSites.find(r => r.id === props.resourceId);
  return isExt?.icon;
};

const init = () => {
  if (props.resourceId && currentResourceUrl.value) {
    initWorkspace(props.resourceId, currentResourceUrl.value, getResourceIcon());
  }
};

onMounted(() => {
  init();
  document.addEventListener('click', hideAllContextMenus);
  if (window.electronAPI && window.electronAPI.onWebviewNewWindow) {
    window.electronAPI.onWebviewNewWindow((data: { url: string, webContentsId: number } | string) => {
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

  if (window.electronAPI && window.electronAPI.onMediaSniffed) {
    window.electronAPI.onMediaSniffed((data: any) => {
      // data: { webContentsId: number, url: string, type: 'image'|'video', timestamp: number }
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
                updateTab(props.resourceId, tabId, { webContentsId: data.webContentsId });
              }
              break;
            }
          } catch(e) {}
        }
      }

      if (!matchedTab) {
         const win = window as any;
         if (!win._sniffedBuffer) win._sniffedBuffer = new Map();
         if (!win._sniffedBuffer.has(data.webContentsId)) {
           win._sniffedBuffer.set(data.webContentsId, []);
         }
         win._sniffedBuffer.get(data.webContentsId).push(data);
         return;
      }

      if (data.type === 'image') {
        if (!matchedTab.sniffedImages.some(m => m.url === data.url)) {
          matchedTab.sniffedImages.push({ url: data.url, timestamp: data.timestamp });
        }
      } else if (data.type === 'video') {
        if (!matchedTab.sniffedVideos.some(m => m.url === data.url)) {
          matchedTab.sniffedVideos.push({ url: data.url, timestamp: data.timestamp });
        }
      } else if (data.type === 'audio') {
        if (!matchedTab.sniffedAudios.some(m => m.url === data.url)) {
          matchedTab.sniffedAudios.push({ url: data.url, timestamp: data.timestamp });
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
  document.removeEventListener('click', hideAllContextMenus);
  window.removeEventListener('click', handleWindowClick);
  window.removeEventListener('keydown', handleGlobalKeydown);
  activeWaterfallSessions.value.forEach((_, tabId) => {
    destroyWaterfallSession(tabId);
  });
});

const handleWindowClick = (e: MouseEvent) => {
  if (e && e.button !== 0) return;
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
  destroyWaterfallSession(tabId);
  closeTab(props.resourceId, tabId);
};

const onTabMouseDown = (e: MouseEvent) => {
  if (e.button === 1) {
    e.preventDefault();
  }
};

const onTabAuxClick = (e: MouseEvent, tabId: string) => {
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    onCloseTab(tabId);
  }
};

const currentResourceUrl = computed(() => {
  const site = settingsState.externalSites.find(r => r.id === props.resourceId);
  if (site && site.url) return site.url;
  return props.resourceUrl;
});

const onAddDefaultTab = () => {
  addTab(props.resourceId, currentResourceUrl.value, getResourceIcon());
};

// Webview Events
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
          addTab(props.resourceId, targetUrl, getResourceIcon(), false);
        }
      } else if (typeof e.message === 'string' && e.message.startsWith('__velora_open_fg_tab__:')) {
        const targetUrl = e.message.slice('__velora_open_fg_tab__:'.length);
        if (targetUrl && targetUrl !== 'about:blank') {
          addTab(props.resourceId, targetUrl, getResourceIcon(), true);
        }
      } else if (typeof e.message === 'string' && e.message.startsWith('__velora_wf_bottom__:')) {
        const triggerTabId = e.message.slice('__velora_wf_bottom__:'.length);
        onWaterfallTriggerBottom(triggerTabId || tabId);
      } else if (typeof e.message === 'string' && e.message.startsWith('__velora_wf_retry__:')) {
        const triggerTabId = e.message.slice('__velora_wf_retry__:'.length);
        retryWaterfall(triggerTabId || tabId);
      }
    });
  }

  const script = `
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

  try {
    await webview.executeJavaScript(script);
  } catch (e) {}
};

const onDomReady = async (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false });
  refreshWebviewScripts(tabId, 'dom-ready');
  await injectTabBaseScripts(tabId);

  // 检查并自动应用已开启的瀑布流规则
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (webview) {
    try {
      const urlStr = webview.getURL();
      if (urlStr) {
        const allRules: WaterfallRule[] = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[props.resourceId]) || [];
        const matchedRule = allRules.find(r => {
          if (r.enabled === false || !r.domain) return false;
          return isUrlMatchPattern(r.domain, urlStr);
        });
        if (matchedRule) {
          await applyWaterfallToTab(tabId, matchedRule);
        }
      }
    } catch (e) {}
  }
};

const applyCustomStylesToWebview = async (webview: any, customUrl?: string) => {
  if (!webview) return;
  try {
    let urlStr = customUrl;
    if (!urlStr && typeof webview.getURL === 'function') {
      try { urlStr = webview.getURL(); } catch (e) {}
    }
    if (!urlStr || urlStr === 'about:blank') return;

    const stylesObj = settingsState.customStyles[props.resourceId];
    let cssText = '';

    if (stylesObj) {
      for (const [pattern, rules] of Object.entries(stylesObj)) {
        if (isUrlMatchPattern(pattern, urlStr)) {
          cssText += `${rules}\n`;
        }
      }
    }

    if (cssText && typeof webview.insertCSS === 'function') {
      await webview.insertCSS(cssText, { cssOrigin: 'user' });
    }
  } catch (e) {
    logger.warn('BrowserWorkspace', 'Failed to inject custom CSS: ' + e);
  }
};

const applyCustomScriptsToWebview = async (webview: any, runAt: string, customUrl?: string) => {
  if (!webview || typeof webview.executeJavaScript !== 'function') return;
  try {
    let urlStr = customUrl;
    if (!urlStr && typeof webview.getURL === 'function') {
      try { urlStr = webview.getURL(); } catch (e) {}
    }
    if (!urlStr || urlStr === 'about:blank') return;

    const scriptsArr = settingsState.customScripts[props.resourceId] || [];
    
    for (const script of scriptsArr) {
      if (runAt && script.runAt !== runAt) continue;
      if (isUrlMatchPattern(script.domain, urlStr) && script.code) {
        try {
          await webview.executeJavaScript(script.code);
        } catch (scriptErr) {
          logger.warn('BrowserWorkspace', 'Custom script execution error: ' + scriptErr);
        }
      }
    }
  } catch(e) {}
};

const onLoadCommit = async (event: any, tabId: string) => {
  if (event.isMainFrame) {
    refreshWebviewStyles(tabId);
    refreshWebviewScripts(tabId, 'document-start');
    await injectTabBaseScripts(tabId);
  }
};

const refreshWebviewStyles = async (tabId: string) => {
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview) return;

  try {
    let baseScrollbarCss = `
      /* Global Scrollbar Beautification */
      ::-webkit-scrollbar {
        width: 14px !important;
        height: 14px !important;
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.15) !important;
        border-radius: 10px !important;
        background-clip: padding-box !important;
        border: 4px solid transparent !important;
        min-height: 40px !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.3) !important;
        border-radius: 10px !important;
        background-clip: padding-box !important;
        border: 4px solid transparent !important;
      }
      ::-webkit-scrollbar-corner {
        background: transparent !important;
      }
    `;

    if (typeof webview.insertCSS === 'function') {
      await webview.insertCSS(baseScrollbarCss, { cssOrigin: 'user' });
    }
    await applyCustomStylesToWebview(webview);
  } catch (e) {
    logger.warn('BrowserWorkspace', 'Failed to inject CSS via insertCSS: ' + e);
  }
};

const refreshWebviewScripts = async (tabId: string, runAt: string) => {
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview) return;
  await applyCustomScriptsToWebview(webview, runAt);
};

const onStartLoading = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: true });
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (webview && webview.getWebContentsId) {
    try {
      const wcId = webview.getWebContentsId();
      updateTab(props.resourceId, tabId, { webContentsId: wcId });
      
      const win = window as any;
      if (win._sniffedBuffer && win._sniffedBuffer.has(wcId)) {
        const buffered = win._sniffedBuffer.get(wcId);
        const tab = workspace.value?.tabs.find(t => t.id === tabId);
        if (tab) {
          for (const data of buffered) {
            if (data.type === 'image') {
              if (!tab.sniffedImages.some((m: any) => m.url === data.url)) {
                tab.sniffedImages.push({ url: data.url, timestamp: data.timestamp });
              }
            } else if (data.type === 'video') {
              if (!tab.sniffedVideos.some((m: any) => m.url === data.url)) {
                tab.sniffedVideos.push({ url: data.url, timestamp: data.timestamp });
              }
            } else if (data.type === 'audio') {
              if (!tab.sniffedAudios.some((m: any) => m.url === data.url)) {
                tab.sniffedAudios.push({ url: data.url, timestamp: data.timestamp });
              }
            }
          }
          win._sniffedBuffer.delete(wcId);
        }
      }
    } catch (e) {
      // ignore
    }
  }
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
      updateTab(props.resourceId, targetId, { url: newUrl });
    }
  }
  syncAddressBar();
};

const onStopLoading = (tabId: string) => {
  updateTab(props.resourceId, tabId, { loading: false });
  refreshWebviewScripts(tabId, 'document-end');
  checkAutoApplyWaterfall(tabId);
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
      const isCms = settingsState.cmsResources.find(r => r.id === props.resourceId);
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

const addressInputUrl = ref('');

const syncAddressBar = () => {
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
  
  const wv = activeWebview();
  if (wv && wv.loadURL) {
    wv.loadURL(url);
  }
};

watch(() => workspace.value?.activeTabId, () => {
  setTimeout(syncAddressBar, 50);
});




const onClearSniffed = (type: 'image' | 'video' | 'audio') => {
  if (activeTab.value) {
    if (type === 'image') {
      activeTab.value.sniffedImages = [];
    } else if (type === 'video') {
      activeTab.value.sniffedVideos = [];
    } else if (type === 'audio') {
      activeTab.value.sniffedAudios = [];
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

const activeAudioPreview = ref<string | null>(null);
const activeVideoPreview = ref<string | null>(null);

const onPreviewSniffedAudio = (url: string) => {
  activeAudioPreview.value = url;
};

const onPreviewSniffedVideo = (url: string) => {
  activeVideoPreview.value = url;
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

// Element Picker Logic
const inspectorVisible = ref(false);

const scriptInjectorVisible = ref(false);

const toggleScriptInjector = async () => {
  if (scriptInjectorVisible.value) {
    scriptInjectorVisible.value = false;
  } else {
    await deactivateOtherFeatures('js');
    scriptInjectorVisible.value = true;
  }
};

const onExecuteScript = async (code: string) => {
  const webview = activeWebview();
  if (webview && code) {
    try {
      await webview.executeJavaScript(code);
    } catch (e: any) {
      logger.error('BrowserWorkspace', `JS Execute Error: ${e?.message || e}`);
    }
  }
};

const onSaveScript = async (script: any) => {
  if (!script.domain || !script.code) return;
  const currentScripts = { ...settingsState.customScripts };
  if (!currentScripts[props.resourceId]) {
    currentScripts[props.resourceId] = [];
  }
  
  const targetArray = currentScripts[props.resourceId];
  const trimmedDomain = script.domain.trim();
  if (!script.id) {
    script.id = 'script_' + Date.now() + Math.random().toString(36).slice(2, 6);
  }

  // 查找原脚本（如果存在）
  const originalScript = targetArray.find((s: any) => s.id === script.id);
  const isDomainChanged = originalScript ? (originalScript.domain || '').trim() !== trimmedDomain : true;

  // 1. 只有当修改了匹配URL（或新建脚本）时，才检查是否存在其他同匹配URL脚本
  if (isDomainChanged) {
    const duplicateScript = targetArray.find((s: any) => s.id !== script.id && (s.domain || '').trim() === trimmedDomain);

    if (duplicateScript) {
      const confirmed = await confirm({
        title: '匹配URL重复',
        message: `已存在相同匹配URL的脚本 "${duplicateScript.name || duplicateScript.domain}"，是否合并脚本内容？`,
        confirmText: '合并',
        cancelText: '取消',
        type: 'warning'
      });

      if (!confirmed) {
        return;
      }

      // 用户确认合并：将代码追加合并到已有脚本中
      duplicateScript.code = (duplicateScript.code || '').trim() + '\n\n' + script.code.trim();
      if (script.name && !duplicateScript.name.includes(script.name)) {
        duplicateScript.name = duplicateScript.name ? `${duplicateScript.name} & ${script.name}` : script.name;
      }

      // 如果当前正在编辑的脚本原本在列表中，将其移除（合二为一）
      const curIdx = targetArray.findIndex((s: any) => s.id === script.id);
      if (curIdx !== -1) {
        targetArray.splice(curIdx, 1);
      }

      await saveCustomScripts(currentScripts);
      showMessage('脚本已成功合并保存！', 'success');
      scriptInjectorVisible.value = false;
      return;
    }
  }

  // 2. 没有重复：在当前脚本上保存修改（通过 id 原地更新，绝不新建脚本）
  const existingIdx = targetArray.findIndex((s: any) => s.id === script.id);
  if (existingIdx !== -1) {
    targetArray[existingIdx] = { ...script, domain: trimmedDomain };
  } else {
    targetArray.push({ ...script, domain: trimmedDomain });
  }

  await saveCustomScripts(currentScripts);
  showMessage('脚本保存成功', 'success');
  scriptInjectorVisible.value = false;
};




const isInteracting = ref(false);
const isPickingElementImage = ref(false);
const isPickingElementText = ref(false);

const deactivateOtherFeatures = async (exclude: string) => {
  if (exclude !== 'js' && scriptInjectorVisible.value) {
    scriptInjectorVisible.value = false;
  }
  if (exclude !== 'css' && inspectorVisible.value) {
    inspectorVisible.value = false;
  }
  const webview = activeWebview();
  if (exclude !== 'image' && isPickingElementImage.value) {
    isPickingElementImage.value = false;
    if (webview) {
      try {
        await webview.executeJavaScript(getPickerCancelScript());
      } catch (e) {}
    }
  }
  if (exclude !== 'text' && isPickingElementText.value) {
    isPickingElementText.value = false;
    if (webview) {
      try {
        await webview.executeJavaScript(getPickerCancelScript());
      } catch (e) {}
    }
  }
  if (exclude !== 'waterfall' && waterfallPickingStep.value > 0) {
    cancelWaterfallPicking();
  }
};

// ==================== 瀑布模式 (Waterfall Flow) ====================
interface WaterfallSession {
  tabId: string;
  parentUrl: string;
  domain: string;
  rule: WaterfallRule;
  currentPage: number;
  nextUrl: string;
  status: 'preloading' | 'loaded' | 'processing' | 'finished' | 'error';
  isWaitingAtBottom: boolean;
  bottomTimeoutTimer?: any;
}

const waterfallWizardVisible = ref(false);
const waterfallWizardStep = ref(1);
const waterfallPickingStep = ref(0); // 0: none, 2: picking next, 3: picking content
const wizardTempDomain = ref('');
const wizardTempNextSelector = ref('');
const wizardTempContentSelector = ref('');
const activeWaterfallTabs = ref<Set<string>>(new Set());
const activeWaterfallSessions = ref<Map<string, WaterfallSession>>(new Map());
const selectedWaterfallRuleId = ref('');

const activeWaterfallSessionsList = computed(() => {
  return Array.from(activeWaterfallSessions.value.values());
});

const currentDomainWaterfallRules = computed<WaterfallRule[]>(() => {
  const allRules: WaterfallRule[] = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[props.resourceId]) || [];
  const currentUrl = activeTab.value?.url || '';
  if (!currentUrl) return allRules;

  const matched = allRules.filter(r => {
    if (!r.domain) return false;
    return isUrlMatchPattern(r.domain, currentUrl);
  });

  return matched.length > 0 ? matched : allRules;
});

watch(currentDomainWaterfallRules, (rules) => {
  if (rules.length > 0 && (!selectedWaterfallRuleId.value || !rules.some(r => r.id === selectedWaterfallRuleId.value))) {
    const enabledRule = rules.find(r => r.enabled === true);
    selectedWaterfallRuleId.value = enabledRule ? enabledRule.id : rules[0].id;
  }
}, { immediate: true });

const isCurrentTabWaterfallActive = computed(() => {
  const currentId = activeTab.value?.id;
  return !!currentId && activeWaterfallTabs.value.has(currentId);
});

const onStartWaterfallWizard = async () => {
  await deactivateOtherFeatures('waterfall');
  const initialUrlPattern = getDefaultUrlPattern(activeTab.value?.url);

  wizardTempDomain.value = initialUrlPattern;
  wizardTempNextSelector.value = '';
  wizardTempContentSelector.value = '';
  waterfallWizardStep.value = 1;
  waterfallWizardVisible.value = true;
};

const onStartPickingNext = async () => {
  waterfallWizardVisible.value = false;
  waterfallPickingStep.value = 2;

  const tabId = activeTab.value?.id;
  if (!tabId) return;
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview) return;

  try {
    const nextSel: string = await webview.executeJavaScript(getPickerScript('selector'));
    if (!nextSel) {
      cancelWaterfallPicking();
      return;
    }
    wizardTempNextSelector.value = nextSel;

    // 进入步骤 3: 拾取内容区
    waterfallPickingStep.value = 3;
    const contentSel: string = await webview.executeJavaScript(getPickerScript('selector'));
    if (!contentSel) {
      cancelWaterfallPicking();
      return;
    }
    wizardTempContentSelector.value = contentSel;

    // 拾取完毕，回到步骤 4 确认
    waterfallPickingStep.value = 0;
    waterfallWizardStep.value = 4;
    waterfallWizardVisible.value = true;
  } catch (e) {
    cancelWaterfallPicking();
  }
};

const onRestartPicking = () => {
  onStartPickingNext();
};

const cancelWaterfallPicking = async () => {
  waterfallPickingStep.value = 0;
  waterfallWizardVisible.value = false;
  const tabId = activeTab.value?.id;
  if (tabId) {
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (webview) {
      try {
        await webview.executeJavaScript(getPickerCancelScript());
      } catch (e) {}
    }
  }
};

const onConfirmWaterfallRule = async (ruleData: Omit<WaterfallRule, 'id'>) => {
  const newRule: WaterfallRule = {
    id: 'wf_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    ...ruleData,
    enabled: true
  };

  const allRulesObj = { ...settingsState.customWaterfallRules };
  const currentList = [...(allRulesObj[props.resourceId] || [])];
  currentList.push(newRule);
  allRulesObj[props.resourceId] = currentList;

  await saveCustomWaterfallRules(allRulesObj);
  selectedWaterfallRuleId.value = newRule.id;
  showMessage('瀑布流规则已保存并开启！', 'success');

  const tabId = activeTab.value?.id;
  if (tabId) {
    applyWaterfallToTab(tabId, newRule);
  }
};

const onSelectWaterfallRule = async (id: string) => {
  selectedWaterfallRuleId.value = id;
  const tabId = activeTab.value?.id;
  if (!tabId) return;

  const currentRules = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[props.resourceId]) || [];
  const selectedRule = currentRules.find(r => r.id === id);

  if (selectedRule) {
    if (selectedRule.enabled !== false) {
      await applyWaterfallToTab(tabId, selectedRule);
    } else if (activeWaterfallTabs.value.has(tabId)) {
      await destroyWaterfallSession(tabId);
    }
  }
};

const onDeleteWaterfallRule = async (id: string) => {
  const confirmed = await confirm({
    title: '删除瀑布流规则',
    message: '确认删除该瀑布流规则吗？',
    type: 'danger',
    confirmText: '删除'
  });
  if (!confirmed) return;

  const allRulesObj = { ...settingsState.customWaterfallRules };
  const currentList = (allRulesObj[props.resourceId] || []).filter(r => r.id !== id);
  allRulesObj[props.resourceId] = currentList;
  await saveCustomWaterfallRules(allRulesObj);

  if (selectedWaterfallRuleId.value === id) {
    selectedWaterfallRuleId.value = currentList[0]?.id || '';
  }
  showMessage('规则已删除', 'success');
};

const applyWaterfallToTab = async (tabId: string, rule: WaterfallRule) => {
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview || typeof webview.executeJavaScript !== 'function') return;
  try {
    await destroyWaterfallSession(tabId);

    // 1. 在主标签页注入监听与拼接脚本
    const initScript = getWaterfallParentInitScript({
      contentSelector: rule.contentSelector,
      nextSelector: rule.nextSelector,
      tabId
    });
    await webview.executeJavaScript(initScript);

    // 2. 提取当前主标签页的初始下一页链接
    const initialNextUrl: string = await webview.executeJavaScript(
      getWaterfallQueryInitialNextUrlScript(rule.nextSelector)
    );

    if (!initialNextUrl) {
      showMessage('当前页面未检测到下一页链接', 'info');
      try {
        await webview.executeJavaScript(`if (window.__veloraWaterfallSetStatus) window.__veloraWaterfallSetStatus('finished');`);
      } catch (e) {}
      return;
    }

    // 3. 注册会话并启动后台 Webview 加载下一页
    const session: WaterfallSession = {
      tabId,
      parentUrl: activeTab.value?.url || '',
      domain: rule.domain,
      rule,
      currentPage: 1,
      nextUrl: initialNextUrl,
      status: 'preloading',
      isWaitingAtBottom: false
    };
    activeWaterfallSessions.value.set(tabId, session);
    activeWaterfallTabs.value.add(tabId);
  } catch (e) {
    logger.warn('BrowserWorkspace', 'Failed to apply waterfall: ' + e);
  }
};

const onWaterfallBgStopLoading = async (tabId: string) => {
  const session = activeWaterfallSessions.value.get(tabId);
  if (!session || session.status !== 'preloading') return;

  session.status = 'loaded';

  // 若主标签页在后台加载期间已经触发触底等待，立即执行处理并拼接
  if (session.isWaitingAtBottom) {
    await processAndAppendWaterfall(tabId);
  }
};

const onWaterfallBgFailLoad = async (event: any, tabId: string) => {
  if (event.isMainFrame) {
    const session = activeWaterfallSessions.value.get(tabId);
    if (session) {
      if (session.bottomTimeoutTimer) {
        clearTimeout(session.bottomTimeoutTimer);
        session.bottomTimeoutTimer = undefined;
      }
      session.status = 'error';
      session.isWaitingAtBottom = false;
      const targetPage = session.currentPage + 1;
      const parentWebview = document.getElementById(`webview-${tabId}`) as any;
      if (parentWebview) {
        try {
          await parentWebview.executeJavaScript(`
            if (window.__veloraWaterfallSetSkeletonError) {
              window.__veloraWaterfallSetSkeletonError(${targetPage}, '网络请求失败');
            } else if (window.__veloraWaterfallSetStatus) {
              window.__veloraWaterfallSetStatus('error', '下一页网络请求失败');
            }
          `);
        } catch (e) {}
      }
    }
  }
};

const onWaterfallTriggerBottom = async (tabId: string) => {
  const session = activeWaterfallSessions.value.get(tabId);
  if (!session || session.status === 'finished' || session.status === 'processing' || session.status === 'error') return;

  const targetPage = session.currentPage + 1;
  if (session.status === 'loaded') {
    if (session.bottomTimeoutTimer) {
      clearTimeout(session.bottomTimeoutTimer);
      session.bottomTimeoutTimer = undefined;
    }
    await processAndAppendWaterfall(tabId);
  } else if (session.status === 'preloading') {
    session.isWaitingAtBottom = true;
    const parentWebview = document.getElementById(`webview-${tabId}`) as any;
    if (parentWebview) {
      try {
        await parentWebview.executeJavaScript(`if (window.__veloraWaterfallShowSkeleton) window.__veloraWaterfallShowSkeleton(${targetPage});`);
      } catch (e) {}
    }

    // 设置触底等待安全超时兜底（15秒）
    if (session.bottomTimeoutTimer) clearTimeout(session.bottomTimeoutTimer);
    session.bottomTimeoutTimer = setTimeout(async () => {
      if (session.status === 'preloading' && session.isWaitingAtBottom) {
        session.status = 'error';
        session.isWaitingAtBottom = false;
        const pw = document.getElementById(`webview-${tabId}`) as any;
        if (pw) {
          try {
            await pw.executeJavaScript(`
              if (window.__veloraWaterfallSetSkeletonError) {
                window.__veloraWaterfallSetSkeletonError(${targetPage}, '加载超时');
              }
            `);
          } catch (e) {}
        }
      }
    }, 15000);
  }
};

const retryWaterfall = async (tabId: string) => {
  const session = activeWaterfallSessions.value.get(tabId);
  if (!session || !session.nextUrl) return;

  if (session.bottomTimeoutTimer) {
    clearTimeout(session.bottomTimeoutTimer);
    session.bottomTimeoutTimer = undefined;
  }

  const targetPage = session.currentPage + 1;
  session.status = 'preloading';
  session.isWaitingAtBottom = true;

  const parentWebview = document.getElementById(`webview-${tabId}`) as any;
  if (parentWebview) {
    try {
      await parentWebview.executeJavaScript(`if (window.__veloraWaterfallShowSkeleton) window.__veloraWaterfallShowSkeleton(${targetPage});`);
    } catch (e) {}
  }

  const bgWebview = document.getElementById(`waterfall-bg-webview-${tabId}`) as any;
  if (bgWebview) {
    try {
      if (typeof bgWebview.reload === 'function') {
        bgWebview.reload();
      } else {
        bgWebview.src = session.nextUrl;
      }
    } catch (e) {}
  }
};

const processAndAppendWaterfall = async (tabId: string) => {
  const session = activeWaterfallSessions.value.get(tabId);
  if (!session || session.status === 'processing') return;

  if (session.bottomTimeoutTimer) {
    clearTimeout(session.bottomTimeoutTimer);
    session.bottomTimeoutTimer = undefined;
  }

  const targetPage = session.currentPage + 1;
  session.status = 'processing';
  const parentWebview = document.getElementById(`webview-${tabId}`) as any;
  const bgWebview = document.getElementById(`waterfall-bg-webview-${tabId}`) as any;

  if (!parentWebview || !bgWebview || typeof bgWebview.executeJavaScript !== 'function') {
    session.status = 'error';
    return;
  }

  try {
    // 1. 拼接前在后台专属隐藏 Webview 中执行匹配到的自定义注入脚本
    await applyCustomScriptsToWebview(bgWebview, '', session.nextUrl);

    // 2. 执行提取脚本获取内容 DOM 与后续下一页链接
    const extractScript = getWaterfallBackgroundExtractScript(session.rule.contentSelector, session.rule.nextSelector);
    const rawResult: string = await bgWebview.executeJavaScript(extractScript);
    const result: WaterfallExtractResult = JSON.parse(rawResult || '{}');

    if (result && result.hasContent && result.contentHtml) {
      session.currentPage = targetPage;
      const contentHtml = result.contentHtml;
      const nextUrl = result.nextUrl;

      // 3. 在主标签页注入拼接新内容（就地替换骨架屏或直接追加）
      const appendScript = `
        (function() {
          if (window.__veloraWaterfallAppend) {
            window.__veloraWaterfallAppend(${JSON.stringify(contentHtml)}, ${targetPage});
            if (window.__veloraWaterfallSetStatus) {
              window.__veloraWaterfallSetStatus('idle');
            }
          }
        })();
      `;
      await parentWebview.executeJavaScript(appendScript);

      // 4. 检查是否有后续下一页
      if (nextUrl && nextUrl !== session.nextUrl) {
        session.nextUrl = nextUrl;
        session.status = 'preloading';
        session.isWaitingAtBottom = false;
      } else {
        session.status = 'finished';
        session.nextUrl = '';
        session.isWaitingAtBottom = false;
        try {
          await parentWebview.executeJavaScript(`if (window.__veloraWaterfallSetStatus) window.__veloraWaterfallSetStatus('finished');`);
        } catch (e) {}
      }
    } else {
      session.status = 'finished';
      session.nextUrl = '';
      session.isWaitingAtBottom = false;
      try {
        await parentWebview.executeJavaScript(`
          if (window.__veloraWaterfallRemoveSkeleton) window.__veloraWaterfallRemoveSkeleton(${targetPage});
          if (window.__veloraWaterfallSetStatus) window.__veloraWaterfallSetStatus('finished');
        `);
      } catch (e) {}
    }
  } catch (e) {
    logger.warn('BrowserWorkspace', 'Waterfall process and append error: ' + e);
    session.status = 'error';
    session.isWaitingAtBottom = false;
    if (parentWebview) {
      try {
        await parentWebview.executeJavaScript(`
          if (window.__veloraWaterfallSetSkeletonError) {
            window.__veloraWaterfallSetSkeletonError(${targetPage}, '加载下一页异常');
          } else if (window.__veloraWaterfallSetStatus) {
            window.__veloraWaterfallSetStatus('error', '加载下一页异常');
          }
        `);
      } catch (err) {}
    }
  }
};

const destroyWaterfallSession = async (tabId: string) => {
  const session = activeWaterfallSessions.value.get(tabId);
  if (session && session.bottomTimeoutTimer) {
    clearTimeout(session.bottomTimeoutTimer);
    session.bottomTimeoutTimer = undefined;
  }
  activeWaterfallSessions.value.delete(tabId);
  activeWaterfallTabs.value.delete(tabId);
  const parentWebview = document.getElementById(`webview-${tabId}`) as any;
  if (parentWebview) {
    try {
      await parentWebview.executeJavaScript(getWaterfallDestroyScript());
    } catch (e) {}
  }
};

const checkAutoApplyWaterfall = (tabId: string) => {
  if (activeWaterfallTabs.value.has(tabId)) return;
  const tab = workspace.value?.tabs?.find(t => t.id === tabId);
  const url = tab?.url;
  if (!url || url === 'about:blank') return;

  const allRules: WaterfallRule[] = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[props.resourceId]) || [];
  const matchedRule = allRules.find(r => r.enabled === true && r.domain && isUrlMatchPattern(r.domain, url));

  if (matchedRule) {
    applyWaterfallToTab(tabId, matchedRule);
  }
};

const toggleWaterfallActive = async () => {
  const tabId = activeTab.value?.id;
  if (!tabId) return;

  const currentRules = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[props.resourceId]) || [];
  const rule = currentRules.find(r => r.id === selectedWaterfallRuleId.value) || currentDomainWaterfallRules.value[0];

  if (activeWaterfallTabs.value.has(tabId)) {
    if (rule) {
      const allRulesObj = { ...settingsState.customWaterfallRules };
      allRulesObj[props.resourceId] = currentRules.map(r => r.id === rule.id ? { ...r, enabled: false } : r);
      await saveCustomWaterfallRules(allRulesObj);
    }
    await destroyWaterfallSession(tabId);
    showMessage('已关闭瀑布模式', 'info');
  } else {
    if (!rule) {
      onStartWaterfallWizard();
      return;
    }
    const allRulesObj = { ...settingsState.customWaterfallRules };
    allRulesObj[props.resourceId] = currentRules.map(r => r.id === rule.id ? { ...r, enabled: true } : r);
    await saveCustomWaterfallRules(allRulesObj);

    await applyWaterfallToTab(tabId, rule);
    showMessage('瀑布模式已开启', 'success');
  }
};


const toggleInspector = async () => {
  if (inspectorVisible.value) {
    inspectorVisible.value = false;
  } else {
    await deactivateOtherFeatures('css');
    inspectorVisible.value = true;
  }
};

/**
 * 选取文本：完全复刻“捕获图片”的操作逻辑，支持鼠标悬停定位、
 * 鼠标滚轮(Wheel)滑动向上放大或缩小选取的 DOM 容器层级，点击抽取 selectedEl.innerText。
 */
const pickElementText = async () => {
  if (!workspace.value?.activeTabId) return;
  const webview = document.getElementById(`webview-${workspace.value.activeTabId}`) as any;
  if (!webview) return;

  if (isPickingElementText.value) {
    try {
      await webview.executeJavaScript(getPickerCancelScript());
    } catch (e) { }
    isPickingElementText.value = false;
    return;
  }

  await deactivateOtherFeatures('text');
  isPickingElementText.value = true;

  try {
    const text = await webview.executeJavaScript(getPickerScript('text'));
    isPickingElementText.value = false;
    if (text) {
      showMessage('已成功复制文本到剪贴板', 'success');
    }
  } catch (e: any) {
    isPickingElementText.value = false;
  }
};

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
      await webview.executeJavaScript(getPickerCancelScript());
    } catch (e) { }
    isPickingElementImage.value = false;
    return;
  }

  await deactivateOtherFeatures('image');
  isPickingElementImage.value = true;

  try {
    const urls: string[] = await webview.executeJavaScript(getPickerScript('image'));
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
