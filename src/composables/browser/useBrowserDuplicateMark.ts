import { ref, computed, watch, type ComputedRef } from 'vue';
import type { Tab, Workspace } from '@/composables/useWorkspaces';
import { useSettings, type DuplicateMarkRule } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { useFileDeduplication } from '@/composables/useFileDeduplication';
import { useElementPickerSession } from '@/composables/useElementPickerSession';
import { logger } from '@/services/logger';
import { getPickerScript, getPickerCancelScript } from '@/utils/elementPicker';
import {
  getDuplicateMarkScript,
  getDuplicateMarkCleanupScript
} from '@/utils/duplicateMarkEngine';
import { isSimilarExistingFile } from '@/utils/similarity';

export interface UseBrowserDuplicateMarkOptions {
  resourceId: () => string;
  workspace: ComputedRef<Workspace | undefined>;
  activeTab: ComputedRef<Tab | undefined>;
  deactivateOtherFeatures: (exclude: string) => Promise<void>;
}

/**
 * 浏览器工作区重复内容标记规则管理、预览、测试与自动注入逻辑
 */
export function useBrowserDuplicateMark(options: UseBrowserDuplicateMarkOptions) {
  const { resourceId, workspace, activeTab, deactivateOtherFeatures } = options;

  const { state: settingsState, saveCustomDuplicateRules } = useSettings();
  const { showMessage } = useMessage();
  const { fileIndexMap, isReady: isDupIndexReady } = useFileDeduplication();
  const { startElementPickingSession, endElementPickingSession } = useElementPickerSession();

  const duplicateMarkVisible = ref(false);
  const duplicatePickingType = ref<'mount' | 'title' | null>(null);
  const duplicateMarkDialogRef = ref<any>(null);

  const currentResourceDuplicateRules = computed<DuplicateMarkRule[]>(() => {
    return (settingsState.customDuplicateRules && settingsState.customDuplicateRules[resourceId()]) || [];
  });

  const buildDuplicateMarkScriptPayload = (rules: DuplicateMarkRule[]): string => {
    const fileIndexObj: Record<string, string[]> = {};
    fileIndexMap.value.forEach((paths, name) => {
      fileIndexObj[name] = paths;
    });

    return getDuplicateMarkScript({
      rules,
      fileIndex: fileIndexObj,
      theme: settingsState.theme
    });
  };

  const toggleDuplicateMark = async () => {
    if (duplicateMarkVisible.value) {
      duplicateMarkVisible.value = false;
    } else {
      await deactivateOtherFeatures('duplicateMark');
      duplicateMarkVisible.value = true;
    }
  };

  const cancelDuplicatePicking = async () => {
    duplicatePickingType.value = null;
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

  const onPickMountElement = async () => {
    duplicatePickingType.value = 'mount';
    startElementPickingSession();

    const tabId = activeTab.value?.id;
    if (!tabId) {
      cancelDuplicatePicking();
      return;
    }
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview) {
      cancelDuplicatePicking();
      return;
    }

    try {
      const sel: string = await webview.executeJavaScript(getPickerScript('selector'));
      duplicatePickingType.value = null;
      endElementPickingSession();
      if (sel && duplicateMarkDialogRef.value) {
        duplicateMarkDialogRef.value.setMountSelector(sel);
      }
    } catch {
      cancelDuplicatePicking();
    }
  };

  const onPreviewDuplicateRule = async (previewRule: DuplicateMarkRule) => {
    const tabId = activeTab.value?.id;
    if (!tabId) return;
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview || typeof webview.executeJavaScript !== 'function') return;

    // 如果未配置挂载选择器，则清除当前页面的标记
    if (!previewRule.mountSelector?.trim()) {
      try {
        await webview.executeJavaScript(getDuplicateMarkCleanupScript());
      } catch {}
      return;
    }

    // 临时替换或添加该规则用于当前活跃页面实时预览
    const currentList = [...currentResourceDuplicateRules.value];
    const idx = currentList.findIndex(r => r.id === previewRule.id);
    if (idx !== -1) {
      currentList[idx] = { ...previewRule };
    } else {
      currentList.push({ ...previewRule });
    }

    try {
      await webview.executeJavaScript(buildDuplicateMarkScriptPayload(currentList));
    } catch (err) {
      logger.warn('BrowserWorkspace', `执行标记重复预览失败: ${err}`);
    }
  };

  const applyDuplicateMarksToTab = async (tabId: string) => {
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview || typeof webview.executeJavaScript !== 'function') return;

    const rules = currentResourceDuplicateRules.value;
    if (rules.length === 0) {
      try {
        await webview.executeJavaScript(getDuplicateMarkCleanupScript());
      } catch {}
      return;
    }

    try {
      await webview.executeJavaScript(buildDuplicateMarkScriptPayload(rules));
    } catch (err) {
      logger.warn('BrowserWorkspace', `执行标记重复脚本失败: ${err}`);
    }
  };

  const applyDuplicateMarksToAllTabs = () => {
    if (workspace.value?.tabs) {
      workspace.value.tabs.forEach(t => {
        applyDuplicateMarksToTab(t.id);
      });
    }
  };

  const onSaveDuplicateRules = async (rules: DuplicateMarkRule[]) => {
    const allObj = { ...settingsState.customDuplicateRules };
    allObj[resourceId()] = rules;
    await saveCustomDuplicateRules(allObj);
    showMessage('标记重复规则已保存', 'success');
    duplicateMarkVisible.value = false;
    applyDuplicateMarksToAllTabs();
  };

  const onDeleteDuplicateRule = async (rules: DuplicateMarkRule[]) => {
    const allObj = { ...settingsState.customDuplicateRules };
    allObj[resourceId()] = rules;
    await saveCustomDuplicateRules(allObj);
    showMessage('规则已删除', 'success');
    applyDuplicateMarksToAllTabs();
  };

  const onTestDuplicateRule = async (rule: DuplicateMarkRule) => {
    const tabId = activeTab.value?.id;
    if (!tabId) {
      showMessage('未找到当前活动标签页', 'error');
      return;
    }
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview || typeof webview.executeJavaScript !== 'function') {
      showMessage('当前页面尚未准备就绪', 'error');
      return;
    }

    if (!rule.mountSelector?.trim()) {
      showMessage('请输入挂载元素选择器', 'error');
      return;
    }

    const mountSelector = JSON.stringify(rule.mountSelector.trim());
    const titleSelector = JSON.stringify((rule.titleSelector || '').trim());
    const titleAttr = JSON.stringify((rule.titleAttribute || 'innerText').trim() || 'innerText');
    const extractScript = `
      (function() {
        try {
          const nodes = document.querySelectorAll(${mountSelector});
          const results = [];
          nodes.forEach((mountEl, idx) => {
            let targetEl = mountEl;
            const tSel = ${titleSelector};
            if (tSel) {
              try {
                targetEl = mountEl.querySelector(tSel);
              } catch (e) {
                targetEl = null;
              }
            }
            if (!targetEl) return;
            const tAttr = ${titleAttr};
            let rawVal = targetEl[tAttr];
            if (rawVal === undefined || rawVal === null) {
              if (typeof targetEl.getAttribute === 'function') {
                rawVal = targetEl.getAttribute(tAttr);
              }
            }
            const text = (rawVal != null) ? String(rawVal).trim() : '';
            if (text) {
              results.push({ index: idx + 1, text });
            }
          });
          return { success: true, items: results };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })()
    `;

    try {
      const extractRes = await webview.executeJavaScript(extractScript);
      if (!extractRes || !extractRes.success) {
        showMessage('从当前页面抓取元素失败: ' + (extractRes?.error || '未知错误'), 'error');
        return;
      }

      const pageItems: Array<{ index: number; text: string }> = extractRes.items || [];
      const localFileKeys: string[] = Array.from(fileIndexMap.value.keys());
      const regexPattern = (rule.regexPattern || '').trim();

      const extractByRegex = (pattern: string, str: string): string | null => {
        if (!pattern || !str) return null;
        try {
          const re = new RegExp(pattern, 'i');
          const m = str.match(re);
          if (!m || !m[0]) return null;
          const trimmed = m[0].trim().toLowerCase();
          return trimmed.length > 0 ? trimmed : null;
        } catch {
          return null;
        }
      };

      const tableData: any[] = [];

      if (regexPattern) {
        // 自定义正则提取比对
        const localExtractedMap = new Map<string, string>();
        for (const k of localFileKeys) {
          const extVal = extractByRegex(regexPattern, k);
          if (extVal) {
            localExtractedMap.set(k, extVal);
          }
        }

        for (const item of pageItems) {
          const pageExtracted = extractByRegex(regexPattern, item.text);
          const matchedFiles: string[] = [];
          if (pageExtracted) {
            for (const [k, extVal] of localExtractedMap.entries()) {
              if (extVal === pageExtracted) {
                matchedFiles.push(k);
              }
            }
          }
          tableData.push({
            '序号': item.index,
            '网页提取标题': item.text,
            '网页正则提取值': pageExtracted ?? '(未匹配)',
            '匹配结果': matchedFiles.length > 0 ? '已下载 (命中)' : '未命中',
            '命中的本地文件': matchedFiles.length > 0 ? matchedFiles.join('; ') : '-',
            '匹配规则': `正则: ${regexPattern}`
          });
        }
      } else {
        // 留空使用默认算法
        for (const item of pageItems) {
          let matchedFile: string | null = null;
          let matchType: 'exact' | 'similar' | 'none' = 'none';

          if (fileIndexMap.value.has(item.text)) {
            matchedFile = item.text;
            matchType = 'exact';
          } else {
            for (const k of localFileKeys) {
              if (isSimilarExistingFile(k, item.text)) {
                matchedFile = k;
                matchType = 'similar';
                break;
              }
            }
          }

          tableData.push({
            '序号': item.index,
            '网页提取标题': item.text,
            '网页正则提取值': '(未配置正则，默认算法)',
            '匹配结果': matchType !== 'none' ? `已下载 (${matchType === 'exact' ? '全名精确' : '相似'})` : '未命中',
            '命中的本地文件': matchedFile || '-',
            '匹配规则': '默认算法 (全名 / LCS相似度)'
          });
        }
      }

      // 尝试打开 Webview 开发者工具并向 Webview 内置控制台输出测试结果
      try {
        if (typeof webview.openDevTools === 'function') {
          webview.openDevTools();
        }
      } catch {}

      const logPayload = JSON.stringify({
        ruleTitle: rule.name || rule.domain || '当前规则',
        rule,
        pageCount: pageItems.length,
        localCount: localFileKeys.length,
        pageTexts: pageItems.map(p => p.text),
        localFiles: localFileKeys,
        tableData
      });
      const printScript = `
        (function() {
          try {
            const data = ${logPayload};
            console.group('%c[Velora 标记重复匹配测试] 规则: ' + data.ruleTitle, 'color: #3b82f6; font-weight: bold; font-size: 13px;');
            console.log('规则配置详情:', data.rule);
            console.log('当前页面 URL:', window.location.href);
            console.log('页面抓取到 ' + data.pageCount + ' 个待匹配卡片项, 本地去重库包含 ' + data.localCount + ' 个文件');
            console.log('【待匹配方 A (网页端提取文本)】:', data.pageTexts);
            console.log('【待匹配方 B (本地去重库文件名)】:', data.localFiles);
            console.log('--- 匹配详细结果汇总表 ---');
            if (data.tableData && data.tableData.length > 0) {
              console.table(data.tableData);
            } else {
              console.warn('[Velora] 当前页面未抓取到任何匹配元素，请检查挂载选择器是否有效');
            }
            console.groupEnd();
          } catch (e) {
            console.error('[Velora] 打印测试结果失败', e);
          }
        })()
      `;
      try {
        await webview.executeJavaScript(printScript);
      } catch (e: any) {
        logger.warn('BrowserWorkspace', `向 Webview 注入控制台日志失败: ${e?.message || e}`);
      }

      if (pageItems.length === 0) {
        showMessage('当前页面未找到匹配挂载选择器的元素', 'warning');
      } else {
        showMessage('结果已输出至控制台', 'info');
      }
    } catch (err: any) {
      logger.error('BrowserWorkspace', `执行标记重复测试异常: ${err.message}`);
      showMessage('执行测试失败: ' + err.message, 'error');
    }
  };

  watch(duplicateMarkVisible, (val) => {
    if (!val) {
      // 弹窗关闭时，若未保存或取消，恢复当前活跃标签页的已存规则效果
      const tabId = activeTab.value?.id;
      if (tabId) {
        applyDuplicateMarksToTab(tabId);
      }
    }
  });

  watch([() => currentResourceDuplicateRules.value, isDupIndexReady, () => settingsState.theme], () => {
    applyDuplicateMarksToAllTabs();
  }, { deep: true });

  return {
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
    applyDuplicateMarksToTab,
    applyDuplicateMarksToAllTabs
  };
}
