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
        <button class="func-btn tooltip-left" v-tooltip="'后退'" @click="onBack">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <button class="func-btn tooltip-left" v-tooltip="'前进'" @click="onForward">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
        <button class="func-btn tooltip-left" v-tooltip="'刷新'" @click="onRefresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        
        <button class="func-btn tooltip-left" v-tooltip="'开发者工具'" @click="onDevTools">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </button>

      </div>
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

    <!-- Hidden Webview for Silent Link Parsing -->
    <div v-if="silentParseTarget" style="position: fixed; top: -9999px; left: -9999px; width: 1280px; height: 800px; opacity: 0; pointer-events: none; overflow: hidden; z-index: -999;">
      <webview
        :src="silentParseTarget.url"
        :id="`silent-webview-${silentParseTarget.id}`"
        allowpopups
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
import { useWorkspaces } from '../../composables/useWorkspaces';
import { useSettings, type ParseRule, type ParseRuleItem } from '../../composables/useSettings';
import { logger } from '../../services/logger';
import { sanitizeFilename } from '../../utils/filename';

import VButton from '../base/VButton.vue';
import VIcon from '../base/VIcon.vue';
const InspectorDialog = defineAsyncComponent(() => import('../features/InspectorDialog.vue'));
const ScriptInjectorDialog = defineAsyncComponent(() => import('../features/ScriptInjectorDialog.vue'));
import ParseRuleDialog from '../features/ParseRuleDialog.vue';
import ParseRuleSelectDialog from '../features/ParseRuleSelectDialog.vue';
import SnifferDropdown from '../features/SnifferDropdown.vue';
import ImagePreviewDialog from '../features/ImagePreviewDialog.vue';
import AudioPlayerDialog from '../features/AudioPlayerDialog.vue';
import VideoPlayerDialog from '../features/VideoPlayerDialog.vue';
import { APP_PREFIX } from '../../constants';
import { getPickerScript, getPickerCancelScript } from '../../utils/elementPicker';


import { useMessage } from '../../composables/useMessage';
import { useSaveMediaDialog } from '../../composables/useSaveMediaDialog';

const props = defineProps<{
  resourceId: string;
  resourceUrl: string;
}>();

const parseRuleVisible = ref(false);
const toggleParseRule = () => {
  parseRuleVisible.value = !parseRuleVisible.value;
};

const { showMessage } = useMessage();
const { openSaveMediaDialog, isDraggingAnyDialog } = useSaveMediaDialog();
const { initWorkspace, getWorkspace, addTab, closeTab, updateTab } = useWorkspaces();
const { state: settingsState, saveCustomStyles, saveCustomScripts, saveExternalSites, saveCmsResources } = useSettings();

const contextMenuVisible = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuTabId = ref('');
const contextMenuTargetUrl = ref('');
const isContextMenuTargetLink = ref(false);
const contextMenuRef = ref<HTMLElement | null>(null);
const silentParseTarget = ref<{ url: string; id: string } | null>(null);

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


const ruleSelectModalVisible = ref(false);
const pendingMatchingRules = ref<ParseRule[]>([]);
const pendingParseContext = ref<{ targetUrl: string; htmlText: string; toastId: string; evaluator?: (expr: string) => Promise<any> } | null>(null);
const isParsingHtml = ref(false);

// 域名通配符匹配逻辑
const matchDomainPattern = (urlStr: string, domainPattern: string): boolean => {
  if (!urlStr || !domainPattern) return false;
  const pattern = domainPattern.trim();
  if (pattern === '*' || pattern === '*://*/*' || pattern === '*://*') return true;

  try {
    const urlObj = new URL(urlStr);
    const host = urlObj.hostname;

    // 1. 转为精确通配符正则表达式
    const escapedPattern = pattern
      .replace(/[+?^${}()|[\]\\]/g, '\\$&') // 转义正则元字符，保留 . 和 *
      .replace(/\./g, '\\.')              // . 转为 \.
      .replace(/\*/g, '.*');              // * 转为 .*

    const reg = new RegExp(`^${escapedPattern}$`, 'i');
    if (reg.test(urlStr) || reg.test(host)) return true;

    // 2. 补全末尾斜杠兼容 (如 https://www.bilibili.com 匹配 *://www.bilibili.com/*)
    const altUrl = urlStr.endsWith('/') ? urlStr.slice(0, -1) : (urlStr + '/');
    if (reg.test(altUrl)) return true;

    // 3. 主机名与基础域名后缀匹配回退
    const cleanPattern = pattern
      .replace(/^\*:\/\//, '')
      .replace(/\/\*$/, '')
      .replace(/^\*\./, '')
      .replace(/\*/g, '');

    if (cleanPattern) {
      if (host === cleanPattern || host.endsWith('.' + cleanPattern) || urlStr.includes(cleanPattern)) {
        return true;
      }
    }
  } catch {
    if (domainPattern === '*' || urlStr.includes(domainPattern)) return true;
  }

  return false;
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

// 执行特定匹配域名规则的所有行为类型
const executeMatchedRulesForDomain = async (
  _targetUrl: string,
  htmlText: string,
  selectedDomain: string,
  toastId: string,
  evaluator?: (expr: string) => Promise<any>
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
          text: '解析失败：未从当前页面匹配到有效的文件名或文件链接',
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
        text: '解析成功',
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
          text: '解析成功，数据已复制到剪切板！',
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
      text: '所选规则暂无配置解析项',
      type: 'error',
      duration: 2000
    });
  }
};

const triggerSilentParse = async () => {
  const isLink = isContextMenuTargetLink.value;
  contextMenuVisible.value = false;
  const targetUrl = contextMenuTargetUrl.value || activeTab.value?.url;
  if (!targetUrl) {
    showMessage({ text: '未找到可解析的目标链接', type: 'error' });
    return;
  }

  const toastId = `silent-parse-${props.resourceId}`;
  const labelText = isLink ? '链接' : '页面';

  showMessage({
    id: toastId,
    text: `正在解析${labelText}`,
    type: 'loading',
    duration: 0
  });

  isParsingHtml.value = true;
  try {
    let htmlText = '';
    let evaluator: ((expr: string) => Promise<any>) | undefined;

    if (isLink) {
      // 解析超链接：在后台静默挂载一个完全隐藏的独立 webview 容器（标签栏完全不展示）
      const parseId = Math.random().toString(36).substring(2, 9);
      silentParseTarget.value = { url: targetUrl, id: parseId };
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

      // 收集可能需要求值的全局变量表达式 (既非 /.../ 正则也非引号字符串)
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
      silentParseTarget.value = null;
    } else {
      // 解析当前页面：直接获取当前活动 webview 的 DOM HTML，并在网页内部执行 JS 读取全局变量
      const tabId = contextMenuTabId.value || workspace.value?.activeTabId;
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

    // 根据 URL 匹配该 workspace 下的解析规则
    const matchedRules = allRules.filter(r => matchDomainPattern(targetUrl, r.domain));

    if (matchedRules.length === 0) {
      showMessage({
        id: toastId,
        text: '当前页面 URL 未匹配到任何解析规则，请先配置解析规则',
        type: 'error',
        duration: 2500
      });
      return;
    }

    // 按域名规则匹配项分组
    const matchedDomainSet = new Set<string>();
    matchedRules.forEach(r => matchedDomainSet.add(r.domain));
    const uniqueMatchedDomains = Array.from(matchedDomainSet);

    if (uniqueMatchedDomains.length === 1) {
      // 单个匹配规则：直接执行规则
      await executeMatchedRulesForDomain(targetUrl, htmlText, uniqueMatchedDomains[0], toastId, evaluator);
    } else {
      // 多个匹配规则：弹窗让用户手动选择执行哪个规则
      pendingMatchingRules.value = matchedRules;
      pendingParseContext.value = { targetUrl, htmlText, toastId, evaluator };
      ruleSelectModalVisible.value = true;
      showMessage({
        id: toastId,
        text: '页面匹配到多个解析规则，请在弹窗中选择',
        type: 'info',
        duration: 2000
      });
    }
  } catch (err: any) {
    showMessage({
      id: toastId,
      text: `解析发生异常: ${err.message || err}`,
      type: 'error',
      duration: 2500
    });
  } finally {
    isParsingHtml.value = false;
    silentParseTarget.value = null;
  }
};

const onRuleSelected = async (selectedDomain: string) => {
  if (pendingParseContext.value) {
    const { targetUrl, htmlText, toastId, evaluator } = pendingParseContext.value;
    showMessage({
      id: toastId,
      text: '正在执行选定的解析规则',
      type: 'loading',
      duration: 0
    });
    await executeMatchedRulesForDomain(targetUrl, htmlText, selectedDomain, toastId, evaluator);
    pendingParseContext.value = null;
  }
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
  closeTab(props.resourceId, tabId);
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

    refreshWebviewScripts(tabId, 'dom-ready');

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
    refreshWebviewScripts(tabId, 'document-start');
  }
};

const refreshWebviewStyles = async (tabId: string) => {
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview) return;

  try {
    const urlStr = webview.getURL();
    const stylesObj = settingsState.customStyles[props.resourceId];
    let cssText = `
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

    if (stylesObj) {
      for (const [pattern, rules] of Object.entries(stylesObj)) {
        let isMatch = false;
        if (!pattern.includes('*') && !pattern.includes('/')) {
          try {
            isMatch = new URL(urlStr).hostname.endsWith(pattern);
          } catch (e) { }
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
    logger.warn('BrowserWorkspace', 'Failed to inject CSS via insertCSS: ' + e);
  }
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
  const idx = targetArray.findIndex((s: any) => s.domain === script.domain && s.name === script.name);
  if (!script.id) {
    script.id = Date.now().toString();
  }
  
  if (idx !== -1) {
    targetArray[idx] = script;
  } else {
    targetArray.push(script);
  }
  
  await saveCustomScripts(currentScripts);
  showMessage('脚本保存成功', 'success');
};

const refreshWebviewScripts = async (tabId: string, runAt: string) => {
  const webview = document.getElementById(`webview-${tabId}`) as any;
  if (!webview) return;
  try {
    const urlStr = webview.getURL();
    const scriptsArr = settingsState.customScripts[props.resourceId] || [];
    
    for (const script of scriptsArr) {
      if (script.runAt !== runAt) continue;
      
      let isMatch = false;
      const pattern = script.domain;
      if (!pattern.includes('*') && !pattern.includes('/')) {
        try {
          isMatch = new URL(urlStr).hostname.endsWith(pattern);
        } catch(e){}
      } else if (pattern.startsWith('*://') && pattern.endsWith('/*')) {
        const domainMatch = pattern.replace('*://', '').replace('/*', '');
        try {
          const host = new URL(urlStr).hostname;
          isMatch = host.endsWith(domainMatch.replace('*.', ''));
        } catch(e){}
      } else {
        const regexStr = pattern.replace(/\*/g, '.*').replace(/\//g, '\/');
        const regex = new RegExp(`^${regexStr}$`);
        isMatch = regex.test(urlStr);
      }
      
      if (isMatch && script.code) {
        await webview.executeJavaScript(script.code);
      }
    }
  } catch(e) {}
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
  max-width: 400px;
  min-width: 200px;
  margin-left: 12px;
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

</style>
