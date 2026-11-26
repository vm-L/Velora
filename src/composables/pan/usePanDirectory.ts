import { ref, computed, getCurrentInstance, onUnmounted } from 'vue';
import { useMessage } from '@/composables/useMessage';
import { usePanAccounts } from '@/composables/usePanAccounts';
import {
  filterAndSortPanFiles,
  type BreadcrumbItem,
  type PanFileItem,
  type PanFileTypeFilter,
  type PanSortField,
  type PanSortOrder
} from '@/composables/pan/types';
import { onPanDirectoryChanged, shouldRefreshPanDirectory } from '@/composables/pan/usePanRefreshBus';

export interface UsePanDirectoryOptions {
  panType: () => string;
  accountQuotaText: () => string | undefined;
}

/**
 * 网盘目录加载、配额节流刷新、面包屑导航、搜索过滤与多选状态管理
 */
export function usePanDirectory(options: UsePanDirectoryOptions) {
  const { panType, accountQuotaText } = options;
  const { showMessage } = useMessage();
  const { refreshQuota } = usePanAccounts();

  const liveQuotaText = ref<string>('');
  const displayQuotaText = computed(() => liveQuotaText.value || accountQuotaText() || '');
  let lastQuotaUpdateAt = 0;
  let quotaReqSeq = 0;
  let dirReqSeq = 0;

  // 目录与文件状态
  const breadcrumbs = ref<BreadcrumbItem[]>([
    { id: '0', name: '全部文件' }
  ]);
  const currentFiles = ref<PanFileItem[]>([]);
  const selectedIds = ref<string[]>([]);
  const searchQuery = ref('');
  const typeFilter = ref<PanFileTypeFilter>('all');
  const sortBy = ref<PanSortField>('default');
  const sortOrder = ref<PanSortOrder>('asc');
  const isLoading = ref(false);
  const loadError = ref('');

  const currentPdirFid = computed(() => {
    const top = breadcrumbs.value[breadcrumbs.value.length - 1];
    return top ? top.id : '0';
  });

  const isAtRoot = computed(() => breadcrumbs.value.length <= 1);

  // 本地即时过滤 + 类型筛选 + 排序
  const filteredFiles = computed(() =>
    filterAndSortPanFiles(currentFiles.value, {
      query: searchQuery.value,
      typeFilter: typeFilter.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value
    })
  );

  const toggleSort = (field: Exclude<PanSortField, 'default'>) => {
    if (sortBy.value !== field) {
      sortBy.value = field;
      sortOrder.value = field === 'name' ? 'asc' : 'desc';
    } else if (sortOrder.value === 'asc') {
      sortOrder.value = 'desc';
    } else {
      sortBy.value = 'default';
      sortOrder.value = 'asc';
    }
  };

  // 全选/半选状态
  const isAllSelected = computed(() => {
    if (filteredFiles.value.length === 0) return false;
    return filteredFiles.value.every((f) => selectedIds.value.includes(f.id));
  });

  const isIndeterminate = computed(() => {
    if (filteredFiles.value.length === 0) return false;
    const count = filteredFiles.value.filter((f) => selectedIds.value.includes(f.id)).length;
    return count > 0 && count < filteredFiles.value.length;
  });

  const isSelected = (id: string) => selectedIds.value.includes(id);

  const toggleItemSelect = (id: string) => {
    const idx = selectedIds.value.indexOf(id);
    if (idx > -1) {
      selectedIds.value.splice(idx, 1);
    } else {
      selectedIds.value.push(id);
    }
  };

  const toggleSelectAll = () => {
    if (isAllSelected.value) {
      // 反选或清空
      const visibleIds = new Set(filteredFiles.value.map((f) => f.id));
      selectedIds.value = selectedIds.value.filter((id) => !visibleIds.has(id));
    } else {
      // 全选当前可见项
      const currentSet = new Set(selectedIds.value);
      filteredFiles.value.forEach((f) => currentSet.add(f.id));
      selectedIds.value = Array.from(currentSet);
    }
  };

  const clearSelection = () => {
    selectedIds.value = [];
  };

  const autoUpdateQuota = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastQuotaUpdateAt < 30000) return;
    lastQuotaUpdateAt = now;
    const expectedPanType = panType();
    const reqSeq = ++quotaReqSeq;
    try {
      const q = await refreshQuota(expectedPanType);
      if (reqSeq !== quotaReqSeq || panType() !== expectedPanType) return;
      if (q) {
        liveQuotaText.value = q;
      }
    } catch {}
  };

  // 加载当前目录文件
  const loadCurrentDirectory = async (forceQuota = false, loadOptions?: { silent?: boolean }) => {
    const silent = !!loadOptions?.silent;
    if (!window.electronAPI?.listPanFiles) {
      if (!silent) {
        loadError.value = '客户端不支持网盘接口';
      }
      return;
    }

    const reqSeq = ++dirReqSeq;
    const expectedPanType = panType();
    if (!silent) {
      isLoading.value = true;
      loadError.value = '';
      clearSelection();
    }
    autoUpdateQuota(forceQuota);

    try {
      const res = await window.electronAPI.listPanFiles({
        type: expectedPanType,
        pdirFid: currentPdirFid.value
      });
      if (reqSeq !== dirReqSeq || panType() !== expectedPanType) return;

      if (res && res.success && res.data) {
        const nextFiles = res.data.files || [];
        currentFiles.value = nextFiles;
        loadError.value = '';
        if (silent && selectedIds.value.length > 0) {
          const validIds = new Set(nextFiles.map((f: PanFileItem) => f.id));
          selectedIds.value = selectedIds.value.filter((id) => validIds.has(id));
        }
      } else if (!silent) {
        loadError.value = res?.error || '获取文件列表失败';
      }
    } catch (err: any) {
      if (reqSeq !== dirReqSeq || panType() !== expectedPanType) return;
      if (!silent) {
        loadError.value = err?.message || '加载异常';
      }
    } finally {
      if (reqSeq === dirReqSeq) {
        isLoading.value = false;
      }
    }
  };

  const handleRelogin = async () => {
    if (window.electronAPI?.loginPanAccount) {
      try {
        const res = await window.electronAPI.loginPanAccount(panType());
        if (res && res.success) {
          showMessage('网盘授权已更新', 'success');
          await loadCurrentDirectory(true);
        }
      } catch {}
    }
  };

  const navigateUp = () => {
    if (breadcrumbs.value.length > 1) {
      breadcrumbs.value.pop();
      loadCurrentDirectory();
    }
  };

  const jumpToBreadcrumb = (index: number) => {
    if (index >= 0 && index < breadcrumbs.value.length) {
      breadcrumbs.value = breadcrumbs.value.slice(0, index + 1);
      loadCurrentDirectory();
    }
  };

  const enterFolder = (folder: PanFileItem) => {
    breadcrumbs.value.push({
      id: folder.id,
      name: folder.name
    });
    searchQuery.value = '';
    loadCurrentDirectory();
  };

  const resetDirectoryState = () => {
    breadcrumbs.value = [{ id: '0', name: '全部文件' }];
    currentFiles.value = [];
    typeFilter.value = 'all';
    sortBy.value = 'default';
    sortOrder.value = 'asc';
    clearSelection();
    searchQuery.value = '';
    liveQuotaText.value = '';
    lastQuotaUpdateAt = 0;
  };

  const stopListenPanRefresh = onPanDirectoryChanged((event) => {
    if (event.panType !== panType()) return;
    const refreshQuotaFlag = event.refreshQuota !== false;
    if (shouldRefreshPanDirectory(event, panType(), currentPdirFid.value)) {
      void loadCurrentDirectory(refreshQuotaFlag, { silent: true });
    } else if (refreshQuotaFlag) {
      void autoUpdateQuota(true);
    }
  });

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopListenPanRefresh();
    });
  }

  return {
    displayQuotaText,
    breadcrumbs,
    currentFiles,
    selectedIds,
    searchQuery,
    typeFilter,
    sortBy,
    sortOrder,
    isLoading,
    loadError,
    currentPdirFid,
    isAtRoot,
    filteredFiles,
    isAllSelected,
    isIndeterminate,
    isSelected,
    toggleItemSelect,
    toggleSelectAll,
    clearSelection,
    toggleSort,
    loadCurrentDirectory,
    handleRelogin,
    navigateUp,
    jumpToBreadcrumb,
    enterFolder,
    resetDirectoryState,
    dispose: stopListenPanRefresh
  };
}
