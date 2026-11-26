import { ref, nextTick, type Ref, type ComputedRef } from 'vue';
import type { Workspace } from '@/composables/useWorkspaces';
import {
  detectPanShareMeta,
  extractAllPanShareLinks,
  isProbablyPanText
} from '@/composables/pan/shareTextParser';

export interface UseBrowserContextMenuOptions {
  workspace: ComputedRef<Workspace | undefined>;
  isPickingElementImage: Ref<boolean>;
  isPickingElementText: Ref<boolean>;
  pickElementImage: () => Promise<void> | void;
  pickElementText: () => Promise<void> | void;
  startSilentParse: (params: { isLink: boolean; targetUrl?: string; tabId?: string }) => void;
  onParsePanLink?: (rawText: string) => void;
}

/**
 * 浏览器工作区 Webview 右键菜单状态定位与动作分发逻辑
 */
export function useBrowserContextMenu(options: UseBrowserContextMenuOptions) {
  const {
    workspace,
    isPickingElementImage,
    isPickingElementText,
    pickElementImage,
    pickElementText,
    startSilentParse,
    onParsePanLink
  } = options;

  const contextMenuVisible = ref(false);
  const contextMenuPos = ref({ x: 0, y: 0 });
  const contextMenuTabId = ref('');
  const contextMenuTargetUrl = ref('');
  const isContextMenuTargetLink = ref(false);
  const contextMenuPanText = ref('');
  const contextMenuRef = ref<HTMLElement | null>(null);

  const handleWebviewContextMenu = (e: any, tabId: string) => {
    if (isPickingElementImage.value || isPickingElementText.value) return;
    if (e.preventDefault && typeof e.preventDefault === 'function') e.preventDefault();

    const params = e.params || (e as any).detail?.params || (e as any).nativeEvent?.params || e;
    const px = typeof params?.x === 'number' ? params.x : (typeof e.clientX === 'number' ? e.clientX : 0);
    const py = typeof params?.y === 'number' ? params.y : (typeof e.clientY === 'number' ? e.clientY : 0);

    const link = String(params?.linkURL || params?.linkUrl || '').trim();
    const page = String(params?.pageURL || params?.pageUrl || '').trim();
    const selectionText = String(params?.selectionText || '').trim();
    const tab = workspace.value?.tabs.find(t => t.id === tabId);

    if (link) {
      isContextMenuTargetLink.value = true;
      contextMenuTargetUrl.value = link;
    } else {
      isContextMenuTargetLink.value = false;
      contextMenuTargetUrl.value = page || tab?.url || '';
    }

    // 识别右键链接或选中文本中的网盘分享链接
    let detectedPan = '';
    if (link && detectPanShareMeta(link)) {
      detectedPan = selectionText && /(?:提取码|密码|访问码|口令|code|pwd)[:：\s]*[a-zA-Z0-9]{4,8}/i.test(selectionText)
        ? `${link} ${selectionText}`
        : link;
    } else if (selectionText) {
      const found = extractAllPanShareLinks(selectionText);
      if (found.length > 0) {
        detectedPan = found[0].password
          ? `${found[0].url} 提取码: ${found[0].password}`
          : found[0].url;
      } else if (isProbablyPanText(selectionText)) {
        detectedPan = selectionText;
      }
    }
    contextMenuPanText.value = detectedPan;

    contextMenuPos.value = { x: px, y: py };
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

        contextMenuPos.value = { x: finalX, y: finalY };
      }
    });
  };

  const hideAllContextMenus = (e?: Event) => {
    if (e && e instanceof MouseEvent && e.button !== 0) return;
    contextMenuVisible.value = false;
  };

  const handleWindowClick = (e: MouseEvent) => {
    if (e && e.button !== 0) return;
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

  const triggerSilentParse = () => {
    const isLink = isContextMenuTargetLink.value;
    const targetUrl = contextMenuTargetUrl.value;
    const tabId = contextMenuTabId.value || workspace.value?.activeTabId || '';
    contextMenuVisible.value = false;

    startSilentParse({ isLink, targetUrl, tabId });
  };

  const triggerParsePanLink = () => {
    const rawText = contextMenuPanText.value;
    contextMenuVisible.value = false;
    if (rawText && onParsePanLink) {
      onParsePanLink(rawText);
    }
  };

  return {
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
  };
}
