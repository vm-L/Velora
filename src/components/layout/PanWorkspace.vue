<template>
  <div class="pan-workspace">
    <!-- 顶部导航与操作栏 -->
    <div class="workspace-header">
      <div class="header-nav">
        <VButton
          variant="icon"
          class="nav-btn"
          :disabled="isAtRoot"
          @click="navigateUp"
          title="返回上一级"
        >
          <VIcon name="chevron-left" :size="18" />
        </VButton>
        <VButton
          variant="icon"
          class="nav-btn"
          @click="loadCurrentDirectory(true)"
          title="刷新"
        >
          <VIcon name="refresh" :size="16" />
        </VButton>

        <!-- 面包屑路径导航 -->
        <div class="breadcrumb-container">
          <div
            class="breadcrumb-item"
            :class="{ active: breadcrumbs.length === 1 }"
            @click="jumpToBreadcrumb(0)"
          >
            <VIcon name="cloud" :size="14" class="root-icon" />
            <span class="crumb-text">{{ panDisplayName }}</span>
          </div>

          <template v-for="(crumb, idx) in breadcrumbs.slice(1)" :key="crumb.id">
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
        <!-- 账号容量概况 -->
        <div v-if="displayQuotaText" class="quota-badge" :title="`容量：${displayQuotaText}`">
          <VIcon name="cloud" :size="13" />
          <span>{{ displayQuotaText }}</span>
        </div>

        <VButton variant="secondary" size="small" @click="openNewFolderModal" title="新建文件夹">
          <VIcon name="plus" :size="13" />
          <span>新建文件夹</span>
        </VButton>

        <!-- 文件类型筛选 -->
        <div class="type-filter-wrap">
          <VInputSelect
            v-model="typeFilter"
            :options="typeFilterOptions"
            :allow-input="false"
            placeholder="全部类型"
          />
        </div>

        <!-- 本地即时过滤搜索框 -->
        <div class="search-wrap">
          <VInput
            v-model="searchQuery"
            placeholder="过滤当前目录文件"
            class="search-input"
            clearable
          />
        </div>
      </div>
    </div>

    <!-- 主体文件列表区域 -->
    <div class="workspace-body">
      <!-- 加载中状态 -->
      <div v-if="isLoading" class="loading-state">
        <VIcon name="loading" :size="24" class="spin-icon" />
        <span>加载网盘文件中</span>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="loadError" class="error-state">
        <VIcon name="warning" :size="28" />
        <span class="error-msg">{{ loadError }}</span>
        <div class="error-actions" style="display: flex; gap: 8px; margin-top: 4px;">
          <VButton v-if="loadError.includes('登录')" variant="secondary" size="small" @click="handleRelogin">重新登录</VButton>
          <VButton variant="secondary" size="small" @click="loadCurrentDirectory(true)">重试</VButton>
        </div>
      </div>

      <!-- 空目录或无搜索结果 -->
      <div v-else-if="filteredFiles.length === 0" class="empty-state">
        <VIcon name="folder" :size="36" class="empty-icon" />
        <span>{{ searchQuery || typeFilter !== 'all' ? '未找到匹配的文件' : '当前目录为空' }}</span>
      </div>

      <!-- 文件列表视图 -->
      <div v-else class="file-table" :class="{ 'has-selection': selectedIds.length > 0 }">
        <div class="file-table-header">
          <div class="col-checkbox">
            <VCheckbox
              :checked="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleSelectAll"
            />
          </div>
          <div
            class="col-name sortable-header"
            :class="{ active: sortBy === 'name' }"
            @click="toggleSort('name')"
          >
            <span>名称</span>
            <VIcon v-if="sortBy === 'name'" :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" :size="12" />
          </div>
          <div
            class="col-size sortable-header"
            :class="{ active: sortBy === 'size' }"
            @click="toggleSort('size')"
          >
            <span>大小</span>
            <VIcon v-if="sortBy === 'size'" :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" :size="12" />
          </div>
          <div
            class="col-date sortable-header"
            :class="{ active: sortBy === 'updatedAt' }"
            @click="toggleSort('updatedAt')"
          >
            <span>修改时间</span>
            <VIcon v-if="sortBy === 'updatedAt'" :name="sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'" :size="12" />
          </div>
          <div class="col-actions">操作</div>
        </div>

        <div class="file-table-body">
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            class="file-row"
            :class="{ 'is-selected': isSelected(file.id) }"
            @click="handleRowClick(file)"
            @dblclick="handleRowDblClick(file)"
          >
            <div class="col-checkbox" @click.stop>
              <VCheckbox
                :checked="isSelected(file.id)"
                @change="toggleItemSelect(file.id)"
              />
            </div>

            <div class="col-name">
              <VIcon :name="getFileIcon(file)" :size="18" class="file-icon" />
              <span
                class="file-name-text"
                :class="{ 'is-folder-name': file.isDirectory }"
                :title="file.name"
                @click.stop="handleNameClick(file)"
              >{{ file.name }}</span>
            </div>

            <div class="col-size">
              {{ file.isDirectory ? '-' : formatBytes(file.size) }}
            </div>

            <div class="col-date">
              {{ formatTime(file.updatedAt) }}
            </div>

            <div class="col-actions" @click.stop>
              <VButton
                v-if="!file.isDirectory && isMediaFile(file)"
                variant="icon"
                class="row-action-btn"
                @click="handlePreview(file)"
                title="在线预览"
              >
                <VIcon name="play" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn"
                @click="openRenameModal(file)"
                title="重命名"
              >
                <VIcon name="edit" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn"
                @click="openMoveModal([file])"
                title="移动"
              >
                <VIcon name="folder-move" :size="13" />
              </VButton>
              <VButton
                v-if="panType !== 'ilanzou'"
                variant="icon"
                class="row-action-btn"
                @click="openShareModal([file])"
                title="创建分享"
              >
                <VIcon name="external-link" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn"
                :disabled="isDownloading"
                @click="handleDownloadSingle(file)"
                title="下载"
              >
                <VIcon name="download" :size="13" />
              </VButton>
              <VButton
                variant="icon"
                class="row-action-btn delete-btn"
                @click="handleDeleteSingle(file)"
                title="删除"
              >
                <VIcon name="trash" :size="13" />
              </VButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部悬浮批量操作栏 -->
    <div v-if="selectedIds.length > 0" class="batch-bar">
      <div class="batch-bar-left">
        <VButton variant="text" size="small" @click="clearSelection">
          取消
        </VButton>
        <span class="selected-summary">已选择 {{ selectedIds.length }} 项</span>
      </div>

      <div class="batch-bar-right">
        <VButton
          variant="primary"
          size="small"
          :disabled="isDownloading"
          @click="handleBatchDownload"
        >
          <VIcon name="download" :size="13" />
          <span>下载所选</span>
        </VButton>
        <VButton
          variant="secondary"
          size="small"
          @click="openMoveBatchModal"
        >
          <VIcon name="folder-move" :size="13" />
          <span>移动所选</span>
        </VButton>
        <VButton
          v-if="panType !== 'ilanzou'"
          variant="secondary"
          size="small"
          @click="openShareBatchModal"
        >
          <VIcon name="external-link" :size="13" />
          <span>创建分享</span>
        </VButton>
        <VButton
          variant="danger-soft"
          size="small"
          :disabled="isDeleting"
          @click="handleBatchDelete"
        >
          <VIcon name="trash" :size="13" />
          <span>删除所选</span>
        </VButton>
      </div>
    </div>

    <!-- 内置视频播放弹窗 -->
    <VideoPlayerDialog
      v-if="activeVideoUrl"
      :url="activeVideoUrl"
      :pageUrl="defaultReferer || ''"
      @close="activeVideoUrl = null"
    />

    <!-- 内置音频播放弹窗 -->
    <AudioPlayerDialog
      v-if="activeAudioUrl"
      :url="activeAudioUrl"
      :pageUrl="defaultReferer || ''"
      @close="activeAudioUrl = null"
    />

    <!-- 新建文件夹弹窗 -->
    <div v-if="showNewFolderModal" class="pan-modal-overlay" @click.self="closeNewFolderModal">
      <div class="pan-modal">
        <div class="pan-modal-header">
          <span>新建文件夹</span>
          <VButton variant="icon" @click="closeNewFolderModal">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>
        <div class="pan-modal-body">
          <div class="pan-form-group">
            <label>文件夹名称</label>
            <input
              v-model="newFolderNameInput"
              type="text"
              class="pan-modal-input"
              placeholder="请输入文件夹名称"
              @keyup.enter="submitNewFolder"
            />
          </div>
        </div>
        <div class="pan-modal-footer">
          <VButton variant="secondary" @click="closeNewFolderModal">取消</VButton>
          <VButton
            variant="primary"
            :loading="isModalSubmitting"
            :disabled="!newFolderNameInput.trim() || isModalSubmitting"
            @click="submitNewFolder"
          >
            确定创建
          </VButton>
        </div>
      </div>
    </div>

    <!-- 重命名弹窗 -->
    <div v-if="showRenameModal" class="pan-modal-overlay" @click.self="closeRenameModal">
      <div class="pan-modal">
        <div class="pan-modal-header">
          <span>重命名</span>
          <VButton variant="icon" @click="closeRenameModal">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>
        <div class="pan-modal-body">
          <div class="pan-form-group">
            <label>新名称</label>
            <input
              v-model="renameInput"
              type="text"
              class="pan-modal-input"
              placeholder="请输入新名称"
              @keyup.enter="submitRename"
            />
          </div>
        </div>
        <div class="pan-modal-footer">
          <VButton variant="secondary" @click="closeRenameModal">取消</VButton>
          <VButton
            variant="primary"
            :loading="isModalSubmitting"
            :disabled="!renameInput.trim() || isModalSubmitting"
            @click="submitRename"
          >
            确认重命名
          </VButton>
        </div>
      </div>
    </div>

    <!-- 移动到目录选择器 -->
    <PanFolderPickerDialog
      :visible="showMoveModal"
      :panType="panType"
      :title="moveTargetFiles.length > 1 ? `移动 ${moveTargetFiles.length} 项到...` : `移动「${moveTargetFiles[0]?.name || ''}」到...`"
      confirmText="移动到此处"
      :excludeIds="moveExcludeIds"
      @close="showMoveModal = false"
      @confirm="handleConfirmMove"
    />

    <!-- 创建分享弹窗 -->
    <div v-if="showShareModal" class="pan-modal-overlay" @click.self="closeShareModal">
      <div class="pan-modal">
        <div class="pan-modal-header">
          <span>创建分享</span>
          <VButton variant="icon" @click="closeShareModal">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>
        <div class="pan-modal-body">
          <template v-if="!shareResult">
            <div class="share-summary">
              分享内容：{{ shareTargetSummary }}
            </div>

            <div class="pan-form-group">
              <label>有效期</label>
              <div v-if="panType === 'lanzou'" class="pan-notice-box">
                蓝奏云分享链接默认永久有效。
              </div>
              <select v-else v-model.number="shareExpireType" class="pan-modal-select">
                <option
                  v-for="opt in shareExpireOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div v-if="!['115', '139', 'lanzou'].includes(panType)" class="pan-form-group">
              <label>提取码（选填）</label>
              <input
                v-model="sharePasscodeInput"
                type="text"
                class="pan-modal-input"
                maxlength="8"
                placeholder="留空则按默认规则生成或免密码"
              />
            </div>
          </template>

          <template v-else>
            <div class="share-result-box">
              <div v-if="shareResult.title" class="share-result-row">
                <span class="result-label">名称：</span>
                <span class="result-val">{{ shareResult.title }}</span>
              </div>
              <div class="share-result-row">
                <span class="result-label">链接：</span>
                <span class="result-val mono">{{ shareResult.shareUrl }}</span>
              </div>
              <div v-if="shareResult.passcode" class="share-result-row">
                <span class="result-label">提取码：</span>
                <span class="result-val mono">{{ shareResult.passcode }}</span>
              </div>
              <div v-if="shareResult.warning" class="share-warning">
                {{ shareResult.warning }}
              </div>
            </div>
          </template>
        </div>
        <div class="pan-modal-footer">
          <template v-if="!shareResult">
            <VButton variant="secondary" @click="closeShareModal">取消</VButton>
            <VButton
              variant="primary"
              :loading="isModalSubmitting"
              :disabled="isModalSubmitting || shareTargetFiles.length === 0"
              @click="submitCreateShare"
            >
              生成分享链接
            </VButton>
          </template>
          <template v-else>
            <VButton variant="secondary" @click="closeShareModal">关闭</VButton>
            <VButton variant="secondary" @click="copyShareResult">
              <VIcon name="copy-text" :size="13" />
              <span>一键复制</span>
            </VButton>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, defineAsyncComponent } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';
import VIcon from '@/components/base/VIcon.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';
import { usePanAccounts, type PanAccountInfo } from '@/composables/usePanAccounts';
import PanFolderPickerDialog from '@/components/features/PanFolderPickerDialog.vue';
import {
  getDefaultPanReferer,
  getFileIcon,
  isMediaFile,
  formatBytes,
  formatTime,
  type PanFileItem
} from '@/composables/pan/types';
import { usePanDirectory } from '@/composables/pan/usePanDirectory';
import { usePanTransfers } from '@/composables/pan/usePanTransfers';
import { usePanModals } from '@/composables/pan/usePanModals';

const VideoPlayerDialog = defineAsyncComponent(() => import('@/components/features/VideoPlayerDialog.vue'));
const AudioPlayerDialog = defineAsyncComponent(() => import('@/components/features/AudioPlayerDialog.vue'));

const props = defineProps<{
  panType: string;
  account?: PanAccountInfo;
}>();

const { getPanName } = usePanAccounts();

const panDisplayName = computed(() => getPanName(props.panType));
const defaultReferer = computed(() => getDefaultPanReferer(props.panType));

const typeFilterOptions: InputSelectOption[] = [
  { label: '全部类型', value: 'all' },
  { label: '文件夹', value: 'folder' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
  { label: '图片', value: 'image' },
  { label: '其他', value: 'other' }
];

const {
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
  resetDirectoryState
} = usePanDirectory({
  panType: () => props.panType,
  accountQuotaText: () => props.account?.quotaText
});

const {
  isDownloading,
  isDeleting,
  activeVideoUrl,
  activeAudioUrl,
  handlePreview,
  handleDownloadSingle,
  handleBatchDownload,
  handleDeleteSingle,
  handleBatchDelete,
  resetPreviewState
} = usePanTransfers({
  panType: () => props.panType,
  defaultReferer: () => defaultReferer.value,
  currentFiles,
  selectedIds,
  clearSelection,
  loadCurrentDirectory
});

const {
  isModalSubmitting,
  showNewFolderModal,
  newFolderNameInput,
  showRenameModal,
  renameInput,
  showMoveModal,
  moveTargetFiles,
  moveExcludeIds,
  showShareModal,
  shareTargetFiles,
  shareExpireType,
  sharePasscodeInput,
  shareResult,
  shareTargetSummary,
  shareExpireOptions,
  openNewFolderModal,
  closeNewFolderModal,
  submitNewFolder,
  openRenameModal,
  closeRenameModal,
  submitRename,
  openMoveModal,
  openMoveBatchModal,
  handleConfirmMove,
  openShareModal,
  openShareBatchModal,
  closeShareModal,
  submitCreateShare,
  copyShareResult,
  resetAllModals
} = usePanModals({
  panType: () => props.panType,
  currentPdirFid,
  currentFiles,
  selectedIds,
  clearSelection,
  loadCurrentDirectory
});

const handleRowClick = (file: PanFileItem) => {
  toggleItemSelect(file.id);
};

const handleNameClick = (file: PanFileItem) => {
  if (file.isDirectory) {
    enterFolder(file);
  } else {
    toggleItemSelect(file.id);
  }
};

const handleRowDblClick = (file: PanFileItem) => {
  if (file.isDirectory) {
    enterFolder(file);
  } else if (isMediaFile(file)) {
    handlePreview(file);
  }
};

watch(
  () => props.panType,
  () => {
    resetDirectoryState();
    resetPreviewState();
    resetAllModals();
    loadCurrentDirectory(true);
  }
);

onMounted(() => {
  loadCurrentDirectory(true);
});
</script>

<style scoped>
.pan-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-surface);
  overflow: hidden;
}

.workspace-header {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface);
  flex-shrink: 0;
  gap: 12px;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.nav-btn {
  color: var(--text-secondary);
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  white-space: nowrap;
  padding-left: 6px;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.breadcrumb-item:hover {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

.breadcrumb-item.active {
  font-weight: 600;
  color: var(--text-primary);
  cursor: default;
}

.breadcrumb-item.active:hover {
  background: none;
}

.crumb-separator {
  color: var(--text-muted);
  font-size: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.quota-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px;
  background: var(--bg-app);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  white-space: nowrap;
}

.type-filter-wrap {
  width: 112px;
  flex-shrink: 0;
}

.search-wrap {
  width: 200px;
}

.sortable-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

.sortable-header:hover,
.sortable-header.active {
  color: var(--color-accent);
}

.workspace-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 40px;
}

.spin-icon {
  animation: spin 1s linear infinite;
  color: var(--color-accent);
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.error-state {
  color: var(--color-error, #ef4444);
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.5;
}

.file-table {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.file-table.has-selection {
  padding-bottom: 72px;
}

.file-table-header {
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-app);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  position: sticky;
  top: 0;
  z-index: 2;
}

.file-row {
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
  color: var(--text-primary);
  transition: background-color 0.15s ease;
  user-select: none;
  cursor: pointer;
}

.file-row:hover {
  background: var(--bg-surface-hover);
}

.file-row.is-selected {
  background: var(--bg-surface-active, rgba(59, 130, 246, 0.08));
}

.col-checkbox {
  width: 36px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.col-name {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.file-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.file-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-name-text.is-folder-name:hover {
  color: var(--color-accent);
  text-decoration: underline;
}

.col-size {
  width: 120px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.col-date {
  width: 150px;
  color: var(--text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.col-actions {
  width: 172px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.file-row:hover .col-actions {
  opacity: 1;
}

.row-action-btn {
  color: var(--text-secondary);
}

.row-action-btn:hover {
  color: var(--text-primary);
}

.row-action-btn.delete-btn:hover {
  color: var(--color-error, #ef4444);
}

.batch-bar {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 32px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding: 8px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 20;
}

.batch-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  white-space: nowrap;
}

.selected-summary {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.batch-bar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
}

.pan-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.pan-modal {
  width: 420px;
  max-width: 90vw;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pan-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-light);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.pan-modal-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pan-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pan-form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.pan-modal-input,
.pan-modal-select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-app, var(--bg-surface));
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.pan-modal-input:focus,
.pan-modal-select:focus {
  border-color: var(--color-accent);
}

.share-summary {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-surface-hover);
  word-break: break-all;
}

.pan-notice-box {
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  font-size: 12px;
  color: var(--text-primary);
}

.share-result-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-light);
}

.share-result-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.share-result-row .result-label {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.share-result-row .result-val {
  color: var(--text-primary);
  word-break: break-all;
}

.share-result-row .result-val.mono {
  font-family: monospace;
  user-select: all;
}

.share-warning {
  font-size: 12px;
  color: #f59e0b;
  margin-top: 2px;
}

.pan-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-light);
}
</style>
