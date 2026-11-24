import { ref, computed, watch } from 'vue';
import type { LocalFileItem } from '@/composables/local/types';
import { logger } from '@/services/logger';

export interface UseLocalDirectoryOptions {
  resourcePath: () => string;
  resourceName: () => string;
  onClearSelection: () => void;
}

/**
 * 本地目录导航、列表加载、搜索过滤与排序逻辑
 */
export function useLocalDirectory(options: UseLocalDirectoryOptions) {
  const { resourcePath, resourceName, onClearSelection } = options;

  const currentPath = ref<string>(resourcePath());
  const items = ref<LocalFileItem[]>([]);
  const searchResults = ref<LocalFileItem[]>([]);
  const isSearching = ref<boolean>(false);
  const loading = ref<boolean>(false);
  const errorMsg = ref<string>('');
  const searchQuery = ref<string>('');
  const sortBy = ref<string>('mtime-desc');

  const isAtRoot = computed(() => {
    const normRoot = resourcePath().replace(/\\/g, '/').replace(/\/+$/, '');
    const normCurrent = currentPath.value.replace(/\\/g, '/').replace(/\/+$/, '');
    return normRoot === normCurrent;
  });

  const breadcrumbs = computed(() => {
    const normRoot = resourcePath().replace(/\\/g, '/').replace(/\/+$/, '');
    const normCurrent = currentPath.value.replace(/\\/g, '/').replace(/\/+$/, '');

    const result: Array<{ name: string; path: string }> = [
      { name: resourceName(), path: resourcePath() }
    ];

    if (normCurrent.startsWith(normRoot) && normCurrent.length > normRoot.length) {
      const rel = normCurrent.substring(normRoot.length).replace(/^\/+/, '');
      const parts = rel.split('/');
      let accum = normRoot;
      for (const part of parts) {
        if (part) {
          accum += '/' + part;
          result.push({ name: part, path: accum });
        }
      }
    }

    return result;
  });

  const filteredItems = computed(() => {
    const list = isSearching.value ? [...searchResults.value] : [...items.value];

    // Sorting
    const [field, order] = sortBy.value.split('-');
    const isAsc = order === 'asc';

    list.sort((a, b) => {
      // Directories always first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      if (field === 'name') {
        const cmp = a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' });
        return isAsc ? cmp : -cmp;
      } else if (field === 'mtime') {
        return isAsc ? a.mtime - b.mtime : b.mtime - a.mtime;
      } else if (field === 'size') {
        return isAsc ? a.size - b.size : b.size - a.size;
      } else if (field === 'type') {
        const cmp = a.ext.localeCompare(b.ext);
        return isAsc ? cmp : -cmp;
      }
      return 0;
    });

    return list;
  });

  const handleClearSearch = () => {
    searchQuery.value = '';
    isSearching.value = false;
    searchResults.value = [];
  };

  const handleExecuteSearch = async () => {
    const q = searchQuery.value.trim();
    if (!q) {
      handleClearSearch();
      return;
    }
    if (!currentPath.value || !window.electronAPI?.searchLocalFiles) return;

    loading.value = true;
    errorMsg.value = '';
    onClearSelection();
    isSearching.value = true;

    try {
      const res = await window.electronAPI.searchLocalFiles(currentPath.value, q);
      if (res && res.success) {
        searchResults.value = res.items || [];
      } else {
        errorMsg.value = res?.error || '搜索失败';
        searchResults.value = [];
      }
    } catch (err: any) {
      errorMsg.value = err?.message || '搜索异常';
      searchResults.value = [];
    } finally {
      loading.value = false;
    }
  };

  const loadDirectory = async (dirPath: string) => {
    if (!dirPath || !window.electronAPI) return;
    loading.value = true;
    errorMsg.value = '';
    onClearSelection();

    try {
      const res = await window.electronAPI.readLocalDirectory(dirPath);
      if (res && res.success) {
        items.value = res.items || [];
        currentPath.value = dirPath;
        if (isSearching.value && searchQuery.value.trim()) {
          await handleExecuteSearch();
        }
      } else {
        errorMsg.value = res?.error || '无法读取目录';
        items.value = [];
      }
    } catch (err: any) {
      errorMsg.value = err?.message || '读取异常';
      items.value = [];
    } finally {
      loading.value = false;
    }
  };

  const refreshDirectorySilently = async () => {
    if (!currentPath.value || !window.electronAPI?.readLocalDirectory) return;
    try {
      const res = await window.electronAPI.readLocalDirectory(currentPath.value);
      if (res && res.success && res.items) {
        items.value = res.items;
      }
    } catch (err: any) {
      logger.error('LocalWorkspace', `Failed to silently refresh directory: ${err?.message}`);
    }
  };

  const navigateUp = () => {
    if (isAtRoot.value) return;
    const normCurrent = currentPath.value.replace(/\\/g, '/').replace(/\/+$/, '');
    const lastSlash = normCurrent.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentPath = normCurrent.substring(0, lastSlash);
      loadDirectory(parentPath);
    }
  };

  const jumpToBreadcrumb = (index: number) => {
    if (index >= 0 && index < breadcrumbs.value.length) {
      loadDirectory(breadcrumbs.value[index].path);
    }
  };

  watch(searchQuery, (newVal) => {
    if (!newVal.trim() && isSearching.value) {
      isSearching.value = false;
      searchResults.value = [];
    }
  });

  watch(resourcePath, (newPath) => {
    if (newPath) {
      currentPath.value = newPath;
      handleClearSearch();
      loadDirectory(newPath);
    }
  });

  return {
    currentPath,
    items,
    searchResults,
    isSearching,
    loading,
    errorMsg,
    searchQuery,
    sortBy,
    isAtRoot,
    breadcrumbs,
    filteredItems,
    loadDirectory,
    handleExecuteSearch,
    handleClearSearch,
    refreshDirectorySilently,
    navigateUp,
    jumpToBreadcrumb
  };
}
