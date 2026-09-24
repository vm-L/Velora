<template>
  <Teleport to="body">
    <div v-if="visible && tasks.length > 0" class="batch-compress-overlay" @click.self="close" @mousedown.stop>
      <div class="batch-compress-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <VIcon name="compress" :size="16" style="margin-right: 6px;" />
            <span>批量压缩视频</span>
          </div>
          <v-button variant="secondary" size="small" style="padding: 4px 6px; min-width: unset;" @click="close" title="关闭">
            <VIcon name="close" :size="14" />
          </v-button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <div class="summary-card">
            <div class="summary-title">已选择 {{ tasks.length }} 个已完成的视频任务</div>
            <div class="summary-desc">系统将自动读取各个视频的实际码率，仅对原始码率大于目标码率的文件启动压缩。</div>
          </div>

          <div class="form-group" style="margin-top: 16px;">
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

          <div class="compress-hint">
            <VIcon name="info" :size="14" style="flex-shrink: 0;" />
            <span>压缩任务同一时间仅开始一个，其他任务将自动进入排队等候状态；小于或等于目标码率的文件将自动跳过。</span>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <v-button variant="secondary" size="small" @click="close">取消</v-button>
          <v-button variant="primary" size="small" @click="handleConfirm" :disabled="targetBitrateKbps <= 0">
            开始压缩
          </v-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import VIcon from '@/components/base/VIcon.vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import { useSettings } from '@/composables/useSettings';
import type { DownloadTask } from '@/db';

const props = defineProps<{
  visible: boolean;
  tasks: Array<DownloadTask | any>;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm', payload: { tasks: Array<DownloadTask | any>; targetBitrateKbps: number }): void;
}>();

const { state: settingsState } = useSettings();

const minBitrate = computed(() => settingsState.videoCompressMinBitrateKbps || 1500);
const targetBitrateKbps = ref<number>(1500);

watch(
  () => props.visible,
  (val) => {
    if (val) {
      targetBitrateKbps.value = minBitrate.value;
    }
  },
  { immediate: true }
);

const handleTargetBitrateInput = (val: string | number) => {
  let kbps = typeof val === 'number' ? val : parseInt(String(val), 10);
  if (isNaN(kbps) || kbps <= 0) {
    targetBitrateKbps.value = isNaN(kbps) ? 0 : kbps;
    return;
  }
  if (kbps < minBitrate.value) {
    kbps = minBitrate.value;
  }
  targetBitrateKbps.value = kbps;
};

const close = () => {
  emit('update:visible', false);
};

const handleConfirm = () => {
  if (props.tasks.length === 0 || targetBitrateKbps.value <= 0) return;
  emit('confirm', {
    tasks: props.tasks,
    targetBitrateKbps: targetBitrateKbps.value
  });
  close();
};
</script>

<style scoped lang="less">
.batch-compress-overlay {
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

.batch-compress-modal {
  width: 440px;
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

  .summary-card {
    background: var(--bg-app);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px 14px;

    .summary-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .summary-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.5;
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
    align-items: flex-start;
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
</style>
