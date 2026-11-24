import { ref, computed, watch, type ComputedRef } from 'vue';
import type { Tab, Workspace } from '@/composables/useWorkspaces';
import { useSettings, type WaterfallRule } from '@/composables/useSettings';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import { useElementPickerSession } from '@/composables/useElementPickerSession';
import { logger } from '@/services/logger';
import { getPickerScript, getPickerCancelScript } from '@/utils/elementPicker';
import { isUrlMatchPattern, getDefaultUrlPattern } from '@/utils/urlMatcher';
import {
  getWaterfallParentInitScript,
  getWaterfallBackgroundExtractScript,
  getWaterfallQueryInitialNextUrlScript,
  getWaterfallDestroyScript,
  type WaterfallExtractResult
} from '@/utils/waterfallEngine';

export interface WaterfallSession {
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

export interface UseBrowserWaterfallOptions {
  resourceId: () => string;
  workspace: ComputedRef<Workspace | undefined>;
  activeTab: ComputedRef<Tab | undefined>;
  applyCustomScriptsToWebview: (webview: any, runAt: string, customUrl?: string) => Promise<void>;
  onRefresh: () => void;
  deactivateOtherFeatures: (exclude: string) => Promise<void>;
}

/**
 * 浏览器工作区瀑布流向导、预加载会话调度与 DOM 拼接逻辑
 */
export function useBrowserWaterfall(options: UseBrowserWaterfallOptions) {
  const {
    resourceId,
    workspace,
    activeTab,
    applyCustomScriptsToWebview,
    onRefresh,
    deactivateOtherFeatures
  } = options;

  const { state: settingsState, saveCustomWaterfallRules } = useSettings();
  const { confirm } = useConfirm();
  const { showMessage } = useMessage();
  const { startElementPickingSession, endElementPickingSession } = useElementPickerSession();

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
    const allRules: WaterfallRule[] = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[resourceId()]) || [];
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
      } catch {}
    }
  };

  const destroyAllWaterfallSessions = () => {
    activeWaterfallSessions.value.forEach((_, tabId) => {
      destroyWaterfallSession(tabId);
    });
  };

  const cancelWaterfallPicking = async () => {
    waterfallPickingStep.value = 0;
    waterfallWizardVisible.value = false;
    endElementPickingSession();
    const tabId = activeTab.value?.id;
    if (tabId) {
      const webview = document.getElementById(`webview-${tabId}`) as any;
      if (webview) {
        try {
          await webview.executeJavaScript(getPickerCancelScript());
        } catch {}
      }
    }
  };

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
    startElementPickingSession();

    const tabId = activeTab.value?.id;
    if (!tabId) {
      cancelWaterfallPicking();
      return;
    }
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview) {
      cancelWaterfallPicking();
      return;
    }

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
      endElementPickingSession();
    } catch {
      cancelWaterfallPicking();
    }
  };

  const onRestartPicking = () => {
    onStartPickingNext();
  };

  const onConfirmWaterfallRule = async (ruleData: Omit<WaterfallRule, 'id'>) => {
    const resId = resourceId();
    const newRule: WaterfallRule = {
      id: 'wf_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      ...ruleData,
      enabled: true
    };

    const allRulesObj = { ...settingsState.customWaterfallRules };
    const currentList = [...(allRulesObj[resId] || [])];
    currentList.push(newRule);
    allRulesObj[resId] = currentList;

    await saveCustomWaterfallRules(allRulesObj);
    selectedWaterfallRuleId.value = newRule.id;
    showMessage('瀑布流规则已保存并开启！', 'success');
    waterfallWizardVisible.value = false;
    onRefresh();
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
        } catch {}
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

  const onSelectWaterfallRule = async (id: string) => {
    selectedWaterfallRuleId.value = id;
    const tabId = activeTab.value?.id;
    if (!tabId) return;

    const currentRules = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[resourceId()]) || [];
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

    const resId = resourceId();
    const allRulesObj = { ...settingsState.customWaterfallRules };
    const currentList = (allRulesObj[resId] || []).filter(r => r.id !== id);
    allRulesObj[resId] = currentList;
    await saveCustomWaterfallRules(allRulesObj);

    if (selectedWaterfallRuleId.value === id) {
      selectedWaterfallRuleId.value = currentList[0]?.id || '';
    }
    showMessage('规则已删除', 'success');
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
          } catch {}
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
        } catch {}
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
        } catch {}
      }
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
          } catch {}
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
        } catch {}
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
            } catch {}
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
      } catch {}
    }

    const bgWebview = document.getElementById(`waterfall-bg-webview-${tabId}`) as any;
    if (bgWebview) {
      try {
        if (typeof bgWebview.reload === 'function') {
          bgWebview.reload();
        } else {
          bgWebview.src = session.nextUrl;
        }
      } catch {}
    }
  };

  /**
   * dom-ready 阶段自动应用瀑布流规则（保持 enabled !== false 判断口径）
   */
  const checkDomReadyWaterfall = async (tabId: string) => {
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview) return;
    try {
      const urlStr = webview.getURL();
      if (urlStr) {
        const allRules: WaterfallRule[] = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[resourceId()]) || [];
        const matchedRule = allRules.find(r => {
          if (r.enabled === false || !r.domain) return false;
          return isUrlMatchPattern(r.domain, urlStr);
        });
        if (matchedRule) {
          await applyWaterfallToTab(tabId, matchedRule);
        }
      }
    } catch {}
  };

  /**
   * did-stop-loading 阶段兜底检查自动应用瀑布流规则（保持 enabled === true 判断口径）
   */
  const checkAutoApplyWaterfall = (tabId: string) => {
    if (activeWaterfallTabs.value.has(tabId)) return;
    const tab = workspace.value?.tabs?.find(t => t.id === tabId);
    const url = tab?.url;
    if (!url || url === 'about:blank') return;

    const allRules: WaterfallRule[] = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[resourceId()]) || [];
    const matchedRule = allRules.find(r => r.enabled === true && r.domain && isUrlMatchPattern(r.domain, url));

    if (matchedRule) {
      applyWaterfallToTab(tabId, matchedRule);
    }
  };

  const toggleWaterfallActive = async () => {
    const tabId = activeTab.value?.id;
    if (!tabId) return;

    const resId = resourceId();
    const currentRules = (settingsState.customWaterfallRules && settingsState.customWaterfallRules[resId]) || [];
    const rule = currentRules.find(r => r.id === selectedWaterfallRuleId.value) || currentDomainWaterfallRules.value[0];

    if (activeWaterfallTabs.value.has(tabId)) {
      if (rule) {
        const allRulesObj = { ...settingsState.customWaterfallRules };
        allRulesObj[resId] = currentRules.map(r => r.id === rule.id ? { ...r, enabled: false } : r);
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
      allRulesObj[resId] = currentRules.map(r => r.id === rule.id ? { ...r, enabled: true } : r);
      await saveCustomWaterfallRules(allRulesObj);

      await applyWaterfallToTab(tabId, rule);
      showMessage('瀑布模式已开启', 'success');
    }
  };

  return {
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
  };
}
