<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" v-overlay-close="close">
      <div class="video-slim-modal">
        <div class="modal-header">
          <div class="header-title">
            <VIcon name="compress" :size="16" />
            <span>视频压缩</span>
          </div>
          <VButton variant="icon" class="close-btn" @click="close" title="关闭">
            <VIcon name="close" :size="14" />
          </VButton>
        </div>

        <div class="modal-body">
          <!-- 码率阈值配置（仅扫描当前目录） -->
          <div class="config-panel">
            <div class="config-row">
              <div class="config-field compact">
                <label>高码率阈值 (kbps)</label>
                <VInput
                  type="number"
                  :model-value="minBitrateKbps"
                  @update:model-value="onMinBitrateInput"
                  placeholder="4000"
                />
              </div>
              <div class="config-field compact">
                <label>目标码率 (kbps)</label>
                <VInput
                  type="number"
                  :model-value="targetBitrateKbps"
                  @update:model-value="onTargetBitrateInput"
                  placeholder="1500"
                />
              </div>
              <div class="config-action">
                <VButton
                  variant="secondary"
                  size="small"
                  :loading="isScanning"
                  :disabled="isScanning"
                  @click="runScan"
                >
                  <VIcon name="search" :size="13" />
                  <span>{{ isScanning ? '扫描中' : '开始扫描' }}</span>
                </VButton>
              </div>
            </div>
            <div v-if="currentPath" class="scope-hint" :title="currentPath">
              <VIcon name="folder" :size="13" />
              <span>当前目录：{{ currentPath }}</span>
            </div>
          </div>

          <!-- 状态提示 -->
          <div v-if="isScanning" class="state-box">
            <VIcon name="loading" :size="20" class="spin-icon" />
            <span>正在扫描目录并探测视频码率</span>
          </div>

          <div v-else-if="scanError" class="state-box error">
            <VIcon name="warning" :size="20" />
            <span>{{ scanError }}</span>
          </div>

          <div v-else-if="hasScanned && candidates.length === 0" class="state-box">
            <VIcon name="success" :size="22" />
            <span>已扫描 {{ totalScanned }} 个视频，未发现超过 {{ minBitrateKbps }} kbps 的高码率视频</span>
          </div>

          <!-- 候选清单 -->
          <div v-else-if="candidates.length > 0" class="result-section">
            <div class="result-toolbar">
              <span class="result-meta">
                扫描 {{ totalScanned }} 个视频，筛出 <strong>{{ candidates.length }}</strong> 个高码率项
              </span>
              <div class="result-quick-actions">
                <VButton variant="text" size="small" @click="selectAll">全选</VButton>
                <VButton variant="text" size="small" @click="clearSelected">清空</VButton>
              </div>
            </div>

            <div class="candidate-list">
              <div
                v-for="item in candidates"
                :key="item.path"
                class="candidate-row"
                :class="{ 'is-selected': selectedPaths.has(item.path) }"
                @click="toggleSelect(item.path)"
              >
                <div class="row-check" @click.stop>
                  <VCheckbox
                    :checked="selectedPaths.has(item.path)"
                    @change="toggleSelect(item.path)"
                  />
                </div>
                <div class="row-main">
                  <div class="row-name" :title="item.path">{{ item.name }}</div>
                  <div class="row-sub">
                    <span>{{ item.width }}×{{ item.height }}</span>
                    <span>·</span>
                    <span>{{ formatBitrate(item.bitrateKbps) }}</span>
                    <span>·</span>
                    <span>原大小 {{ formatBytes(item.size) }}</span>
                  </div>
                </div>
                <div class="row-savings">
                  <span class="savings-label">预计可省</span>
                  <strong class="savings-val">{{ formatBytes(item.estimatedSavingsBytes) }}</strong>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="state-box">
            <VIcon name="compress" :size="22" />
            <span>点击「开始扫描」探测当前目录中的高码率视频，并一键送入批量压缩队列</span>
          </div>
        </div>

        <div class="modal-footer">
          <div class="footer-summary">
            <template v-if="selectedCount > 0">
              已选 <strong>{{ selectedCount }}</strong> 项 · 预计释放 <strong>{{ formatBytes(selectedSavingsBytes) }}</strong>
            </template>
          </div>
          <div class="footer-actions">
            <VButton variant="secondary" @click="close">取消</VButton>
            <VButton
              variant="primary"
              :disabled="selectedCount === 0 || isScanning || targetBitrateKbps <= 0"
              @click="handleConfirmCompress"
            >
              开始压缩
            </VButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';
import VIcon from '@/components/base/VIcon.vue';
import { useSettings } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { formatBytes } from '@/utils/format';

interface SlimCandidate {
  name: string;
  path: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  bitrateKbps: number;
  estimatedSavingsBytes: number;
}

const props = defineProps<{
  visible: boolean;
  currentPath: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'confirm', payload: { tasks: Array<{ id: string; name: string; savePath: string; totalBytes: number }>; targetBitrateKbps: number }): void;
}>();

const { state: settingsState } = useSettings();
const { showMessage } = useMessage();

const minBitrateKbps = ref<number>(4000);
const targetBitrateKbps = ref<number>(1500);
const isScanning = ref(false);
const hasScanned = ref(false);
const scanError = ref('');
const totalScanned = ref(0);
const candidates = ref<SlimCandidate[]>([]);
const selectedPaths = ref<Set<string>>(new Set());

watch(
  () => props.visible,
  (val) => {
    if (val) {
      const defaultTarget = settingsState.videoCompressMinBitrateKbps || 1500;
      targetBitrateKbps.value = defaultTarget;
      minBitrateKbps.value = Math.max(4000, defaultTarget * 2);
      hasScanned.value = false;
      scanError.value = '';
      totalScanned.value = 0;
      candidates.value = [];
      selectedPaths.value = new Set();
    }
  }
);

const onMinBitrateInput = (val: string | number) => {
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  minBitrateKbps.value = isNaN(n) ? 0 : Math.max(300, Math.min(100000, n));
};

const onTargetBitrateInput = (val: string | number) => {
  const n = typeof val === 'number' ? val : parseInt(String(val), 10);
  targetBitrateKbps.value = isNaN(n) ? 0 : Math.max(300, Math.min(100000, n));
};

const formatBitrate = (kbps: number): string => {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps} kbps`;
};

const selectedCount = computed(() => selectedPaths.value.size);

const selectedSavingsBytes = computed(() => {
  let sum = 0;
  for (const item of candidates.value) {
    if (selectedPaths.value.has(item.path)) {
      sum += item.estimatedSavingsBytes || 0;
    }
  }
  return sum;
});

const toggleSelect = (filePath: string) => {
  const next = new Set(selectedPaths.value);
  if (next.has(filePath)) {
    next.delete(filePath);
  } else {
    next.add(filePath);
  }
  selectedPaths.value = next;
};

const selectAll = () => {
  selectedPaths.value = new Set(candidates.value.map((c) => c.path));
};

const clearSelected = () => {
  selectedPaths.value = new Set();
};

const runScan = async () => {
  if (!window.electronAPI?.auditHighBitrateVideos) {
    showMessage('当前客户端暂不支持视频码率扫描', 'warning');
    return;
  }
  if (minBitrateKbps.value <= targetBitrateKbps.value) {
    showMessage('高码率阈值必须大于目标压缩码率', 'warning');
    return;
  }

  const targetPaths = props.currentPath ? [props.currentPath] : [];

  if (targetPaths.length === 0) {
    showMessage('未找到可扫描的当前目录', 'warning');
    return;
  }

  isScanning.value = true;
  scanError.value = '';
  candidates.value = [];
  selectedPaths.value = new Set();

  try {
    const res = await window.electronAPI.auditHighBitrateVideos({
      targetPaths,
      minBitrateKbps: minBitrateKbps.value,
      targetBitrateKbps: targetBitrateKbps.value
    });
    hasScanned.value = true;
    if (res && res.success) {
      totalScanned.value = res.totalScanned || 0;
      candidates.value = res.candidates || [];
      selectedPaths.value = new Set(candidates.value.map((c) => c.path));
    } else {
      scanError.value = res?.error || '扫描视频失败';
    }
  } catch (err: any) {
    hasScanned.value = true;
    scanError.value = err?.message || '扫描视频异常';
  } finally {
    isScanning.value = false;
  }
};

const handleConfirmCompress = () => {
  const tasks = candidates.value
    .filter((c) => selectedPaths.value.has(c.path))
    .map((c) => ({
      id: `local-slim-${Math.random().toString(36).slice(2, 10)}`,
      name: c.name,
      savePath: c.path,
      totalBytes: c.size
    }));
  if (tasks.length === 0) return;
  emit('confirm', { tasks, targetBitrateKbps: targetBitrateKbps.value });
  close();
};

const close = () => {
  emit('update:visible', false);
};
</script>

<style scoped lang="less">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.video-slim-modal {
  width: 680px;
  max-width: 92vw;
  max-height: 84vh;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  padding: 16px 18px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.config-panel {
  background: var(--bg-app);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 12px 14px;
}

.config-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 12px;
    color: var(--text-secondary);
  }

  &.compact {
    width: 130px;
  }
}

.config-action {
  margin-left: auto;
}

.scope-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-secondary);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;

  &.error {
    color: var(--color-error, #ef4444);
  }
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

.result-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.result-quick-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg-surface);
}

.candidate-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--bg-surface-hover);
  }
}

.row-check {
  flex-shrink: 0;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.row-savings {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
  gap: 2px;
}

.savings-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.savings-val {
  font-size: 12.5px;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-light);
}

.footer-summary {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
