<template>
  <div class="view home-view">
    <div class="header">
      <div class="metrics-grid">
        <div class="metric-card" :class="{ active: activeFilter === null }" @click="toggleFilter(null)">
          <div class="metric-label">全部任务</div>
          <div class="metric-value">{{ tasks.length }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'processing' }"
          @click="toggleFilter('processing')">
          <div class="metric-label">
            <span class="status-dot processing"></span>进行中
          </div>
          <div class="metric-value">{{ inProgressCount }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'completed' }" @click="toggleFilter('completed')">
          <div class="metric-label">
            <span class="status-dot completed"></span>已完成
          </div>
          <div class="metric-value">{{ completedCount }}</div>
        </div>
        <div class="metric-card" :class="{ active: activeFilter === 'error' }" @click="toggleFilter('error')">
          <div class="metric-label">
            <span class="status-dot error"></span>异常
          </div>
          <div class="metric-value">{{ errorCount }}</div>
        </div>
      </div>

      <div class="operation-panel">
        <div class="batch-actions-bar" v-if="sortedTasks.length > 0">
          <v-checkbox :checked="isAllSelected" @change="toggleSelectAll" class="select-all-checkbox">
            {{ isAllSelected ? '反选' : '全选' }}
          </v-checkbox>
          <div class="batch-buttons">
            <span class="selected-count" v-show="selectedTasks.length > 0">已选择 {{ selectedTasks.length }} 项</span>
            <v-button variant="secondary" :disabled="selectedTasks.length === 0" @click="batchPause" title="暂停所选">
              <VIcon name="pause" :size="14" />
              暂停
            </v-button>
            <v-button variant="secondary" :disabled="selectedTasks.length === 0" @click="batchResume" title="继续所选">
              <VIcon name="play" :size="14" />
              继续
            </v-button>
            <v-button variant="secondary" :disabled="selectedCompressibleTasks.length === 0" @click="openBatchCompressDialog"
              title="压缩所选">
              <VIcon name="compress" :size="14" />
              压缩
            </v-button>
            <v-button variant="danger-soft" :disabled="selectedTasks.length === 0" @click="batchDelete"
              title="删除所选">
              <VIcon name="trash" :size="14" />
              删除
            </v-button>
          </div>
        </div>

        <div class="right-actions-group">
          <div class="global-stats">
            <div class="stat-item">
              <span class="stat-label">全局速度</span>
              <span class="stat-value mono">{{ formatBytes(globalSpeed) }}/s</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">磁盘空间</span>
              <span class="stat-value mono">{{ formatBytes(globalReceivedBytes) }}</span>
            </div>
          </div>
          <VButton variant="secondary" class="new-task-btn" @click="showPanParseModal = true">
            <VIcon name="cloud-download" :size="14" />
            网盘解析
          </VButton>
          <VButton variant="secondary" class="new-task-btn" @click="showNewDownloadModal = true">
            <VIcon name="plus" :size="14" />
            新建下载
          </VButton>
        </div>
      </div>
    </div>

    <div class="downloads-container">
      <div v-if="sortedTasks.length === 0" class="empty-state">
        <VIcon name="download" :size="48" />
        <p>暂无下载任务</p>
      </div>

      <div v-else class="task-list">
        <div v-for="task in sortedTasks" :key="task.id" class="task-card"
          :class="{ 'is-selected': selectedTasks.includes(task.id) }" @mousedown="startSelection(task.id, $event)"
          @mouseenter="enterSelection(task.id)" @dblclick="openTask(task)">
          <div class="task-checkbox" @click.stop>
            <v-checkbox :value="task.id" v-model="selectedTasks" />
          </div>
          <div class="task-icon" :class="`status-${task.status}`">
            <img v-if="isImageTask(task)" :src="task.url" class="task-thumbnail" referrerpolicy="no-referrer" />
            <template v-else>
              <VIcon v-if="isAudioTask(task)" name="music" :size="20" />
              <VIcon v-else-if="isVideoTask(task)" name="video-sniffer" :size="20" />
              <VIcon v-else name="file" :size="20" />
            </template>
          </div>

          <div class="task-content">
            <div class="task-header">
              <div class="task-name" :title="task.name" :class="{ 'file-removed': task.status === 'file_removed' }">{{ task.name }}</div>
              <div class="task-actions">
                <!-- 正在下载/压缩/转码/处理/等待：暂停 -->
                <VButton v-if="['downloading', 'compressing', 'converting', 'processing', 'resolving', 'waiting'].includes(task.status)" variant="icon-secondary" title="暂停"
                  @click.stop="pauseTask(task.id)">
                  <VIcon name="pause" :size="14" />
                </VButton>
                <!-- 暂停状态：继续下载（下载矢量箭头图标） -->
                <VButton v-else-if="task.status === 'paused'" variant="icon-secondary" title="继续下载"
                  @click.stop="resumeTask(task.id)">
                  <VIcon name="download" :size="14" />
                </VButton>
                <!-- 错误/文件已移除状态：重新下载/重试（环形刷新/重试图标） -->
                <VButton v-else-if="['error', 'file_removed', 'file_corrupted'].includes(task.status)" variant="icon-secondary" :title="task.status === 'file_removed' ? '重新下载' : '重试'"
                  @click.stop="resumeTask(task.id)">
                  <VIcon name="refresh" :size="14" />
                </VButton>
                <!-- 已完成状态：播放/预览（向右三角形播放图标） -->
                <v-button v-else-if="task.status === 'completed'" variant="icon-secondary" title="播放/预览" @click.stop="openTask(task)">
                  <VIcon name="play" :size="14" />
                </v-button>
                <!-- 仅剩失败分片或命中源站永久失效时：手动跳过失效分片并直接合并封装 -->
                <VButton
                  v-if="task.canSkipFailedSegments && ['downloading', 'paused'].includes(task.status)"
                  variant="icon-secondary"
                  title="跳过失效分片并封装"
                  @click.stop="confirmSkipFailedSegments(task)"
                >
                  <VIcon name="skip-forward" :size="14" />
                </VButton>
                <VButton variant="icon-secondary" title="编辑任务" @click.stop="openEditTask(task)">
                  <VIcon name="edit" :size="14" />
                </VButton>
                <VButton variant="icon-secondary" title="打开所在目录" @click.stop="openDirectory(task)">
                  <VIcon name="folder" :size="14" />
                </VButton>
                <!-- 压缩视频按钮（仅对已完成的视频任务显示） -->
                <VButton
                  v-if="task.status === 'completed' && isVideoTask(task)"
                  variant="icon-secondary"
                  title="压缩视频"
                  @click.stop="openCompressDialog(task)"
                >
                  <VIcon name="compress" :size="14" />
                </VButton>
                <VButton variant="icon-danger" title="删除记录" @click.stop="confirmDeleteTask(task)">
                  <VIcon name="close" :size="14" />
                </VButton>
              </div>
            </div>

            <div class="task-progress-wrap">
              <div class="progress-bar">
                <div class="progress-fill" :class="task.status" :style="{ width: task.progress + '%' }"></div>
              </div>
              <span class="progress-text-percent">{{ Math.round(task.progress || 0) }}%</span>
            </div>

            <div class="task-meta">
              <span class="status-text" :class="task.status">{{ getStatusText(task.status, task) }}</span>
              <span v-if="task.errorMsg" class="error-msg" :title="task.errorMsg"> - {{ task.errorMsg }}</span>
              <span class="meta-divider">•</span>
              <span class="size-text">{{ formatBytes(task.receivedBytes) }} {{ task.totalBytes > 0 ? '/ ' + formatBytes(task.totalBytes) : '' }}</span>
              <template v-if="task.totalSegments && task.totalSegments > 0">
                <span class="meta-divider">•</span>
                <span class="segments-text">{{ task.downloadedSegments || 0 }}/{{ task.totalSegments }} 分片</span>
              </template>
              <template v-if="['downloading', 'compressing', 'converting', 'processing', 'resolving'].includes(task.status)">
                <span class="meta-divider">•</span>
                <span v-if="task.status === 'resolving'">解析中</span>
                <span v-else-if="task.status === 'downloading'">{{ formatBytes(task.speed) }}/s</span>
                <span v-else-if="task.status === 'converting'">格式转换中</span>
                <span v-else-if="task.status === 'compressing'">{{ task.speedText ? `${task.speedText} 倍速` : '正在压缩' }}</span>
                <span v-else-if="task.status === 'processing'">处理中</span>
                <template v-if="task.status === 'compressing' && task.etaSeconds !== undefined">
                  <span class="meta-divider">•</span>
                  <span class="eta-text">{{ formatSecondsETA(task.etaSeconds) }}</span>
                </template>
                <template v-else-if="task.status === 'downloading' && task.totalBytes > 0">
                  <span class="meta-divider">•</span>
                  <span class="eta-text">{{ formatETA(task.totalBytes, task.receivedBytes, task.speed) }}</span>
                </template>
              </template>
              <template v-if="task.savePath">
                <span class="meta-divider">•</span>
                <span class="path-text">{{ getDirectory(task.savePath) }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <ImagePreviewDialog v-if="activeImagePreviewUrl" :id="'home-preview'" :url="activeImagePreviewUrl"
      :urls="[activeImagePreviewUrl]" :zIndex="9999" @close="activeImagePreviewUrl = null" :hideDownload="true" />
      
    <AudioPlayerDialog v-if="activeAudioPreviewUrl" :url="activeAudioPreviewUrl" 
      @close="activeAudioPreviewUrl = null" @download="onDownloadAudio" :hideDownload="true" />
    <VideoPlayerDialog v-if="activeVideoPreviewUrl" :url="activeVideoPreviewUrl"
      @edit-complete="handleVideoEditComplete"
      @close="activeVideoPreviewUrl = null" :hideDownload="true" />

    <EditTaskDialog
      v-model:visible="editTaskDialogVisible"
      :task="editingTask"
    />
    <CompressVideoDialog
      v-model:visible="isCompressDialogVisible"
      :task="compressingTask"
      @confirm="handleConfirmCompress"
    />
    <BatchCompressVideoDialog
      v-model:visible="isBatchCompressDialogVisible"
      :tasks="selectedCompressibleTasks"
      @confirm="handleConfirmBatchCompress"
    />
    <NewDownloadDialog
      v-model:visible="showNewDownloadModal"
    />
    <PanParseDialog
      v-model:visible="showPanParseModal"
    />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue';
import { useDownloads } from '@/composables/useDownloads';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';
const NewDownloadDialog = defineAsyncComponent(() => import('@/components/features/NewDownloadDialog.vue'));
const PanParseDialog = defineAsyncComponent(() => import('@/components/features/PanParseDialog.vue'));
const ImagePreviewDialog = defineAsyncComponent(() => import('@/components/features/ImagePreviewDialog.vue'));
const AudioPlayerDialog = defineAsyncComponent(() => import('@/components/features/AudioPlayerDialog.vue'));
const VideoPlayerDialog = defineAsyncComponent(() => import('@/components/features/VideoPlayerDialog.vue'));
const EditTaskDialog = defineAsyncComponent(() => import('@/components/features/EditTaskDialog.vue'));
const CompressVideoDialog = defineAsyncComponent(() => import('@/components/features/CompressVideoDialog.vue'));
const BatchCompressVideoDialog = defineAsyncComponent(() => import('@/components/features/BatchCompressVideoDialog.vue'));
import { formatBytes } from '@/utils/format';
import {
  getStatusText,
  getDirectory,
  formatSecondsETA,
  formatETA,
  isImageTask,
  isAudioTask,
  isVideoTask
} from '@/composables/home/taskHelpers';
import { useHomeSelectionAndFilter } from '@/composables/home/useHomeSelectionAndFilter';
import { useHomeTaskActions } from '@/composables/home/useHomeTaskActions';

const { tasks, pauseTask, resumeTask, skipFailedSegmentsTask, deleteTask, loadTasks, isInitialized, updateTaskDb } = useDownloads();

const {
  activeFilter,
  selectedTasks,
  toggleFilter,
  sortedTasks,
  isAllSelected,
  toggleSelectAll,
  startSelection,
  enterSelection,
  batchPause,
  batchResume,
  batchDelete,
  inProgressCount,
  completedCount,
  errorCount,
  globalSpeed,
  globalReceivedBytes,
  selectedCompressibleTasks
} = useHomeSelectionAndFilter({
  tasks,
  pauseTask,
  resumeTask,
  deleteTask
});

const {
  showNewDownloadModal,
  showPanParseModal,
  activeImagePreviewUrl,
  activeAudioPreviewUrl,
  activeVideoPreviewUrl,
  handleVideoEditComplete,
  editTaskDialogVisible,
  editingTask,
  openEditTask,
  isCompressDialogVisible,
  compressingTask,
  openCompressDialog,
  isBatchCompressDialogVisible,
  openBatchCompressDialog,
  handleConfirmBatchCompress,
  handleConfirmCompress,
  onDownloadAudio,
  openTask,
  confirmSkipFailedSegments,
  openDirectory,
  confirmDeleteTask
} = useHomeTaskActions({
  tasks,
  selectedTasks,
  selectedCompressibleTasks,
  updateTaskDb,
  skipFailedSegmentsTask,
  deleteTask
});

onMounted(async () => {
  if (!isInitialized.value) {
    await loadTasks();
  }
});
</script>

<style scoped lang="less">
.home-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
  box-sizing: border-box;
  overflow: hidden;
}

.header {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-shrink: 0;
}

.operation-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.right-actions-group {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;

  .new-task-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 500;
    flex-shrink: 0;
  }
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.metric-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);

  &:hover {
    border-color: var(--border-color);
    background: var(--bg-surface-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  &.active {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);

    .metric-value {
      color: var(--text-primary);
    }
  }

  .metric-label {
    font-size: 13px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
  }

  .metric-value {
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    line-height: 1;
    letter-spacing: -0.5px;
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.downloading, &.processing, &.resolving {
    background: var(--color-accent);
  }

  &.completed {
    background: #10b981;
  }

  &.error {
    background: #ef4444;
  }
}

.global-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  font-size: 13px;
  margin-left: auto;

  .stat-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-label {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .stat-value {
    color: var(--text-primary);
    font-weight: 600;

    &.mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
  }

  .stat-divider {
    width: 1px;
    height: 14px;
    background: var(--border-color);
  }
}

.downloads-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
  padding-right: 8px;
}

.downloads-container::-webkit-scrollbar {
  width: 8px;
}

.downloads-container::-webkit-scrollbar-track {
  background: transparent;
}

.downloads-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.downloads-container::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-secondary);

  svg {
    margin-bottom: 16px;
    opacity: 0.5;
  }

  p {
    font-size: 15px;
    margin: 0;
  }
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
  padding-bottom: var(--view-padding);
}

.task-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid transparent;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    border-color: var(--border-color);
    transform: translateY(-1px);
    box-shadow: var(--shadow-soft);
  }

  &.is-selected {
    border-color: var(--color-accent);
  }

  .task-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 14px;

    input {
      cursor: pointer;
      margin: 0;
    }
  }
}

.batch-actions-bar {
  display: flex;
  align-items: center;
  gap: 24px;

  .select-all-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-primary);
    user-select: none;

    input {
      cursor: pointer;
    }
  }

  .batch-buttons {
    display: flex;
    align-items: center;
    gap: 12px;

    .selected-count {
      font-size: 13px;
      color: var(--text-secondary);
      margin-right: 8px;
    }

    /* Buttons styled by VButton component */
  }
}

.task-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  .task-thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.status-downloading, &.status-processing, &.status-resolving {
    background: var(--bg-surface-active);
    color: var(--color-accent);
  }

  &.status-paused {
    background: var(--border-light);
    color: var(--text-secondary);
  }

  &.status-completed {
    background: #ecfdf5;
    color: #10b981;
  }

  &.status-error,
  &.status-file_removed,
  &.status-file_corrupted {
    background: #fef2f2;
    color: #ef4444;
  }
}

.task-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.task-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 16px;
  display: flex;
  align-items: center;

  &.file-removed span {
    text-decoration: line-through;
    opacity: 0.6;
  }
}

.edit-name-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  opacity: 0.4;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    opacity: 1;
    color: var(--color-accent);
    background: var(--bg-surface-active);
  }
}

.task-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Action icons styled by VButton component */

.task-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}

.progress-text-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
  background: var(--color-accent);

  &.downloading, &.compressing, &.converting, &.processing, &.resolving, &.waiting {
    background: var(--color-accent);
  }

  &.paused {
    background: var(--text-secondary);
  }

  &.completed {
    background: #10b981;
  }

  &.error,
  &.file_removed,
  &.file_corrupted {
    background: #ef4444;
  }
}

.task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.meta-divider {
  color: var(--border-color);
}

.path-text {
  word-break: break-all;
}

.status-text {
  font-weight: 500;

  &.downloading, &.processing, &.resolving {
    color: var(--color-accent);
  }

  &.waiting {
    color: #f59e0b;
  }

  &.paused {
    color: var(--text-secondary);
  }

  &.completed {
    color: #10b981;
  }

  &.error,
  &.file_removed,
  &.file_corrupted {
    color: #ef4444;
  }
}

.speed-text,
.eta-text,
.size-text {
  font-variant-numeric: tabular-nums;
}

.error-msg {
  color: #ef4444;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
