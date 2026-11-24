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
            :class="{
              active: breadcrumbs.length === 1,
              'drag-target-hover': dragHoverTarget === breadcrumbs[0]?.path
            }"
            @click="jumpToBreadcrumb(0)"
            @dragover="onBreadcrumbDragOver($event, breadcrumbs[0]?.path)"
            @dragenter="onBreadcrumbDragEnter($event, breadcrumbs[0]?.path)"
            @dragleave="onBreadcrumbDragLeave($event, breadcrumbs[0]?.path)"
            @drop="onBreadcrumbDrop($event, breadcrumbs[0]?.path)"
          >
            <VIcon name="folder" :size="14" class="root-icon" />
            <span class="crumb-text">{{ resourceName }}</span>
          </div>

          <template v-for="(crumb, idx) in breadcrumbs.slice(1)" :key="crumb.path">
            <span class="crumb-separator">/</span>
            <div
              class="breadcrumb-item"
              :class="{
                active: idx === breadcrumbs.length - 2,
                'drag-target-hover': dragHoverTarget === crumb.path
              }"
              @click="jumpToBreadcrumb(idx + 1)"
              @dragover="onBreadcrumbDragOver($event, crumb.path)"
              @dragenter="onBreadcrumbDragEnter($event, crumb.path)"
              @dragleave="onBreadcrumbDragLeave($event, crumb.path)"
              @drop="onBreadcrumbDrop($event, crumb.path)"
            >
              <span class="crumb-text">{{ crumb.name }}</span>
            </div>
          </template>
        </div>
      </div>

      <div class="header-actions">
        <!-- Search Input -->
        <div class="search-wrap">
          <v-input
            v-model="searchQuery"
            type="text"
            placeholder=""
            class="search-input"
            @keyup.enter="handleExecuteSearch"
          />
          <div class="search-icon-btn" title="点击搜索 (Enter)" @click="handleExecuteSearch">
            <VIcon name="search" :size="13" class="search-icon" />
          </div>
          <button
            class="clear-search-btn"
            :class="{ active: !!searchQuery }"
            title="清空"
            type="button"
            @click="handleClearSearch"
          >
            <VIcon name="close" :size="11" />
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
    <div
      ref="workspaceBodyRef"
      class="workspace-body"
      @mousedown="handleWorkspaceMouseDown"
      @contextmenu.prevent="onBodyContextMenu"
    >
      <!-- Marquee Selection Box -->
      <div
        v-if="marqueeState.visible"
        class="marquee-selection-box"
        :style="{
          left: `${marqueeState.left}px`,
          top: `${marqueeState.top}px`,
          width: `${marqueeState.width}px`,
          height: `${marqueeState.height}px`
        }"
      ></div>

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
        <span class="state-title">{{ isSearching ? '未找到匹配项' : '当前目录为空' }}</span>
        <v-button v-if="!isSearching" variant="secondary" size="small" @click="showNewFolderModal = true">创建新文件夹</v-button>
        <v-button v-else variant="secondary" size="small" @click="handleClearSearch">返回目录</v-button>
      </div>

      <!-- Grid Cards View -->
      <div v-else class="file-grid">
        <div
          v-for="(item, index) in filteredItems"
          :key="item.path"
          class="file-card"
          :class="{
            selected: selectedPaths.has(item.path),
            'is-directory': item.isDirectory,
            'drag-target-hover': dragHoverTarget === item.path,
            'is-dragging-source': isDraggingItem(item.path)
          }"
          :draggable="true"
          @dragstart="onCardDragStart($event, item, index)"
          @dragend="onCardDragEnd($event)"
          @dragover="onCardDragOver($event, item)"
          @dragenter="onCardDragEnter($event, item)"
          @dragleave="onCardDragLeave($event, item)"
          @drop="onCardDrop($event, item)"
          @click.stop="handleCardClick($event, item, index)"
          @dblclick="handleItemDblClick(item)"
          @contextmenu.prevent.stop="onItemContextMenu($event, item, index)"
        >
          <!-- Recent Added Badge -->
          <span v-if="isRecentFile(item)" class="recent-badge">NEW</span>

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
            <div class="card-name" :title="item.path">{{ item.name }}</div>
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
      <span class="footer-count">{{ isSearching ? `搜索结果: 共 ${filteredItems.length} 项` : `共 ${filteredItems.length} 项` }}</span>
      <span v-if="selectedPaths.size === 1 && singleSelectedItem" class="footer-selected" :title="singleSelectedItem.path">
        已选中: <strong>{{ singleSelectedItem.name }}</strong> ({{ singleSelectedItem.isDirectory ? '文件夹' : formatBytes(singleSelectedItem.size) }})
        <span v-if="isSearching" style="margin-left: 8px; opacity: 0.75; font-size: 11px;">路径: {{ singleSelectedItem.path }}</span>
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
          @click.stop="onContextMenuClick"
          @mousedown.stop
          @contextmenu.stop
        >
          <!-- Multi-Selection Context Menu: Delete, Video Compress and Video Merge -->
          <template v-if="selectedPaths.size > 1">
            <div
              v-if="isAllSelectedVideos && selectedItems.length >= 2"
              class="menu-action-item"
              @click="openMergeVideoModal"
            >
              <VIcon name="merge" :size="14" />
              <span>合并视频</span>
            </div>

            <div
              v-if="isAllSelectedVideos"
              class="menu-action-item"
              @click="openBatchCompressModal"
            >
              <VIcon name="compress" :size="14" />
              <span>压缩视频</span>
            </div>

            <div v-if="isAllSelectedVideos" class="menu-divider"></div>

            <div class="menu-action-item" @click="openBatchMoveModal">
              <VIcon name="folder-move" :size="14" />
              <span>移动</span>
            </div>

            <div class="menu-action-item danger" @click="handleBatchDelete">
              <VIcon name="trash" :size="14" />
              <span>删除</span>
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
            <div class="menu-action-item" @click="closeContextMenu(); showNewFolderModal = true">
              <VIcon name="plus" :size="14" />
              <span>新建文件夹</span>
            </div>

            <div class="menu-action-item" @click="closeContextMenu(); loadDirectory(currentPath)">
              <VIcon name="refresh" :size="14" />
              <span>刷新</span>
            </div>

            <div class="menu-action-item" @click="closeContextMenu(); openInExplorer(currentPath)">
              <VIcon name="external-link" :size="14" />
              <span>在资源管理器中打开</span>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Rename Modal -->
    <Teleport to="body">
      <div v-if="renameModal.visible" class="modal-overlay" v-overlay-close="() => renameModal.visible = false">
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
      <div v-if="showNewFolderModal" class="modal-overlay" v-overlay-close="() => showNewFolderModal = false">
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
      :items="moveDialog.items"
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

    <!-- Merge Video Modal (Multi) -->
    <MergeVideoDialog
      v-model:visible="isMergeVideoDialogVisible"
      :initial-videos="mergeVideosList"
      :current-directory="currentPath"
      @success="handleMergeSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import MoveLocalFileDialog from '@/components/features/MoveLocalFileDialog.vue';
import VideoPlayerDialog from '@/components/features/VideoPlayerDialog.vue';
import AudioPlayerDialog from '@/components/features/AudioPlayerDialog.vue';
import ImagePreviewDialog from '@/components/features/ImagePreviewDialog.vue';
import CompressVideoDialog from '@/components/features/CompressVideoDialog.vue';
import BatchCompressVideoDialog from '@/components/features/BatchCompressVideoDialog.vue';
import MergeVideoDialog from '@/components/features/MergeVideoDialog.vue';
import { formatBytes } from '@/utils/format';
import {
  formatTime,
  getFileCategory,
  isRecentFile,
  type LocalFileItem
} from '@/composables/local/types';
import { useLocalDirectory } from '@/composables/local/useLocalDirectory';
import { useLocalSelectionAndMarquee } from '@/composables/local/useLocalSelectionAndMarquee';
import { useLocalFileOperations } from '@/composables/local/useLocalFileOperations';
import { useLocalDragMove } from '@/composables/local/useLocalDragMove';

export type { LocalFileItem };

const props = defineProps<{
  resourceId: string;
  resourcePath: string;
  resourceName: string;
}>();

const route = useRoute();

let clearSelectionImpl = () => {};

const {
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
} = useLocalDirectory({
  resourcePath: () => props.resourcePath,
  resourceName: () => props.resourceName,
  onClearSelection: () => clearSelectionImpl()
});

const {
  selectedPaths,
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
} = useLocalSelectionAndMarquee({
  items,
  searchResults,
  isSearching,
  filteredItems
});

clearSelectionImpl = clearSelection;

const {
  activeVideoUrl,
  activeAudioUrl,
  activeImageUrl,
  showNewFolderModal,
  newFolderName,
  renameModal,
  moveDialog,
  compressModal,
  isBatchCompressDialogVisible,
  batchCompressTasks,
  isMergeVideoDialogVisible,
  mergeVideosList,
  handleItemDblClick,
  handleContextPreview,
  openInExplorer,
  isPathCurrentlyPlayingOrPreviewed,
  openRenameModal,
  handleConfirmRename,
  handleConfirmNewFolder,
  openMoveModal,
  openBatchMoveModal,
  handleConfirmMove,
  openCompressModal,
  handleConfirmCompress,
  handleCompressDirectory,
  openMergeVideoModal,
  handleMergeSuccess,
  openBatchCompressModal,
  handleConfirmBatchCompress,
  handleDelete,
  handleBatchDelete
} = useLocalFileOperations({
  currentPath,
  selectedPaths,
  selectedItems,
  closeContextMenu,
  loadDirectory
});

const {
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
} = useLocalDragMove({
  currentPath,
  selectedPaths,
  selectedItems,
  closeContextMenu,
  isPathCurrentlyPlayingOrPreviewed,
  loadDirectory
});

// Keyboard Shortcuts: Ctrl+A / Cmd+A, Delete
const handleKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

  if (e.key === 'Escape') {
    if (contextMenu.value.visible) {
      closeContextMenu();
      return;
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectAll();
  } else if (e.key === 'Delete') {
    if (selectedPaths.value.size > 1) {
      handleBatchDelete();
    } else if (selectedPaths.value.size === 1 && singleSelectedItem.value) {
      handleDelete(singleSelectedItem.value);
    }
  }
};

let fileChangeCleanup: (() => void) | null = null;
let taskFinishCleanup: (() => void) | null = null;

onMounted(() => {
  if (props.resourcePath) {
    currentPath.value = props.resourcePath;
    loadDirectory(props.resourcePath);
  }
  window.addEventListener('blur', closeContextMenu);
  window.addEventListener('resize', closeContextMenu);
  window.addEventListener('keydown', handleKeyDown);

  if (window.electronAPI?.onFileSystemChanged) {
    fileChangeCleanup = window.electronAPI.onFileSystemChanged(() => {
      refreshDirectorySilently();
    });
  }
  if (window.electronAPI?.onVideoTaskFinished) {
    taskFinishCleanup = window.electronAPI.onVideoTaskFinished((data) => {
      if (data.success) {
        refreshDirectorySilently();
      }
    });
  }
});

onUnmounted(() => {
  if (fileChangeCleanup) {
    fileChangeCleanup();
    fileChangeCleanup = null;
  }
  if (taskFinishCleanup) {
    taskFinishCleanup();
    taskFinishCleanup = null;
  }
  window.removeEventListener('blur', closeContextMenu);
  window.removeEventListener('resize', closeContextMenu);
  window.removeEventListener('keydown', handleKeyDown);
  cleanupMarquee();
  closeContextMenu();
});

// 路由变化（切换页面）时立即关闭右键菜单并清空选中
watch(() => route.fullPath, () => {
  closeContextMenu();
  clearSelection();
});
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

    &.drag-target-hover {
      background: rgba(59, 130, 246, 0.22) !important;
      border: 1px dashed var(--color-accent, #3b82f6) !important;
      color: var(--color-accent, #3b82f6) !important;
      transform: scale(1.05);
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
  width: 170px;
  display: flex;
  align-items: center;

  .search-input {
    width: 100%;
    padding-left: 24px !important;
    padding-right: 22px !important;
    font-size: 12px;
    height: 30px;
    box-sizing: border-box;
  }

  .search-icon-btn {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--text-muted);
    cursor: pointer;
    z-index: 2;
    transition: color 0.15s ease;

    &:hover {
      color: var(--color-accent);
    }

    .search-icon {
      pointer-events: none;
    }
  }

  .clear-search-btn {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    padding: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
    opacity: 0.35;
    z-index: 2;
    border-radius: 4px;
    transition: all 0.15s ease;

    &.active {
      opacity: 0.8;
      color: var(--text-secondary);
    }

    &:hover {
      opacity: 1;
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

  .marquee-selection-box {
    position: absolute;
    background: rgba(59, 130, 246, 0.16);
    border: 1px solid var(--color-accent, #3b82f6);
    border-radius: 4px;
    pointer-events: none;
    z-index: 50;
    transition: none;
  }
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

  &.is-dragging-source {
    opacity: 0.45;
    transform: scale(0.96);
  }

  &.drag-target-hover {
    background: rgba(59, 130, 246, 0.12) !important;
    border: 2px dashed var(--color-accent, #3b82f6) !important;
    transform: scale(1.04) !important;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.25) !important;

    .card-icon-wrap .file-svg {
      transform: scale(1.15);
    }
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

  .recent-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    color: var(--color-success);
    letter-spacing: 0.5px;
    user-select: none;
    pointer-events: none;
    white-space: nowrap;
    z-index: 2;
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
