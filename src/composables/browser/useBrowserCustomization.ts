import { ref, watch, type ComputedRef } from 'vue';
import type { Tab, Workspace } from '@/composables/useWorkspaces';
import { useSettings } from '@/composables/useSettings';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import { useElementPickerSession } from '@/composables/useElementPickerSession';
import { logger } from '@/services/logger';
import { APP_PREFIX } from '@/constants';
import { getPickerScript, getPickerCancelScript } from '@/utils/elementPicker';
import { isUrlMatchPattern } from '@/utils/urlMatcher';

const BASE_SCROLLBAR_CSS = `
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

export interface UseBrowserCustomizationOptions {
  resourceId: () => string;
  workspace: ComputedRef<Workspace | undefined>;
  activeTab: ComputedRef<Tab | undefined>;
  activeWebview: () => any;
  onRefresh: () => void;
  addImagePreview: (urls: string[]) => void;
  deactivateOtherFeatures: (exclude: string) => Promise<void>;
}

/**
 * 浏览器工作区样式审查注入、自定义 JS 脚本注入与元素拾取（图片/文本）逻辑
 */
export function useBrowserCustomization(options: UseBrowserCustomizationOptions) {
  const {
    resourceId,
    workspace,
    activeTab,
    activeWebview,
    onRefresh,
    addImagePreview,
    deactivateOtherFeatures
  } = options;

  const { state: settingsState, saveCustomStyles, saveCustomScripts } = useSettings();
  const { confirm } = useConfirm();
  const { showMessage } = useMessage();
  const { startElementPickingSession, endElementPickingSession } = useElementPickerSession();

  const inspectorVisible = ref(false);
  const scriptInjectorVisible = ref(false);
  const isPickingElementImage = ref(false);
  const isPickingElementText = ref(false);

  const toggleScriptInjector = async () => {
    if (scriptInjectorVisible.value) {
      scriptInjectorVisible.value = false;
    } else {
      await deactivateOtherFeatures('js');
      scriptInjectorVisible.value = true;
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

  const applyCustomStylesToWebview = async (webview: any, customUrl?: string) => {
    if (!webview) return;
    try {
      let urlStr = customUrl;
      if (!urlStr && typeof webview.getURL === 'function') {
        try { urlStr = webview.getURL(); } catch {}
      }
      if (!urlStr || urlStr === 'about:blank') return;

      const stylesObj = settingsState.customStyles[resourceId()];
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
        try { urlStr = webview.getURL(); } catch {}
      }
      if (!urlStr || urlStr === 'about:blank') return;

      const scriptsArr = settingsState.customScripts[resourceId()] || [];

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
    } catch {}
  };

  const refreshWebviewStyles = async (tabId: string) => {
    const webview = document.getElementById(`webview-${tabId}`) as any;
    if (!webview) return;

    try {
      if (typeof webview.insertCSS === 'function') {
        await webview.insertCSS(BASE_SCROLLBAR_CSS, { cssOrigin: 'user' });
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
    const resId = resourceId();
    const currentScripts = { ...settingsState.customScripts };
    if (!currentScripts[resId]) {
      currentScripts[resId] = [];
    }

    const targetArray = currentScripts[resId];
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
        onRefresh();
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
    onRefresh();
  };

  const onDeleteScript = async (scriptId: string) => {
    const resId = resourceId();
    const currentScripts = { ...settingsState.customScripts };
    if (currentScripts[resId]) {
      currentScripts[resId] = currentScripts[resId].filter((s: any) => s.id !== scriptId);
      await saveCustomScripts(currentScripts);
      showMessage('自定义脚本已删除', 'success');
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

    const resId = resourceId();
    const newStyles = { ...settingsState.customStyles };
    if (!newStyles[resId]) newStyles[resId] = {};

    if (cssString.trim()) {
      newStyles[resId][domain] = cssString;
    } else {
      delete newStyles[resId][domain];
    }

    await saveCustomStyles(newStyles);
    showMessage('自定义样式保存成功', 'success');
    if (workspace.value?.activeTabId) {
      refreshWebviewStyles(workspace.value.activeTabId);
    }
  };

  const onDeleteStyle = async (delDomain: string) => {
    const resId = resourceId();
    const newStyles = { ...settingsState.customStyles };
    if (newStyles[resId]) {
      delete newStyles[resId][delDomain];
      await saveCustomStyles(newStyles);
      showMessage('自定义样式已删除', 'success');
      if (workspace.value?.activeTabId) {
        refreshWebviewStyles(workspace.value.activeTabId);
      }
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
      } catch {}
      isPickingElementText.value = false;
      endElementPickingSession();
      return;
    }

    await deactivateOtherFeatures('text');
    isPickingElementText.value = true;
    startElementPickingSession();

    try {
      const text = await webview.executeJavaScript(getPickerScript('text'));
      isPickingElementText.value = false;
      endElementPickingSession();
      if (text) {
        showMessage('已成功复制文本到剪贴板', 'success');
      }
    } catch {
      isPickingElementText.value = false;
      endElementPickingSession();
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
      } catch {}
      isPickingElementImage.value = false;
      endElementPickingSession();
      return;
    }

    await deactivateOtherFeatures('image');
    isPickingElementImage.value = true;
    startElementPickingSession();

    try {
      const urls: string[] = await webview.executeJavaScript(getPickerScript('image'));
      isPickingElementImage.value = false;
      endElementPickingSession();
      if (urls && urls.length > 0) {
        addImagePreview(urls);
      }
    } catch {
      isPickingElementImage.value = false;
      endElementPickingSession();
    }
  };

  const cancelActivePickers = async (exclude: string) => {
    const webview = activeWebview();
    if (exclude !== 'image' && isPickingElementImage.value) {
      isPickingElementImage.value = false;
      endElementPickingSession();
      if (webview) {
        try {
          await webview.executeJavaScript(getPickerCancelScript());
        } catch {}
      }
    }
    if (exclude !== 'text' && isPickingElementText.value) {
      isPickingElementText.value = false;
      endElementPickingSession();
      if (webview) {
        try {
          await webview.executeJavaScript(getPickerCancelScript());
        } catch {}
      }
    }
  };

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
        } catch {}
      }
    }

    isPickingElementImage.value = false;
  });

  return {
    inspectorVisible,
    toggleInspector,
    onApplyPreview,
    onSaveRules,
    onDeleteStyle,
    applyCustomStylesToWebview,
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
  };
}
