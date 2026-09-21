<template>
  <div class="local-workspace" @click="closeContextMenu">
    <!-- Top Breadcrumb & Actions Bar -->
    <div class="workspace-header">
      <div class="header-nav">
        <v-button variant="icon" class="nav-btn" :disabled="isAtRoot" @click="navigateUp" title="返回上一级">
          <VIcon name="chevron-left" :size="18" />
        </v-button>
        <v-button variant="icon" class="nav-btn" @click="loadDirectory(currentPath)" title="刷新">
          <VIcon name="refresh" :size="16" />
        </v-button>

        <!-- Breadcrumbs Navigation -->
        <div class="breadcrumb-container">
          <div
            class="breadcrumb-item"
            :class="{ active: breadcrumbs.length === 1 }"
            @click="jumpToBreadcrumb(0)"
          >
            <VIcon name="folder" :size="14" class="root-icon" />
            <span class="crumb-text">{{ resourceName }}</span>
          </div>

          <template v-for="(crumb, idx) in breadcrumbs.slice(1)" :key="crumb.path">
            <span class="crumb-separator">/</span>
            <div
              class="breadcrumb-item"
              :class="{ active: idx === breadcrumbs.length - 2 }"
              @click="jumpToBreadcrumb(idx + 1)"
            >
              <span class="crumb-text">{{ crumb.name }}</span>
            </div>
          </template>
        </div>
      </div>

      <div class="header-actions">
        <!-- Search Input -->
        <div class="search-wrap">
          <VIcon name="search" :size="14" class="search-icon" />
          <v-input v-model="searchQuery" type="text" placeholder="搜索文件或目录" class="search-input" />
          <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">
            <VIcon name="close" :size="12" />
          </button>
        </div>

        <!-- Sort Menu -->
        <div class="sort-select-wrap">
          <select v-model="sortBy" class="sort-select">
            <option value="name-asc">按名称 (A-Z)</option>
            <option value="name-desc">按名称 (Z-A)</option>
            <option value="mtime-desc">按修改时间 (最新)</option>
            <option value="mtime-asc">按修改时间 (最早)</option>
            <option value="size-desc">按大小 (从大到小)</option>
            <option value="size-asc">按大小 (从小到大)</option>
            <option value="type-asc">按类型</option>
          </select>
        </div>

        <!-- Actions -->
        <v-button variant="secondary" size="small" @click="showNewFolderModal = true" title="新建文件夹">
          <VIcon name="plus" :size="14" />
          新建文件夹
        </v-button>

        <v-button variant="secondary" size="small" @click="openInExplorer(currentPath)" title="在文件资源管理器中打开当前目录">
          <VIcon name="external-link" :size="14" />
          打开目录
        </v-button>
      </div>
    </div>

    <!-- Main Content Area: Grid View -->
    <div class="workspace-body" @click="handleBodyClick" @contextmenu.prevent="onBodyContextMenu">
      <!-- Loading State -->
      <div v-if="loading" class="state-container">
        <div class="spinner"></div>
        <span>正在读取目录内容</span>
      </div>

      <!-- Error State -->
      <div v-else-if="errorMsg" class="state-container error">
        <VIcon name="error" :size="32" />
        <span class="state-title">读取目录失败</span>
        <span class="state-desc">{{ errorMsg }}</span>
        <v-button variant="secondary" size="small" @click="loadDirectory(currentPath)">重试</v-button>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredItems.length === 0" class="state-container">
        <VIcon name="folder" :size="48" class="empty-icon" />
        <span class="state-title">{{ searchQuery ? '未找到匹配项' : '当前目录为空' }}</span>
        <v-button v-if="!searchQuery" variant="secondary" size="small" @click="showNewFolderModal = true">创建新文件夹</v-button>
      </div>

      <!-- Grid Cards View -->
      <div v-else class="file-grid">
        <div
          v-for="(item, index) in filteredItems"
          :key="item.path"
          class="file-card"
          :class="{ selected: selectedPaths.has(item.path), 'is-directory': item.isDirectory }"
          @click.stop="handleCardClick($event, item, index)"
          @dblclick="handleItemDblClick(item)"
          @contextmenu.prevent.stop="onItemContextMenu($event, item, index)"
        >
          <!-- Thumbnail / Icon Area -->
          <div class="card-icon-wrap" :class="getFileCategory(item)">
            <!-- Folder Icon -->
            <VIcon v-if="item.isDirectory" name="folder" :size="40" class="file-svg folder-color" />
            <!-- Video Icon -->
            <VIcon v-else-if="getFileCategory(item) === 'video'" name="video-sniffer" :size="36" class="file-svg video-color" />
            <!-- Audio Icon -->
            <VIcon v-else-if="getFileCategory(item) === 'audio'" name="music" :size="36" class="file-svg audio-color" />
            <!-- Image Icon -->
            <VIcon v-else-if="getFileCategory(item) === 'image'" name="image" :size="36" class="file-svg image-color" />
            <!-- Code / Doc / Other -->
            <VIcon v-else-if="getFileCategory(item) === 'code'" name="code" :size="36" class="file-svg code-color" />
            <VIcon v-else name="file" :size="36" class="file-svg doc-color" />

            <!-- Extension Badge for non-folders -->
            <span v-if="!item.isDirectory && item.ext" class="ext-badge">{{ item.ext.toUpperCase() }}</span>
          </div>

          <!-- Title & Meta (3 Lines) -->
          <div class="card-info">
            <div class="card-name" :title="item.name">{{ item.name }}</div>
            <div class="card-size">
              <span v-if="!item.isDirectory">{{ formatBytes(item.size) }}</span>
              <span v-else class="meta-dir-tag">文件夹</span>
            </div>
            <div class="card-date">{{ formatTime(item.mtime) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="workspace-footer">
      <span class="footer-count">共 {{ filteredItems.length }} 项</span>
      <span v-if="selectedPaths.size === 1 && singleSelectedItem" class="footer-selected">
        已选中: <strong>{{ singleSelectedItem.name }}</strong> ({{ singleSelectedItem.isDirectory ? '文件夹' : formatBytes(singleSelectedItem.size) }})
      </span>
      <span v-else-if="selectedPaths.size > 1" class="footer-selected">
        已选中: <strong>{{ selectedPaths.size }}</strong> 项 ({{ formatBytes(totalSelectedBytes) }})
      </span>
    </div>

    <!-- Right-Click Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu-backdrop"
        @click="closeContextMenu"
        @mousedown="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="context-menu"
          :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
          @click.stop
          @mousedown.stop
          @contextmenu.stop
        >
          <!-- Multi-Selection Context Menu: Only Delete and Video Compress -->
          <template v-if="selectedPaths.size > 1">
            <div
              class="menu-action-item"
              @click="openBatchCompressModal"
            >
              <VIcon name="compress" :size="14" />
              <span>压缩视频</span>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-action-item danger" @click="handleBatchDelete">
              <VIcon name="trash" :size="14" />
              <span>删除 ({{ selectedPaths.size }} 项)</span>
            </div>
          </template>

          <!-- Single Item Context Menu -->
          <template v-else-if="contextMenu.targetItem">
            <!-- Directory: Enter Directory -->
            <div v-if="contextMenu.targetItem.isDirectory" class="menu-action-item" @click="handleContextPreview(contextMenu.targetItem)">
              <VIcon name="folder-enter" :size="14" />
              <span>进入目录</span>
            </div>

            <!-- Video / Audio: Play -->
            <div v-else-if="['video', 'audio'].includes(getFileCategory(contextMenu.targetItem))" class="menu-action-item" @click="handleContextPreview(contextMenu.targetItem)">
              <VIcon name="play" :size="14" />
              <span>播放</span>
            </div>

            <!-- Image: Preview -->
            <div v-else-if="getFileCategory(contextMenu.targetItem) === 'image'" class="menu-action-item" @click="handleContextPreview(contextMenu.targetItem)">
              <VIcon name="eye" :size="14" />
              <span>预览</span>
            </div>

            <!-- Other Files: Open File -->
            <div v-else class="menu-action-item" @click="handleContextPreview(contextMenu.targetItem)">
              <VIcon name="external-link" :size="14" />
              <span>打开文件</span>
            </div>

            <div class="menu-action-item" @click="openInExplorer(contextMenu.targetItem.path)">
              <VIcon name="external-link" :size="14" />
              <span>在文件资源管理器中显示</span>
            </div>

            <div class="menu-action-item" @click="openRenameModal(contextMenu.targetItem)">
              <VIcon name="edit" :size="14" />
              <span>重命名</span>
            </div>

            <div class="menu-action-item" @click="openMoveModal(contextMenu.targetItem)">
              <VIcon name="folder-move" :size="14" />
              <span>移动</span>
            </div>

            <!-- Video / Directory Compress Option -->
            <div
              v-if="contextMenu.targetItem.isDirectory"
              class="menu-action-item"
              @click="handleCompressDirectory(contextMenu.targetItem)"
            >
              <VIcon name="compress" :size="14" />
              <span>压缩视频</span>
            </div>
            <div
              v-else-if="getFileCategory(contextMenu.targetItem) === 'video'"
              class="menu-action-item"
              @click="openCompressModal(contextMenu.targetItem)"
            >
              <VIcon name="compress" :size="14" />
              <span>压缩视频</span>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-action-item danger" @click="handleDelete(contextMenu.targetItem)">
              <VIcon name="trash" :size="14" />
              <span>删除</span>
            </div>
          </template>

          <!-- Blank Area Menu -->
          <template v-else>
            <div class="menu-action-item" @click="showNewFolderModal = true">
              <VIcon name="plus" :size="14" />
              <span>新建文件夹</span>
            </div>

            <div class="menu-action-item" @click="loadDirectory(currentPath)">
              <VIcon name="refresh" :size="14" />
              <span>刷新</span>
            </div>

            <div class="menu-action-item" @click="openInExplorer(currentPath)">
              <VIcon name="external-link" :size="14" />
              <span>在资源管理器中打开</span>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Rename Modal -->
    <Teleport to="body">
      <div v-if="renameModal.visible" class="modal-overlay" @click.self="renameModal.visible = false">
        <div class="modal-content" style="max-width: 420px; width: 90vw;">
          <div class="modal-header">
            <h3>重命名</h3>
            <v-button variant="icon" class="modal-close-btn" @click="renameModal.visible = false">
              <VIcon name="close" :size="18" />
            </v-button>
          </div>
          <div class="modal-body" style="padding: 16px 20px;">
            <v-input v-model="renameModal.newName" type="text" placeholder="输入新名称" class="inline-input" style="width: 100%;" @keyup.enter="handleConfirmRename" />
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-light);">
            <v-button variant="secondary" @click="renameModal.visible = false">取消</v-button>
            <v-button variant="primary" :disabled="!renameModal.newName.trim() || renameModal.newName === renameModal.item?.name" @click="handleConfirmRename">确认</v-button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- New Folder Modal -->
    <Teleport to="body">
      <div v-if="showNewFolderModal" class="modal-overlay" @click.self="showNewFolderModal = false">
        <div class="modal-content" style="max-width: 420px; width: 90vw;">
          <div class="modal-header">
            <h3>新建文件夹</h3>
            <v-button variant="icon" class="modal-close-btn" @click="showNewFolderModal = false">
              <VIcon name="close" :size="18" />
            </v-button>
          </div>
          <div class="modal-body" style="padding: 16px 20px;">
            <v-input v-model="newFolderName" type="text" placeholder="新建文件夹名称" class="inline-input" style="width: 100%;" @keyup.enter="handleConfirmNewFolder" />
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--border-light);">
            <v-button variant="secondary" @click="showNewFolderModal = false; newFolderName = ''">取消</v-button>
            <v-button variant="primary" :disabled="!newFolderName.trim()" @click="handleConfirmNewFolder">创建</v-button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Move File Dialog -->
    <MoveLocalFileDialog
      v-model:visible="moveDialog.visible"
      :rootPath="resourcePath"
      :currentFilePath="moveDialog.item?.path || ''"
      :fileName="moveDialog.item?.name || ''"
      @confirm="handleConfirmMove"
    />

    <!-- Video Preview Modal -->
    <VideoPlayerDialog
      v-if="activeVideoUrl"
      :url="activeVideoUrl"
      :hideDownload="true"
      @edit-complete="refreshDirectorySilently"
      @close="activeVideoUrl = null; refreshDirectorySilently()"
    />

    <!-- Audio Preview Modal -->
    <AudioPlayerDialog
      v-if="activeAudioUrl"
      :url="activeAudioUrl"
      :hideDownload="true"
      @close="activeAudioUrl = null"
    />

    <!-- Image Preview Modal -->
    <ImagePreviewDialog
      v-if="activeImageUrl"
      id="local-image-preview"
      :url="activeImageUrl"
      :zIndex="9999"
      :hideDownload="true"
      @close="activeImageUrl = null"
    />

    <!-- Video Compress Modal (Single) -->
    <CompressVideoDialog
      v-model:visible="compressModal.visible"
      :task="compressModal.task"
      @confirm="handleConfirmCompress"
    />

    <!-- Batch Compress Modal (Multi / Directory) -->
    <BatchCompressVideoDialog
      v-model:visible="isBatchCompressDialogVisible"
      :tasks="batchCompressTasks"
      @confirm="handleConfirmBatchCompress"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import VIcon from '../base/VIcon.vue';
import MoveLocalFileDialog from '../features/MoveLocalFileDialog.vue';
import VideoPlayerDialog from '../features/VideoPlayerDialog.vue';
import AudioPlayerDialog from '../features/AudioPlayerDialog.vue';
import ImagePreviewDialog from '../features/ImagePreviewDialog.vue';
import CompressVideoDialog from '../features/CompressVideoDialog.vue';
import BatchCompressVideoDialog from '../features/BatchCompressVideoDialog.vue';
import { useMessage } from '../../composables/useMessage';
import { useConfirm } from '../../composables/useConfirm';
import { logger } from '../../services/logger';
import { formatBytes } from '../../utils/format';

export interface LocalFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  ext: string;
}

const props = defineProps<{
  resourceId: string;
  resourcePath: string;
  resourceName: string;
}>();

const route = useRoute();

const { showMessage, removeMessage } = useMessage();
const { confirm } = useConfirm();

const currentPath = ref<string>(props.resourcePath);
const items = ref<LocalFileItem[]>([]);
const loading = ref<boolean>(false);
const errorMsg = ref<string>('');
const searchQuery = ref<string>('');
const sortBy = ref<string>('mtime-desc');

// Multi-selection state
const selectedPaths = ref<Set<string>>(new Set());
const lastSelectedIndex = ref<number>(-1);

// Preview states
const activeVideoUrl = ref<string | null>(null);
const activeAudioUrl = ref<string | null>(null);
const activeImageUrl = ref<string | null>(null);

// Dialogs state
const showNewFolderModal = ref<boolean>(false);
const newFolderName = ref<string>('');

const renameModal = ref<{ visible: boolean; item: LocalFileItem | null; newName: string }>({
  visible: false,
  item: null,
  newName: ''
});

const moveDialog = ref<{ visible: boolean; item: LocalFileItem | null }>({
  visible: false,
  item: null
});

const compressModal = ref<{ visible: boolean; task: any }>({
  visible: false,
  task: null
});

const isBatchCompressDialogVisible = ref<boolean>(false);
const batchCompressTasks = ref<Array<{ id: string; name: string; savePath: string; totalBytes: number }>>([]);

// Context menu state
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

const isAtRoot = computed(() => {
  const normRoot = props.resourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normCurrent = currentPath.value.replace(/\\/g, '/').replace(/\/+$/, '');
  return normRoot === normCurrent;
});

const breadcrumbs = computed(() => {
  const normRoot = props.resourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const normCurrent = currentPath.value.replace(/\\/g, '/').replace(/\/+$/, '');

  const result: Array<{ name: string; path: string }> = [
    { name: props.resourceName, path: props.resourcePath }
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

const loadDirectory = async (dirPath: string) => {
  if (!dirPath || !window.electronAPI) return;
  loading.value = true;
  errorMsg.value = '';
  selectedPaths.value.clear();
  lastSelectedIndex.value = -1;

  try {
    const res = await window.electronAPI.readLocalDirectory(dirPath);
    if (res && res.success) {
      items.value = res.items || [];
      currentPath.value = dirPath;
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

onMounted(() => {
  if (props.resourcePath) {
    currentPath.value = props.resourcePath;
    loadDirectory(props.resourcePath);
  }
  window.addEventListener('blur', closeContextMenu);
  window.addEventListener('resize', closeContextMenu);
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('blur', closeContextMenu);
  window.removeEventListener('resize', closeContextMenu);
  window.removeEventListener('keydown', handleKeyDown);
  closeContextMenu();
});

// 路由变化（切换页面）时立即关闭右键菜单并清空选中
watch(() => route.fullPath, () => {
  closeContextMenu();
  selectedPaths.value.clear();
});

watch(() => props.resourcePath, (newPath) => {
  if (newPath) {
    currentPath.value = newPath;
    loadDirectory(newPath);
  }
});

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

const getFileCategory = (item: LocalFileItem): 'folder' | 'video' | 'audio' | 'image' | 'code' | 'doc' | 'other' => {
  if (item.isDirectory) return 'folder';
  const ext = item.ext.toLowerCase();
  if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'm4v', 'ts', 'm3u8'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) return 'image';
  if (['js', 'ts', 'vue', 'json', 'html', 'css', 'less', 'scss', 'py', 'go', 'rs', 'c', 'cpp', 'sh', 'bat'].includes(ext)) return 'code';
  if (['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'doc';
  return 'other';
};

const filteredItems = computed(() => {
  let list = [...items.value];

  // 1. Search Query Filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(item => item.name.toLowerCase().includes(q));
  }

  // 2. Sorting
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

const selectedItems = computed(() => {
  return items.value.filter(item => selectedPaths.value.has(item.path));
});

const singleSelectedItem = computed(() => {
  return selectedItems.value.length === 1 ? selectedItems.value[0] : null;
});

const totalSelectedBytes = computed(() => {
  return selectedItems.value.reduce((acc, item) => acc + (item.size || 0), 0);
});

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

const handleItemDblClick = (item: LocalFileItem) => {
  if (item.isDirectory) {
    loadDirectory(item.path);
  } else {
    handlePreview(item);
  }
};

const handlePreview = async (item: LocalFileItem) => {
  const cat = getFileCategory(item);
  if (cat === 'video') {
    activeVideoUrl.value = item.path;
  } else if (cat === 'audio') {
    activeAudioUrl.value = item.path;
  } else if (cat === 'image') {
    activeImageUrl.value = item.path;
  } else {
    // Open in system default application
    if (window.electronAPI) {
      await window.electronAPI.openFile(item.path);
    }
  }
};

const openInExplorer = (targetPath: string) => {
  if (!targetPath || !window.electronAPI) return;
  window.electronAPI.showItemInFolder(targetPath);
};

// Context Menu Handling
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

const handleBodyClick = () => {
  selectedPaths.value.clear();
  lastSelectedIndex.value = -1;
};

const onBodyContextMenu = (e: MouseEvent) => {
  selectedPaths.value.clear();
  lastSelectedIndex.value = -1;
  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: Math.min(e.clientY, window.innerHeight - 150),
    targetItem: null
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

const handleContextPreview = (item: LocalFileItem) => {
  closeContextMenu();
  handleItemDblClick(item);
};

// Rename
const openRenameModal = (item: LocalFileItem) => {
  closeContextMenu();
  renameModal.value = {
    visible: true,
    item,
    newName: item.name
  };
};

const handleConfirmRename = async () => {
  const { item, newName } = renameModal.value;
  if (!item || !newName.trim() || !window.electronAPI) return;

  const trimmed = newName.trim();
  const dir = item.path.substring(0, item.path.lastIndexOf(/[\\/]/.test(item.path) ? item.path.match(/[\\/]/)![0] : '/'));
  const newPath = `${dir}/${trimmed}`.replace(/\\/g, '/');

  try {
    const res = await window.electronAPI.moveFile(item.path, newPath);
    if (res && res.success) {
      showMessage(`重命名为 "${trimmed}" 成功`, 'success');
      renameModal.value.visible = false;
      await loadDirectory(currentPath.value);
    } else {
      showMessage(res?.error || '重命名失败', 'error');
    }
  } catch (err: any) {
    showMessage(`重命名失败: ${err?.message}`, 'error');
  }
};

// New Folder
const handleConfirmNewFolder = async () => {
  const name = newFolderName.value.trim();
  if (!name || !window.electronAPI) return;

  const targetPath = `${currentPath.value}/${name}`.replace(/\\/g, '/');
  try {
    const res = await window.electronAPI.createLocalFolder(targetPath);
    if (res && res.success) {
      showMessage(`文件夹 "${name}" 创建成功`, 'success');
      showNewFolderModal.value = false;
      newFolderName.value = '';
      await loadDirectory(currentPath.value);
    } else {
      showMessage(res?.error || '创建文件夹失败', 'error');
    }
  } catch (err: any) {
    showMessage(`创建失败: ${err?.message}`, 'error');
  }
};

// Move
const openMoveModal = (item: LocalFileItem) => {
  closeContextMenu();
  moveDialog.value = {
    visible: true,
    item
  };
};

const handleConfirmMove = async (targetDir: string) => {
  const item = moveDialog.value.item;
  if (!item || !targetDir || !window.electronAPI) return;

  const newPath = `${targetDir}/${item.name}`.replace(/\\/g, '/');
  try {
    const res = await window.electronAPI.moveFile(item.path, newPath);
    if (res && res.success) {
      showMessage(`已将 "${item.name}" 移动至目标目录`, 'success');
      await loadDirectory(currentPath.value);
    } else {
      showMessage(res?.error || '移动文件失败', 'error');
    }
  } catch (err: any) {
    showMessage(`移动失败: ${err?.message}`, 'error');
  }
};

// Single Compress
const openCompressModal = (item: LocalFileItem) => {
  closeContextMenu();
  compressModal.value = {
    visible: true,
    task: {
      id: `local-${Math.random().toString(36).substr(2, 8)}`,
      name: item.name,
      savePath: item.path,
      totalBytes: item.size
    }
  };
};

const handleConfirmCompress = async ({ task, targetBitrateKbps }: { task: any; targetBitrateKbps: number }) => {
  if (!task || !window.electronAPI) return;
  showMessage(`已开始压缩 "${task.name}"`, 'info');
  try {
    const res = await window.electronAPI.compressVideoTask(task.id, task.savePath, targetBitrateKbps);
    if (res && res.success) {
      showMessage(`视频 "${task.name}" 压缩完成`, 'success');
      await loadDirectory(currentPath.value);
    } else if (res && res.error) {
      showMessage(`压缩失败: ${res.error}`, 'error');
    }
  } catch (err: any) {
    showMessage(`压缩异常: ${err?.message}`, 'error');
  }
};

// Directory Compress (Recursive)
const handleCompressDirectory = async (item: LocalFileItem) => {
  closeContextMenu();
  if (!item || !window.electronAPI) return;
  const msgId = showMessage(`正在扫描目录 "${item.name}" 中的视频文件`, 'loading', 0);
  try {
    const res = await window.electronAPI.scanLocalVideos([item.path]);
    if (res && res.success && res.videos && res.videos.length > 0) {
      removeMessage(msgId);
      batchCompressTasks.value = res.videos.map(v => ({
        id: `local-${Math.random().toString(36).substr(2, 8)}`,
        name: v.name,
        savePath: v.path,
        totalBytes: v.size
      }));
      isBatchCompressDialogVisible.value = true;
    } else {
      showMessage(`目录 "${item.name}" 及其子目录中未发现可压缩的视频文件`, 'warning', 2500, undefined, msgId);
    }
  } catch (err: any) {
    showMessage(`扫描视频文件失败: ${err?.message}`, 'error', 3000, undefined, msgId);
  }
};

// Batch Compress (Multi-selection: files and directories)
const openBatchCompressModal = async () => {
  closeContextMenu();
  if (!window.electronAPI || selectedPaths.value.size === 0) return;
  const msgId = showMessage('正在扫描所选项目中的视频文件', 'loading', 0);
  try {
    const paths = Array.from(selectedPaths.value);
    const res = await window.electronAPI.scanLocalVideos(paths);
    if (res && res.success && res.videos && res.videos.length > 0) {
      removeMessage(msgId);
      batchCompressTasks.value = res.videos.map(v => ({
        id: `local-${Math.random().toString(36).substr(2, 8)}`,
        name: v.name,
        savePath: v.path,
        totalBytes: v.size
      }));
      isBatchCompressDialogVisible.value = true;
    } else {
      showMessage('所选项目及子目录中未发现可压缩的视频文件', 'warning', 2500, undefined, msgId);
    }
  } catch (err: any) {
    showMessage(`扫描视频文件失败: ${err?.message}`, 'error', 3000, undefined, msgId);
  }
};

const handleConfirmBatchCompress = async ({ tasks: targetTasks, targetBitrateKbps }: { tasks: any[]; targetBitrateKbps: number }) => {
  if (targetTasks.length === 0 || !window.electronAPI) return;
  const count = targetTasks.length;
  showMessage(`已将 ${count} 个视频加入压缩处理队列`, 'info');
  for (const t of targetTasks) {
    window.electronAPI.compressVideoTask(t.id, t.savePath, targetBitrateKbps).catch((err: any) => {
      logger.error('LocalWorkspace', `[BatchCompress] 异常: ${err?.message}`);
    });
  }
};

// Single Delete
const handleDelete = async (item: LocalFileItem) => {
  closeContextMenu();
  const isDir = item.isDirectory;
  const confirmed = await confirm({
    title: isDir ? '删除文件夹' : '删除文件',
    message: `确定要永久删除 ${isDir ? '文件夹及其内部所有内容' : '文件'} "${item.name}" 吗？此操作不可恢复。`,
    confirmText: '彻底删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed || !window.electronAPI) return;

  try {
    const res = await window.electronAPI.deleteLocalPath(item.path);
    if (res && res.success) {
      showMessage(`已删除 "${item.name}"`, 'success');
      selectedPaths.value.delete(item.path);
      await loadDirectory(currentPath.value);
    } else {
      showMessage(res?.error || '删除失败', 'error');
    }
  } catch (err: any) {
    showMessage(`删除失败: ${err?.message}`, 'error');
  }
};

// Batch Delete
const handleBatchDelete = async () => {
  closeContextMenu();
  const count = selectedPaths.value.size;
  if (count === 0 || !window.electronAPI) return;

  const confirmed = await confirm({
    title: '批量删除',
    message: `确定要永久删除选中的 ${count} 个文件/文件夹吗？此操作不可恢复。`,
    confirmText: '彻底删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  let successCount = 0;
  for (const p of Array.from(selectedPaths.value)) {
    try {
      const res = await window.electronAPI.deleteLocalPath(p);
      if (res && res.success) successCount++;
    } catch (err: any) {
      logger.error('LocalWorkspace', `[BatchDelete] 删除失败: ${p}`);
    }
  }
  showMessage(`已成功删除 ${successCount} 项`, 'success');
  selectedPaths.value = new Set();
  await loadDirectory(currentPath.value);
};

// Keyboard Shortcuts: Ctrl+A / Cmd+A, Delete
const handleKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

  // Select all
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectedPaths.value = new Set(filteredItems.value.map(i => i.path));
  } else if (e.key === 'Delete') {
    if (selectedPaths.value.size > 1) {
      handleBatchDelete();
    } else if (selectedPaths.value.size === 1 && singleSelectedItem.value) {
      handleDelete(singleSelectedItem.value);
    }
  }
};

const formatTime = (ts: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
</script>

<style scoped lang="less">
.local-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  user-select: none;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  min-height: 48px;

  .header-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    overflow: hidden;

    .nav-btn {
      flex-shrink: 0;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  white-space: nowrap;
  background: var(--bg-tertiary);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
  font-size: 13px;

  &::-webkit-scrollbar {
    display: none;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.15s ease;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &.active {
      font-weight: 600;
      color: var(--text-primary);
    }

    .root-icon {
      stroke: var(--color-accent);
    }

    .crumb-text {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .crumb-separator {
    color: var(--text-muted);
    font-size: 12px;
  }
}

.search-wrap {
  position: relative;
  width: 180px;

  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    stroke: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding-left: 30px !important;
    padding-right: 26px !important;
    font-size: 12px;
    height: 30px;
  }

  .clear-search-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;

    &:hover {
      color: var(--text-primary);
    }
  }
}

.sort-select-wrap {
  .sort-select {
    height: 30px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 0 8px;
    font-size: 12px;
    cursor: pointer;
    outline: none;

    &:focus {
      border-color: var(--color-accent);
    }
  }
}

.workspace-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  position: relative;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  color: var(--text-muted);
  gap: 12px;
  font-size: 13px;

  .state-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .state-desc {
    font-size: 13px;
    color: var(--text-muted);
    max-width: 400px;
    text-align: center;
  }

  &.error {
    color: var(--danger-color, #ef4444);
    .state-title {
      color: var(--danger-color, #ef4444);
    }
  }

  .empty-icon {
    stroke: var(--text-muted);
    opacity: 0.5;
  }
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 14px;
}

.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  text-align: center;

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-color);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  &.selected {
    background: var(--bg-surface-active);
    border-color: var(--color-accent);
  }

  .card-icon-wrap {
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    margin-bottom: 8px;

    .file-svg {
      transition: transform 0.15s ease;
    }

    .folder-color {
      stroke: #f59e0b;
      fill: rgba(245, 158, 11, 0.15);
    }

    .video-color {
      stroke: #ef4444;
      fill: rgba(239, 68, 68, 0.12);
    }

    .audio-color {
      stroke: #8b5cf6;
      fill: rgba(139, 92, 246, 0.12);
    }

    .image-color {
      stroke: #10b981;
      fill: rgba(16, 185, 129, 0.12);
    }

    .code-color {
      stroke: #3b82f6;
    }

    .doc-color {
      stroke: var(--text-secondary);
    }

    .ext-badge {
      position: absolute;
      bottom: 0;
      right: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      letter-spacing: 0.5px;
    }
  }

  .card-info {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    text-align: center;

    .card-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: break-all;
      white-space: normal;
      padding: 0 2px;
      line-height: 1.35;
      max-height: 2.7em;
    }

    .card-size {
      font-size: 11px;
      color: var(--text-secondary);
      font-weight: 500;
      line-height: 1.3;

      .meta-dir-tag {
        color: var(--text-muted);
      }
    }

    .card-date {
      font-size: 10.5px;
      color: var(--text-muted);
      line-height: 1.3;
      font-variant-numeric: tabular-nums;
    }
  }
}

.workspace-footer {
  height: 28px;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;

  .footer-selected {
    color: var(--text-secondary);
    strong {
      color: var(--text-primary);
    }
  }
}

/* Context Menu */
.context-menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  background: transparent;
}

.context-menu {
  position: fixed;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24), 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 6px;
  min-width: 170px;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: menu-pop 0.12s cubic-bezier(0.16, 1, 0.3, 1);

  .menu-action-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;

    &:hover {
      background: var(--bg-surface-hover);
    }

    &.danger {
      color: var(--danger-color, #ef4444);
      &:hover {
        background: rgba(239, 68, 68, 0.12);
      }
    }

    svg {
      flex-shrink: 0;
      opacity: 0.85;
    }
  }

  .menu-divider {
    height: 1px;
    background: var(--border-light);
    margin: 4px 2px;
  }
}

@keyframes menu-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-light);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal Overlay & Dialog Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 100005;
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-light);

    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }
}
</style>
