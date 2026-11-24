import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { getFileCategory, type LocalFileItem } from '@/composables/local/types';

export interface UseLocalSelectionAndMarqueeOptions {
  items: Ref<LocalFileItem[]>;
  searchResults: Ref<LocalFileItem[]>;
  isSearching: Ref<boolean>;
  filteredItems: ComputedRef<LocalFileItem[]>;
}

/**
 * 本地工作区条目多选、Shift/Ctrl 连选、框选自动滚动及右键菜单定位逻辑
 */
export function useLocalSelectionAndMarquee(options: UseLocalSelectionAndMarqueeOptions) {
  const { items, searchResults, isSearching, filteredItems } = options;

  const selectedPaths = ref<Set<string>>(new Set());
  const lastSelectedIndex = ref<number>(-1);

  const workspaceBodyRef = ref<HTMLElement | null>(null);
  const marqueeState = ref<{
    visible: boolean;
    left: number;
    top: number;
    width: number;
    height: number;
  }>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0
  });

  const contextMenu = ref<{
    visible: boolean;
    x: number;
    y: number;
    targetItem: LocalFileItem | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    targetItem: null
  });

  const selectedItems = computed(() => {
    const currentList = isSearching.value ? searchResults.value : items.value;
    return currentList.filter(item => selectedPaths.value.has(item.path));
  });

  const isAllSelectedVideos = computed(() => {
    if (selectedItems.value.length === 0) return false;
    return selectedItems.value.every(item => !item.isDirectory && getFileCategory(item) === 'video');
  });

  const singleSelectedItem = computed(() => {
    return selectedItems.value.length === 1 ? selectedItems.value[0] : null;
  });

  const totalSelectedBytes = computed(() => {
    return selectedItems.value.reduce((acc, item) => acc + (item.size || 0), 0);
  });

  const clearSelection = () => {
    selectedPaths.value.clear();
    lastSelectedIndex.value = -1;
  };

  const selectAll = () => {
    selectedPaths.value = new Set(filteredItems.value.map(i => i.path));
  };

  const handleCardClick = (e: MouseEvent, item: LocalFileItem, index: number) => {
    if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(selectedPaths.value);
      if (newSet.has(item.path)) {
        newSet.delete(item.path);
      } else {
        newSet.add(item.path);
      }
      selectedPaths.value = newSet;
      lastSelectedIndex.value = index;
    } else if (e.shiftKey && lastSelectedIndex.value >= 0) {
      const start = Math.min(lastSelectedIndex.value, index);
      const end = Math.max(lastSelectedIndex.value, index);
      const newSet = new Set(selectedPaths.value);
      for (let i = start; i <= end; i++) {
        if (filteredItems.value[i]) {
          newSet.add(filteredItems.value[i].path);
        }
      }
      selectedPaths.value = newSet;
    } else {
      selectedPaths.value = new Set([item.path]);
      lastSelectedIndex.value = index;
    }
  };

  const closeContextMenu = () => {
    contextMenu.value.visible = false;
  };

  const onContextMenuClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.menu-action-item')) {
      closeContextMenu();
    }
  };

  const onItemContextMenu = (e: MouseEvent, item: LocalFileItem, index: number) => {
    if (!selectedPaths.value.has(item.path)) {
      selectedPaths.value = new Set([item.path]);
      lastSelectedIndex.value = index;
    }
    contextMenu.value = {
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 190),
      y: Math.min(e.clientY, window.innerHeight - 260),
      targetItem: item
    };
  };

  const onBodyContextMenu = (e: MouseEvent) => {
    clearSelection();
    contextMenu.value = {
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 150),
      targetItem: null
    };
  };

  // Marquee Selection Logic
  let isSelecting = false;
  let startClientX = 0;
  let startClientY = 0;
  let startContentX = 0;
  let startContentY = 0;
  let isCtrlSelection = false;
  let isShiftSelection = false;
  let initialSelectedPaths = new Set<string>();
  let cachedCardRects: Array<{ path: string; left: number; top: number; right: number; bottom: number }> = [];
  let autoScrollRafId: number | null = null;
  let currentClientX = 0;
  let currentClientY = 0;

  const updateMarqueeAndSelection = () => {
    const container = workspaceBodyRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const curContentX = currentClientX - containerRect.left + container.scrollLeft;
    const curContentY = currentClientY - containerRect.top + container.scrollTop;

    const boxLeft = Math.min(startContentX, curContentX);
    const boxTop = Math.min(startContentY, curContentY);
    const boxRight = Math.max(startContentX, curContentX);
    const boxBottom = Math.max(startContentY, curContentY);
    const boxWidth = Math.max(0, boxRight - boxLeft);
    const boxHeight = Math.max(0, boxBottom - boxTop);

    marqueeState.value = {
      visible: true,
      left: boxLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight
    };

    // Intersect collision detection (相交即选中)
    const intersected = new Set<string>();
    for (const card of cachedCardRects) {
      const isIntersect = !(
        card.right < boxLeft ||
        card.left > boxRight ||
        card.bottom < boxTop ||
        card.top > boxBottom
      );
      if (isIntersect) {
        intersected.add(card.path);
      }
    }

    // Apply selection according to modifier keys
    if (isShiftSelection) {
      // Union / 累加
      const newSet = new Set(initialSelectedPaths);
      intersected.forEach(p => newSet.add(p));
      selectedPaths.value = newSet;
    } else if (isCtrlSelection) {
      // Toggle / 增减选
      const newSet = new Set(initialSelectedPaths);
      for (const p of intersected) {
        if (initialSelectedPaths.has(p)) {
          newSet.delete(p);
        } else {
          newSet.add(p);
        }
      }
      selectedPaths.value = newSet;
    } else {
      // Replace / 覆盖选中
      selectedPaths.value = new Set(intersected);
    }
  };

  const processAutoScroll = () => {
    if (!isSelecting) return;
    const container = workspaceBodyRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const edgeZone = 36;
    const maxSpeed = 16;

    const distTop = currentClientY - containerRect.top;
    const distBottom = containerRect.bottom - currentClientY;

    let scrolled = false;

    if (distTop < edgeZone && distTop >= -40) {
      const ratio = Math.max(0, 1 - Math.max(0, distTop) / edgeZone);
      const speed = Math.max(3, Math.round(maxSpeed * ratio));
      container.scrollTop -= speed;
      scrolled = true;
    } else if (distBottom < edgeZone && distBottom >= -40) {
      const ratio = Math.max(0, 1 - Math.max(0, distBottom) / edgeZone);
      const speed = Math.max(3, Math.round(maxSpeed * ratio));
      container.scrollTop += speed;
      scrolled = true;
    }

    if (scrolled) {
      updateMarqueeAndSelection();
    }

    autoScrollRafId = requestAnimationFrame(processAutoScroll);
  };

  const handleWindowMouseMove = (e: MouseEvent) => {
    currentClientX = e.clientX;
    currentClientY = e.clientY;

    if (!isSelecting) {
      const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY);
      if (dist >= 4) {
        isSelecting = true;
        document.body.style.userSelect = 'none';
        autoScrollRafId = requestAnimationFrame(processAutoScroll);
      }
    }

    if (isSelecting) {
      updateMarqueeAndSelection();
    }
  };

  const handleWindowMouseUp = (_e: MouseEvent) => {
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);

    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }

    document.body.style.userSelect = '';

    if (!isSelecting) {
      // 单击空白区域：清空选择
      if (!isCtrlSelection && !isShiftSelection) {
        clearSelection();
      }
    }

    isSelecting = false;
    marqueeState.value.visible = false;
  };

  const handleWorkspaceMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('.file-card, button, input, select, .nav-btn, .action-btn, .modal-overlay, .context-menu, .context-menu-backdrop')) {
      return;
    }

    const container = workspaceBodyRef.value;
    if (!container) return;

    closeContextMenu();

    const containerRect = container.getBoundingClientRect();
    startClientX = e.clientX;
    startClientY = e.clientY;
    currentClientX = e.clientX;
    currentClientY = e.clientY;

    startContentX = e.clientX - containerRect.left + container.scrollLeft;
    startContentY = e.clientY - containerRect.top + container.scrollTop;

    isCtrlSelection = e.ctrlKey || e.metaKey;
    isShiftSelection = e.shiftKey;
    initialSelectedPaths = new Set(selectedPaths.value);

    const cardEls = container.querySelectorAll<HTMLElement>('.file-card');
    cachedCardRects = [];
    cardEls.forEach((el, idx) => {
      const item = filteredItems.value[idx];
      if (item) {
        const elRect = el.getBoundingClientRect();
        const left = elRect.left - containerRect.left + container.scrollLeft;
        const top = elRect.top - containerRect.top + container.scrollTop;
        cachedCardRects.push({
          path: item.path,
          left,
          top,
          right: left + elRect.width,
          bottom: top + elRect.height
        });
      }
    });

    isSelecting = false;

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  };

  const cleanupMarquee = () => {
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
    document.body.style.userSelect = '';
    isSelecting = false;
    marqueeState.value.visible = false;
  };

  return {
    selectedPaths,
    lastSelectedIndex,
    workspaceBodyRef,
    marqueeState,
    contextMenu,
    selectedItems,
    isAllSelectedVideos,
    singleSelectedItem,
    totalSelectedBytes,
    clearSelection,
    selectAll,
    handleCardClick,
    onItemContextMenu,
    onBodyContextMenu,
    closeContextMenu,
    onContextMenuClick,
    handleWorkspaceMouseDown,
    cleanupMarquee
  };
}
