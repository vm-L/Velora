import { ref, nextTick, type ComputedRef } from 'vue';
import type { Tab } from '@/composables/useWorkspaces';
import { useSettings, type ParseRule, type ParseRuleItem } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { useSaveMediaDialog } from '@/composables/useSaveMediaDialog';
import { logger } from '@/services/logger';
import { sanitizeFilename } from '@/utils/filename';
import { isUrlMatchPattern } from '@/utils/urlMatcher';

interface PendingRuleSelectItem {
  targetUrl: string;
  htmlText: string;
  toastId: string;
  shortLabel: string;
  matchedRules: ParseRule[];
  evaluator?: (expr: string) => Promise<any>;
}

export interface UseBrowserSilentParserOptions {
  resourceId: () => string;
  activeTab: ComputedRef<Tab | undefined>;
  getCurrentPageOrigin: () => string;
  onRefresh: () => void;
}

const MAX_CONCURRENT_PARSE = 3;

/**
 * 浏览器工作区解析规则管理、后台静默链接抓取与解析队列调度逻辑
 */
export function useBrowserSilentParser(options: UseBrowserSilentParserOptions) {
  const { resourceId, activeTab, getCurrentPageOrigin, onRefresh } = options;
  const { state: settingsState } = useSettings();
  const { showMessage } = useMessage();
  const { openSaveMediaDialog } = useSaveMediaDialog();

  const parseRuleVisible = ref(false);
  const silentParseTargets = ref<Array<{ url: string; id: string }>>([]);
  const ruleSelectModalVisible = ref(false);
  const pendingMatchingRules = ref<ParseRule[]>([]);

  const pendingRuleSelectQueue: PendingRuleSelectItem[] = [];
  let currentRuleSelectItem: PendingRuleSelectItem | null = null;

  let activeParseCount = 0;
  const parseTaskQueue: Array<() => Promise<void>> = [];

  const toggleParseRule = () => {
    parseRuleVisible.value = !parseRuleVisible.value;
  };

  const onSaveParseRule = async () => {
    parseRuleVisible.value = false;
    onRefresh();
  };

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
          const patternStr = match[1];
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
    const allRules = settingsState.customParseRules[resourceId()] || [];
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
            duration: 3000
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
          duration: 2000
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
            duration: 2000
          });
        } catch (err: any) {
          showMessage({
            id: toastId,
            text: `复制到剪切板失败: ${err.message || err}`,
            type: 'error',
            duration: 3000
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

  const openNextRuleSelection = (item: PendingRuleSelectItem) => {
    currentRuleSelectItem = item;
    pendingMatchingRules.value = item.matchedRules;
    ruleSelectModalVisible.value = true;
  };

  const requestRuleSelection = (item: PendingRuleSelectItem) => {
    if (ruleSelectModalVisible.value) {
      pendingRuleSelectQueue.push(item);
    } else {
      openNextRuleSelection(item);
    }
  };

  const flushNextQueuedRuleSelection = () => {
    if (pendingRuleSelectQueue.length > 0) {
      const nextItem = pendingRuleSelectQueue.shift()!;
      nextTick(() => {
        openNextRuleSelection(nextItem);
      });
    }
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

    flushNextQueuedRuleSelection();
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
        duration: 2000
      });
    }

    flushNextQueuedRuleSelection();
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
      const resId = resourceId();

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
        const workspaceScripts = settingsState.customScripts[resId] || [];
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
        const allRules = settingsState.customParseRules[resId] || [];
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
              duration: 3000
            });
            return;
          }
        } else {
          throw new Error('未找到当前页面的浏览器实例');
        }
      }

      const allRules = settingsState.customParseRules[resId] || [];
      const matchedRules = allRules.filter(r => matchDomainPattern(targetUrl, r.domain));

      if (matchedRules.length === 0) {
        showMessage({
          id: toastId,
          text: `未匹配到任何解析规则 (${shortLabel})`,
          type: 'error',
          duration: 3000
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
        duration: 3000
      });
    } finally {
      if (isLink) {
        silentParseTargets.value = silentParseTargets.value.filter(t => t.id !== parseId);
      }
    }
  };

  /**
   * 发起静默解析任务并进入并发调度队列
   */
  const startSilentParse = (params: { isLink: boolean; targetUrl?: string; tabId?: string }) => {
    const isLink = params.isLink;
    const targetUrl = params.targetUrl || activeTab.value?.url;
    const tabId = params.tabId || '';

    if (!targetUrl) {
      showMessage({ text: '未找到可解析的目标链接', type: 'error' });
      return;
    }

    const parseId = Math.random().toString(36).substring(2, 9);
    const toastId = `silent-parse-${resourceId()}-${parseId}`;

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

  return {
    parseRuleVisible,
    toggleParseRule,
    onSaveParseRule,
    silentParseTargets,
    ruleSelectModalVisible,
    pendingMatchingRules,
    onRuleSelected,
    onRuleSelectCancelled,
    startSilentParse
  };
}
