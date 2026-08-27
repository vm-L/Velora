<template>
  <Teleport to="body">
    <div v-if="visible && task" class="compress-video-overlay" @click.self="close" @mousedown.stop>
      <div class="compress-video-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <VIcon name="compress" :size="16" style="margin-right: 6px;" />
            <span>压缩视频</span>
          </div>
          <v-button variant="secondary" size="small" style="padding: 4px 6px; min-width: unset;" @click="close" title="关闭">
            <VIcon name="close" :size="14" />
          </v-button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div class="task-info-card">
            <div class="task-name" :title="task.name">{{ task.name }}</div>
            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-label">原文件大小</span>
                <span class="meta-value">{{ formatBytes(originalSize) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">视频时长</span>
                <span class="meta-value">{{ formattedDuration }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">原始码率</span>
                <span class="meta-value">{{ originalBitrateText }}</span>
              </div>
            </div>
          </div>

          <div v-if="isLoadingInfo" class="loading-state">
            <VIcon name="loading" :size="16" class="spin" />
            <span>正在读取视频元数据</span>
          </div>

          <template v-else>
            <div class="form-row" style="margin-top: 16px;">
              <div class="form-group flex-1">
                <label>目标文件大小 (GB)</label>
                <v-input
                  type="number"
                  step="0.1"
                  :min="minTargetSizeGB"
                  max="500"
                  :model-value="targetSizeGB"
                  @update:model-value="handleTargetSizeInput"
                  placeholder="如 1.5"
                />
              </div>

              <div class="form-group flex-1">
                <label>目标压缩码率 (kbps)</label>
                <v-input
                  type="number"
                  step="50"
                  :min="minBitrate"
                  max="100000"
                  :model-value="targetBitrateKbps"
                  @update:model-value="handleTargetBitrateInput"
                  placeholder="如 1500"
                />
              </div>
            </div>

            <div v-if="isBitrateExceeded" class="compress-warning">
              <VIcon name="warning" :size="14" style="flex-shrink: 0;" />
              <span>目标码率 ({{ targetBitrateKbps.toLocaleString() }} kbps) 大于原始码率 ({{ Math.round(originalBitrate / 1000).toLocaleString() }} kbps)，无法进行压缩。</span>
            </div>
            <div v-else class="compress-hint">
              <VIcon name="info" :size="14" style="flex-shrink: 0;" />
              <span>使用 FFmpeg 进行压缩，压缩完成后将自动替换原文件并更新任务体积。</span>
            </div>
          </template>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <v-button variant="secondary" size="small" @click="close" :disabled="isSubmitting">取消</v-button>
          <v-button variant="primary" size="small" @click="handleConfirm" :disabled="isSubmitting || isLoadingInfo || targetBitrateKbps <= 0 || isBitrateExceeded">
            {{ isSubmitting ? '提交中' : '开始压缩' }}
          </v-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import VIcon from '../base/VIcon.vue';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import { logger } from '../../services/logger';
import { useSettings } from '../../composables/useSettings';
import type { DownloadTask } from '../../db';

const props = defineProps<{
  visible: boolean;
  task: DownloadTask | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', payload: { task: DownloadTask; targetBitrateKbps: number }): void;
}>();

const { state: settingsState } = useSettings();

const isLoadingInfo = ref(false);
const isSubmitting = ref(false);

const originalSize = ref(0);
const durationSeconds = ref(0);
const originalBitrate = ref(0);

const targetSizeGB = ref<number>(1.5);
const targetBitrateKbps = ref<number>(1500);

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formattedDuration = computed(() => {
  const d = Math.round(durationSeconds.value);
  if (!d || d <= 0) return '未知';
  const hours = Math.floor(d / 3600);
  const minutes = Math.floor((d % 3600) / 60);
  const seconds = d % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

const originalBitrateText = computed(() => {
  if (!originalBitrate.value || originalBitrate.value <= 0) return '未知';
  const kbps = Math.round(originalBitrate.value / 1000);
  return `${kbps.toLocaleString()} kbps`;
});

const isBitrateExceeded = computed(() => {
  if (!originalBitrate.value || originalBitrate.value <= 0) return false;
  const origKbps = Math.round(originalBitrate.value / 1000);
  return targetBitrateKbps.value > origKbps;
});

const minBitrate = computed(() => settingsState.videoCompressMinBitrateKbps || 1500);

const minTargetSizeGB = computed(() => {
  const duration = durationSeconds.value > 0 ? durationSeconds.value : 7200;
  return parseFloat(((minBitrate.value * 1000 * duration) / (8 * 1024 * 1024 * 1024)).toFixed(2));
});

// 当打开弹窗时，读取视频元信息并赋初始默认值
watch(
  () => [props.visible, props.task],
  async ([visible, currentTask]) => {
    if (visible && currentTask) {
      const taskObj = currentTask as DownloadTask;
      originalSize.value = taskObj.totalBytes || taskObj.receivedBytes || 0;
      durationSeconds.value = 0;
      originalBitrate.value = 0;
      
      const defaultGB = typeof settingsState.videoCompressTargetGB === 'number' && settingsState.videoCompressTargetGB > 0
        ? settingsState.videoCompressTargetGB
        : 1.5;
      targetSizeGB.value = defaultGB;

      if (window.electronAPI && taskObj.savePath) {
        isLoadingInfo.value = true;
        try {
          const info = await window.electronAPI.getVideoMediaInfo(taskObj.savePath);
          if (info) {
            if (info.size > 0) originalSize.value = info.size;
            if (info.duration > 0) durationSeconds.value = info.duration;
            if (info.bitrate > 0) originalBitrate.value = info.bitrate;
          }
        } catch (err: any) {
          logger.error('CompressVideoDialog', `获取视频信息失败: ${err?.message || err}`);
        } finally {
          isLoadingInfo.value = false;
        }
      }

      // 根据视频时长自动联动计算初始目标码率
      if (durationSeconds.value > 0) {
        const bps = (targetSizeGB.value * 1024 * 1024 * 1024 * 8) / durationSeconds.value;
        let kbps = Math.round(bps / 1000);
        if (kbps < minBitrate.value) {
          kbps = minBitrate.value;
          const totalBits = kbps * 1000 * durationSeconds.value;
          const adjustedGb = totalBits / (8 * 1024 * 1024 * 1024);
          targetSizeGB.value = parseFloat(adjustedGb.toFixed(2));
        }
        targetBitrateKbps.value = kbps;
      } else {
        targetBitrateKbps.value = minBitrate.value;
      }
    }
  },
  { immediate: true }
);

// 修改目标文件大小 -> 自动联动计算目标码率
const handleTargetSizeInput = (val: string | number) => {
  const gb = typeof val === 'number' ? val : parseFloat(String(val));
  targetSizeGB.value = isNaN(gb) ? 0 : gb;
  if (isNaN(gb) || gb <= 0) return;

  const duration = durationSeconds.value > 0 ? durationSeconds.value : 7200;
  const bps = (gb * 1024 * 1024 * 1024 * 8) / duration;
  let kbps = Math.round(bps / 1000);

  // 当计算得到的压缩码率小于设置的最小码率时，使用最小码率，并同步反向修正目标文件大小
  if (kbps < minBitrate.value) {
    kbps = minBitrate.value;
    const totalBits = kbps * 1000 * duration;
    const adjustedGb = totalBits / (8 * 1024 * 1024 * 1024);
    targetSizeGB.value = parseFloat(adjustedGb.toFixed(2));
  }
  targetBitrateKbps.value = kbps;
};

// 修改目标码率 -> 自动联动反向计算预计目标文件大小
const handleTargetBitrateInput = (val: string | number) => {
  let kbps = typeof val === 'number' ? val : parseInt(String(val), 10);
  if (isNaN(kbps) || kbps <= 0) {
    targetBitrateKbps.value = isNaN(kbps) ? 0 : kbps;
    return;
  }

  // 保证不低于最小码率
  if (kbps < minBitrate.value) {
    kbps = minBitrate.value;
  }
  targetBitrateKbps.value = kbps;

  const duration = durationSeconds.value > 0 ? durationSeconds.value : 7200;
  const totalBits = kbps * 1000 * duration;
  const gb = totalBits / (8 * 1024 * 1024 * 1024);
  targetSizeGB.value = parseFloat(gb.toFixed(2));
};

const close = () => {
  emit('update:visible', false);
};

const handleConfirm = () => {
  if (!props.task || targetBitrateKbps.value <= 0) return;
  emit('confirm', {
    task: props.task,
    targetBitrateKbps: targetBitrateKbps.value
  });
  close();
};
</script>

<style scoped lang="less">
.compress-video-overlay {
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

.compress-video-modal {
  width: 480px;
  max-width: 90vw;
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
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
  }
}

.modal-body {
  padding: 16px;

  .task-info-card {
    background: var(--bg-app);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px 14px;

    .task-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 10px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .meta-label {
        font-size: 11px;
        color: var(--text-secondary);
      }

      .meta-value {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
      }
    }
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;

    label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
  }

  .compress-hint {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .compress-warning {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 6px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    font-size: 12px;
    line-height: 1.5;
    display: flex;
    gap: 8px;
    align-items: center;
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

.flex-1 {
  flex: 1;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
