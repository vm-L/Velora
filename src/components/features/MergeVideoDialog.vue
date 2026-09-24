<template>
  <Teleport to="body">
    <div v-if="visible && videoList.length > 0" class="merge-video-overlay" @click.self="handleOverlayClick" @mousedown.stop>
      <div class="merge-video-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <VIcon name="merge" :size="16" />
            <span>合并视频</span>
          </div>
          <v-button
            variant="secondary"
            size="small"
            class="close-btn"
            :disabled="isMerging"
            title="关闭"
            @click="close"
          >
            <VIcon name="close" :size="14" />
          </v-button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div class="summary-card">
            <div class="summary-title">待合并视频清单 ({{ videoList.length }} 个文件)</div>
            <div class="summary-desc">系统将按从上到下的顺序拼接视频，可拖拽或使用箭头调整顺序。</div>
          </div>

          <!-- Video List with Drag & Drop Reordering -->
          <div class="video-list-container custom-scrollbar">
            <div
              v-for="(item, idx) in videoList"
              :key="item.path"
              class="video-item"
              :class="{
                'is-dragging': draggingIndex === idx,
                'drag-over': dragOverIndex === idx,
                'disabled': isMerging
              }"
              :draggable="!isMerging"
              @dragstart="onDragStart(idx, $event)"
              @dragover.prevent="onDragOver(idx, $event)"
              @dragleave="onDragLeave(idx, $event)"
              @drop="onDrop(idx, $event)"
              @dragend="onDragEnd"
            >
              <div class="drag-handle" :title="isMerging ? '' : '按住拖拽调整顺序'">
                <VIcon name="drag-handle" :size="14" />
              </div>
              <div class="video-index">{{ idx + 1 }}</div>
              <div class="video-info" :title="item.path">
                <span class="video-name">{{ item.name }}</span>
                <span class="video-size">{{ formatBytes(item.size) }}</span>
              </div>
              <div class="video-actions">
                <v-button
                  variant="secondary"
                  size="small"
                  class="action-btn"
                  :disabled="isMerging || idx === 0"
                  title="上移"
                  @click="moveUp(idx)"
                >
                  <VIcon name="arrow-up" :size="12" />
                </v-button>
                <v-button
                  variant="secondary"
                  size="small"
                  class="action-btn"
                  :disabled="isMerging || idx === videoList.length - 1"
                  title="下移"
                  @click="moveDown(idx)"
                >
                  <VIcon name="arrow-down" :size="12" />
                </v-button>
                <v-button
                  variant="secondary"
                  size="small"
                  class="action-btn danger"
                  :disabled="isMerging || videoList.length <= 2"
                  title="移除"
                  @click="removeItem(idx)"
                >
                  <VIcon name="trash" :size="12" />
                </v-button>
              </div>
            </div>
          </div>

          <!-- Output Path Configuration -->
          <div class="form-group" style="margin-top: 14px;">
            <label>合并输出路径</label>
            <div class="output-row">
              <v-input
                :model-value="outputPath"
                :disabled="isMerging"
                placeholder="选择或输入合并后的保存路径"
                class="output-input"
                @update:model-value="handleOutputPathInput"
              />
              <v-button
                variant="secondary"
                size="small"
                :disabled="isMerging"
                class="browse-btn"
                @click="browseOutputPath"
              >
                浏览...
              </v-button>
            </div>
          </div>

          <!-- Progress Section -->
          <div v-if="isMerging" class="progress-section">
            <div class="progress-header">
              <span class="progress-status">{{ progressText || '正在处理中...' }}</span>
              <span class="progress-percent mono">{{ progressPercent }}%</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }"></div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <template v-if="isMerging">
            <v-button
              variant="danger"
              size="small"
              :disabled="progressPercent >= 100 || isCancelling"
              @click="cancelMerge"
            >
              {{ progressPercent >= 100 ? '正在完成...' : (isCancelling ? '正在取消...' : '取消合并') }}
            </v-button>
          </template>
          <template v-else>
            <v-button variant="secondary" size="small" @click="close">
              取消
            </v-button>
            <v-button
              variant="primary"
              size="small"
              :disabled="videoList.length < 2 || !outputPath.trim()"
              @click="startMerge"
            >
              开始合并
            </v-button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import VIcon from '@/components/base/VIcon.vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import { formatBytes } from '@/utils/format';
import { useMessage } from '@/composables/useMessage';
import { logger } from '@/services/logger';

export interface MergeVideoItem {
  name: string;
  path: string;
  size: number;
}

const props = defineProps<{
  visible: boolean;
  initialVideos: MergeVideoItem[];
  currentDirectory?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'success', outputPath: string): void;
}>();

const { showMessage } = useMessage();

const videoList = ref<MergeVideoItem[]>([]);
const outputPath = ref<string>('');
const isMerging = ref<boolean>(false);
const progressPercent = ref<number>(0);
const progressText = ref<string>('');
const currentTaskId = ref<string>('');

const isCancelling = ref<boolean>(false);

const draggingIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// Initialize or reset when dialog opens
watch(
  () => props.visible,
  (val) => {
    if (val) {
      videoList.value = (props.initialVideos || []).map(v => ({ ...v }));
      isMerging.value = false;
      isCancelling.value = false;
      progressPercent.value = 0;
      progressText.value = '';
      currentTaskId.value = '';
      draggingIndex.value = null;
      dragOverIndex.value = null;

      // Compute default output filename and path: "[firstVideoBaseName]_merge.mp4"
      if (videoList.value.length > 0) {
        const firstPath = videoList.value[0].path;
        const norm = firstPath.replace(/\\/g, '/');
        const lastSlash = norm.lastIndexOf('/');
        const dir = lastSlash !== -1 ? norm.substring(0, lastSlash) : (props.currentDirectory || '');
        const fullName = lastSlash !== -1 ? norm.substring(lastSlash + 1) : norm;
        const dotIdx = fullName.lastIndexOf('.');
        const baseName = dotIdx !== -1 ? fullName.substring(0, dotIdx) : fullName;
        const ext = dotIdx !== -1 ? fullName.substring(dotIdx) : '.mp4';
        const defaultFilename = `${baseName}_merge${ext}`;
        outputPath.value = dir ? `${dir}/${defaultFilename}` : defaultFilename;
      } else {
        outputPath.value = '';
      }
    }
  },
  { immediate: true }
);

const handleOutputPathInput = (val: string | number) => {
  outputPath.value = String(val);
};

// Reorder methods
const moveUp = (index: number) => {
  if (index <= 0 || isMerging.value) return;
  const item = videoList.value.splice(index, 1)[0];
  videoList.value.splice(index - 1, 0, item);
};

const moveDown = (index: number) => {
  if (index >= videoList.value.length - 1 || isMerging.value) return;
  const item = videoList.value.splice(index, 1)[0];
  videoList.value.splice(index + 1, 0, item);
};

const removeItem = (index: number) => {
  if (videoList.value.length <= 2 || isMerging.value) return;
  videoList.value.splice(index, 1);
};

// Drag and drop sorting handlers
const onDragStart = (index: number, event: DragEvent) => {
  if (isMerging.value) return;
  draggingIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
};

const onDragOver = (index: number, event: DragEvent) => {
  if (isMerging.value || draggingIndex.value === null) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverIndex.value = index;
};

const onDragLeave = (index: number, _event: DragEvent) => {
  if (dragOverIndex.value === index) {
    dragOverIndex.value = null;
  }
};

const onDrop = (targetIndex: number, event: DragEvent) => {
  event.preventDefault();
  if (draggingIndex.value === null || draggingIndex.value === targetIndex) {
    dragOverIndex.value = null;
    draggingIndex.value = null;
    return;
  }
  const item = videoList.value.splice(draggingIndex.value, 1)[0];
  videoList.value.splice(targetIndex, 0, item);
  dragOverIndex.value = null;
  draggingIndex.value = null;
};

const onDragEnd = () => {
  draggingIndex.value = null;
  dragOverIndex.value = null;
};

// Browse file destination
const browseOutputPath = async () => {
  if (!window.electronAPI) return;
  try {
    const res = await window.electronAPI.showSaveDialog({
      title: '选择合并视频保存位置',
      defaultPath: outputPath.value,
      filters: [
        { name: 'MP4 视频文件', extensions: ['mp4'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (!res.canceled && res.filePath) {
      outputPath.value = res.filePath.replace(/\\/g, '/');
    }
  } catch (err: any) {
    logger.error('MergeVideoDialog', `选择保存路径异常: ${err?.message}`);
  }
};

const handleOverlayClick = () => {
  if (isMerging.value) return;
  close();
};

const close = () => {
  if (isMerging.value) return;
  emit('update:visible', false);
};

// Start merge execution
const startMerge = async () => {
  if (videoList.value.length < 2 || !outputPath.value.trim() || !window.electronAPI) return;
  const taskId = `merge-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  currentTaskId.value = taskId;
  isMerging.value = true;
  isCancelling.value = false;
  progressPercent.value = 0;
  progressText.value = '正在准备合并...';

  window.electronAPI.onVideoMergeProgress(taskId, (data) => {
    progressPercent.value = Math.min(100, Math.max(0, Math.round(data.percent)));
    progressText.value = data.text;
  });

  try {
    const res = await window.electronAPI.mergeVideos({
      taskId,
      videoPaths: videoList.value.map(v => v.path),
      outputPath: outputPath.value.trim()
    });

    if (res && res.success) {
      isMerging.value = false;
      emit('update:visible', false);
      showMessage('视频合并完成', 'success');
      emit('success', outputPath.value.trim());
    } else if (res && res.error) {
      if (res.error !== '操作已取消') {
        showMessage(`合并失败: ${res.error}`, 'error');
      }
    }
  } catch (err: any) {
    showMessage(`合并失败: ${err?.message || '未知错误'}`, 'error');
  } finally {
    if (window.electronAPI && currentTaskId.value) {
      window.electronAPI.offVideoMergeProgress(currentTaskId.value);
    }
    isMerging.value = false;
    isCancelling.value = false;
    currentTaskId.value = '';
  }
};

// Cancel ongoing merge
const cancelMerge = async () => {
  if (!currentTaskId.value || !window.electronAPI || isCancelling.value || progressPercent.value >= 100) return;
  isCancelling.value = true;
  try {
    await window.electronAPI.cancelVideoMerge(currentTaskId.value);
    showMessage('已取消合并', 'info');
  } catch (err: any) {
    logger.error('MergeVideoDialog', `取消合并失败: ${err?.message}`);
  } finally {
    isCancelling.value = false;
    isMerging.value = false;
  }
};

onUnmounted(() => {
  if (currentTaskId.value && window.electronAPI) {
    window.electronAPI.offVideoMergeProgress(currentTaskId.value);
  }
});
</script>

<style scoped lang="less">
.merge-video-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2147483647;
  display: flex;
  justify-content: center;
  align-items: center;
}

.merge-video-modal {
  width: 520px;
  max-width: 92vw;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary);
}

.modal-header {
  height: 46px;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface-hover);

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }

  .close-btn {
    padding: 4px 6px;
    min-width: unset;
  }
}

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .summary-card {
    background: var(--bg-app);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 12px;

    .summary-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .summary-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
    }
  }

  .video-list-container {
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-app);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .video-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    user-select: none;

    &.is-dragging {
      opacity: 0.4;
    }

    &.drag-over {
      border-color: var(--color-accent);
      background: var(--bg-surface-hover);
    }

    &.disabled {
      cursor: not-allowed;
      opacity: 0.75;
    }

    .drag-handle {
      cursor: grab;
      color: var(--text-tertiary);
      display: flex;
      align-items: center;

      &:hover {
        color: var(--text-primary);
      }
    }

    .video-index {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-app);
      border-radius: 50%;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .video-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .video-name {
        font-size: 12px;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .video-size {
        font-size: 11px;
        color: var(--text-tertiary);
        font-family: var(--font-mono, monospace);
      }
    }

    .video-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;

      .action-btn {
        padding: 3px 6px;
        min-width: unset;

        &.danger:hover:not(:disabled) {
          color: var(--color-danger, #ef4444);
        }
      }
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;

    label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .output-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .output-input {
        flex: 1;
      }

      .browse-btn {
        white-space: nowrap;
      }
    }
  }

  .progress-section {
    background: var(--bg-app);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;

      .progress-status {
        color: var(--text-primary);
      }

      .progress-percent {
        color: var(--color-accent);
        font-weight: 600;
      }
    }

    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: var(--border-color);
      border-radius: 3px;
      overflow: hidden;

      .progress-bar-fill {
        height: 100%;
        background: var(--color-accent);
        border-radius: 3px;
        transition: width 0.2s ease;
      }
    }
  }
}

.modal-footer {
  height: 48px;
  padding: 0 16px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-app);
}

.custom-scrollbar {
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--text-tertiary);
  }
}
</style>
