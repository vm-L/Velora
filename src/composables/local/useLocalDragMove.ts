import { ref, type Ref, type ComputedRef } from 'vue';
import { useMessage } from '@/composables/useMessage';
import { logger } from '@/services/logger';
import { normalizeLocalPath, type LocalFileItem } from '@/composables/local/types';

export interface UseLocalDragMoveOptions {
  currentPath: Ref<string>;
  selectedPaths: Ref<Set<string>>;
  selectedItems: ComputedRef<LocalFileItem[]>;
  closeContextMenu: () => void;
  isPathCurrentlyPlayingOrPreviewed: (targetPath: string) => { occupied: boolean; mediaName?: string };
  loadDirectory: (dirPath: string) => Promise<void>;
}

/**
 * 本地工作区卡片与面包屑拖拽移动（含环路拦截、同目录拦截与占用检测）
 */
export function useLocalDragMove(options: UseLocalDragMoveOptions) {
  const {
    currentPath,
    selectedPaths,
    selectedItems,
    closeContextMenu,
    isPathCurrentlyPlayingOrPreviewed,
    loadDirectory
  } = options;
  const { showMessage, removeMessage } = useMessage();

  const dragState = ref<{
    isDragging: boolean;
    items: LocalFileItem[];
  }>({
    isDragging: false,
    items: []
  });
  const dragHoverTarget = ref<string | null>(null);

  const isDraggingItem = (itemPath: string): boolean => {
    if (!dragState.value.isDragging) return false;
    return dragState.value.items.some(i => i.path === itemPath);
  };

  // 严格判断指定目标目录路径对某个源文件/文件夹是否合法
  const isValidDropTargetForItem = (targetDirPath: string, item: LocalFileItem): boolean => {
    if (!targetDirPath || !item?.path) return false;

    const normTarget = normalizeLocalPath(targetDirPath);
    const normItem = normalizeLocalPath(item.path);

    // 1. 不能移动到自身
    if (normTarget === normItem) return false;

    // 2. 文件夹不能移动到自身的子孙目录下（防止循环嵌套死锁）
    if (item.isDirectory && normTarget.startsWith(normItem + '/')) {
      return false;
    }

    // 3. 原地移动无效（源项目的直接父级目录与目标目录相同）
    const lastSlash = normItem.lastIndexOf('/');
    const normItemParent = lastSlash !== -1 ? normItem.substring(0, lastSlash) : '';
    if (normItemParent === normTarget) {
      return false;
    }

    return true;
  };

  // 检查某个目标目录路径是否至少可接收当前被拖拽项目列表中的任一项
  const isValidDropTarget = (targetDirPath: string, dragItems: LocalFileItem[]): boolean => {
    if (!targetDirPath || !dragItems || dragItems.length === 0) return false;
    return dragItems.some(item => isValidDropTargetForItem(targetDirPath, item));
  };

  const resetDragState = () => {
    dragState.value.isDragging = false;
    dragState.value.items = [];
    dragHoverTarget.value = null;
  };

  // 开始拖拽卡片
  const onCardDragStart = (e: DragEvent, item: LocalFileItem, _index: number) => {
    closeContextMenu();

    let itemsToDrag: LocalFileItem[] = [];
    if (selectedPaths.value.has(item.path)) {
      itemsToDrag = [...selectedItems.value];
    } else {
      selectedPaths.value = new Set([item.path]);
      itemsToDrag = [item];
    }

    dragState.value.isDragging = true;
    dragState.value.items = itemsToDrag;
    dragHoverTarget.value = null;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(itemsToDrag.map(i => i.path)));

      if (itemsToDrag.length > 1) {
        const dragBadge = document.createElement('div');
        dragBadge.className = 'custom-drag-ghost-badge';
        dragBadge.innerText = `移动 ${itemsToDrag.length} 个项目`;
        dragBadge.style.cssText = 'position:fixed;top:-1000px;left:-1000px;padding:6px 12px;background:#3b82f6;color:#ffffff;border-radius:16px;font-size:12px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:none;z-index:99999;';
        document.body.appendChild(dragBadge);
        e.dataTransfer.setDragImage(dragBadge, 20, 20);
        setTimeout(() => {
          try { document.body.removeChild(dragBadge); } catch {}
        }, 0);
      }
    }
  };

  const onCardDragEnd = (_e: DragEvent) => {
    resetDragState();
  };

  const handleTargetDragEnter = (e: DragEvent, targetPath?: string) => {
    if (!targetPath || !dragState.value.isDragging) return;
    if (!isValidDropTarget(targetPath, dragState.value.items)) return;
    e.preventDefault();
    dragHoverTarget.value = targetPath;
  };

  const handleTargetDragOver = (e: DragEvent, targetPath?: string) => {
    if (!targetPath || !dragState.value.isDragging) return;
    if (!isValidDropTarget(targetPath, dragState.value.items)) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragHoverTarget.value = targetPath;
  };

  const handleTargetDragLeave = (e: DragEvent, targetPath?: string) => {
    const related = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node | null;
    if (currentTarget && related && currentTarget.contains(related)) {
      return;
    }
    if (dragHoverTarget.value === targetPath) {
      dragHoverTarget.value = null;
    }
  };

  // 执行拖拽移动操作（支持单项/多选批量、同名自动 (1) 编号保护）
  const executeDropMove = async (targetDirPath: string) => {
    const itemsToMove = [...dragState.value.items];
    resetDragState();

    if (!itemsToMove.length || !targetDirPath || !window.electronAPI) return;

    const validItems = itemsToMove.filter(item => isValidDropTargetForItem(targetDirPath, item));
    if (validItems.length === 0) return;

    for (const item of validItems) {
      const check = isPathCurrentlyPlayingOrPreviewed(item.path);
      if (check.occupied) {
        showMessage(`无法移动：项目 "${item.name}" 正在播放预览中，请先关闭播放器`, 'warning');
        return;
      }
    }

    const count = validItems.length;
    const targetDirName = targetDirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '目标目录';

    if (count === 1) {
      const item = validItems[0];
      const newPath = `${targetDirPath}/${item.name}`.replace(/\\/g, '/');
      const msgId = showMessage(`正在移动 "${item.name}" 至 "${targetDirName}"`, 'loading', 0);
      try {
        const res = await window.electronAPI.moveFile(item.path, newPath, { autoRename: true });
        removeMessage(msgId);
        if (res && res.success) {
          showMessage(`已将 "${item.name}" 移动至 "${targetDirName}"`, 'success');
          selectedPaths.value.delete(item.path);
          await loadDirectory(currentPath.value);
        } else {
          showMessage(res?.error || '移动失败', 'error');
        }
      } catch (err: any) {
        removeMessage(msgId);
        showMessage(`移动失败: ${err?.message}`, 'error');
      }
    } else {
      const msgId = showMessage(`正在移动选中的 ${count} 个项目至 "${targetDirName}"`, 'loading', 0);
      let successCount = 0;
      let failCount = 0;
      for (const item of validItems) {
        const newPath = `${targetDirPath}/${item.name}`.replace(/\\/g, '/');
        try {
          const res = await window.electronAPI.moveFile(item.path, newPath, { autoRename: true });
          if (res && res.success) {
            successCount++;
            selectedPaths.value.delete(item.path);
          } else {
            failCount++;
            logger.error('LocalWorkspace', `[DragMove] 移动失败 "${item.name}": ${res?.error}`);
          }
        } catch (err: any) {
          failCount++;
          logger.error('LocalWorkspace', `[DragMove] 移动异常 "${item.name}": ${err?.message}`);
        }
      }
      removeMessage(msgId);
      if (failCount === 0) {
        showMessage(`已成功移动 ${successCount} 个项目至 "${targetDirName}"`, 'success');
      } else {
        showMessage(`移动完成: 成功 ${successCount} 项，失败 ${failCount} 项`, 'warning');
      }
      await loadDirectory(currentPath.value);
    }
  };

  // 目标文件夹卡片悬停与释放事件
  const onCardDragEnter = (e: DragEvent, targetItem: LocalFileItem) => {
    if (!targetItem.isDirectory) return;
    handleTargetDragEnter(e, targetItem.path);
  };

  const onCardDragOver = (e: DragEvent, targetItem: LocalFileItem) => {
    if (!targetItem.isDirectory) return;
    handleTargetDragOver(e, targetItem.path);
  };

  const onCardDragLeave = (e: DragEvent, targetItem: LocalFileItem) => {
    handleTargetDragLeave(e, targetItem.path);
  };

  const onCardDrop = async (e: DragEvent, targetItem: LocalFileItem) => {
    e.preventDefault();
    e.stopPropagation();
    const targetPath = targetItem.path;
    if (!targetItem.isDirectory || !targetPath) {
      resetDragState();
      return;
    }
    await executeDropMove(targetPath);
  };

  // 顶部面包屑导航项悬停与释放事件
  const onBreadcrumbDragEnter = (e: DragEvent, crumbPath?: string) => {
    handleTargetDragEnter(e, crumbPath);
  };

  const onBreadcrumbDragOver = (e: DragEvent, crumbPath?: string) => {
    handleTargetDragOver(e, crumbPath);
  };

  const onBreadcrumbDragLeave = (e: DragEvent, crumbPath?: string) => {
    handleTargetDragLeave(e, crumbPath);
  };

  const onBreadcrumbDrop = async (e: DragEvent, crumbPath?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!crumbPath) {
      resetDragState();
      return;
    }
    await executeDropMove(crumbPath);
  };

  return {
    dragState,
    dragHoverTarget,
    isDraggingItem,
    onCardDragStart,
    onCardDragEnd,
    onCardDragEnter,
    onCardDragOver,
    onCardDragLeave,
    onCardDrop,
    onBreadcrumbDragEnter,
    onBreadcrumbDragOver,
    onBreadcrumbDragLeave,
    onBreadcrumbDrop
  };
}
