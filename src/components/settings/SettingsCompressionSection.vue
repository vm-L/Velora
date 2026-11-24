<template>
  <div class="settings-section-title">压缩</div>
  <div class="settings-card">
    <!-- 下载后压缩视频开关 -->
    <div class="settings-row">
      <div class="settings-info">
        <h3>下载后压缩视频</h3>
        <p>当体积与码率满足条件时自动使用 FFmpeg 进行压缩</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-switch
          :model-value="state.enableVideoCompress"
          @change="handleCompressToggle"
        />
      </div>
    </div>

    <!-- 目标文件大小 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>目标文件大小 (GB)</h3>
        <p>期望压缩后的目标文件大小</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          type="number"
          step="0.1"
          min="0.1"
          max="50"
          v-model.number="state.videoCompressTargetGB"
          @change="handleTargetGBChange"
          @blur="handleTargetGBChange"
          class="inline-input"
          style="width: 100px; min-width: 100px;"
        />
      </div>
    </div>

    <!-- 最小码率 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>最小码率 (kbps)</h3>
        <p>当原视频码率或计算出的压缩码率低于此值时不执行压缩</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-input
          type="number"
          step="100"
          min="100"
          max="50000"
          v-model.number="state.videoCompressMinBitrateKbps"
          @change="handleMinBitrateChange"
          @blur="handleMinBitrateChange"
          class="inline-input"
          style="width: 100px; min-width: 100px;"
        />
      </div>
    </div>

    <!-- 速度限制 -->
    <div class="settings-row" style="border-top: 1px solid var(--border-light);">
      <div class="settings-info">
        <h3>速度限制</h3>
        <p>限制视频转码处理倍速（1-32x，留空或 0 为全速）</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <VInputSelect
          v-model="speedLimitInput"
          :options="speedLimitOptions"
          :allow-input="true"
          placeholder="留空或 0 为全速"
          class="speed-limit-select"
          @select="handleSpeedLimitSelect"
          @blur="handleSpeedLimitCommit"
          @enter="handleSpeedLimitCommit"
          @focus="handleSpeedLimitFocus"
        />
      </div>
    </div>

    <!-- 限速生效范围 -->
    <div
      v-if="state.videoCompressSpeedLimit > 0"
      class="settings-row"
      style="border-top: 1px solid var(--border-light);"
    >
      <div class="settings-info">
        <h3>限速生效范围</h3>
        <p>限制压缩速度的生效场景</p>
      </div>
      <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
        <v-button variant="secondary" @click="showThrottleScopeModal = true">
          <VIcon name="settings" :size="14" />
          <span>管理</span>
        </v-button>
      </div>
    </div>
  </div>

  <!-- Throttle Scope Management Modal -->
  <div v-if="showThrottleScopeModal" class="modal-overlay" v-overlay-close="() => showThrottleScopeModal = false">
    <div class="modal-content" style="max-width: 440px; width: 90vw;">
      <div class="modal-header">
        <h3>限速生效范围</h3>
        <v-button variant="icon" class="modal-close-btn" @click="showThrottleScopeModal = false">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>
      <div class="modal-body" style="padding: 16px 20px;">
        <div class="throttle-scope-modal-list">
          <v-checkbox
            v-for="opt in throttleScopeOptions"
            :key="opt.value"
            class="throttle-scope-modal-item"
            :model-value="state.videoThrottleScopes"
            :value="opt.value"
            @change="handleThrottleScopesChange"
          >
            <div class="scope-item-content">
              <span class="scope-item-title">{{ opt.label }}</span>
              <span class="scope-item-desc">{{ opt.desc }}</span>
            </div>
          </v-checkbox>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; padding: 12px 20px; border-top: 1px solid var(--border-light);">
        <v-button variant="secondary" @click="showThrottleScopeModal = false">
          <VIcon name="check" :size="14" />
          <span>完成</span>
        </v-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettings, type VideoThrottleScope } from '@/composables/useSettings';
import { useMessage } from '@/composables/useMessage';
import { formatSpeedLimitDisplay, parseSpeedLimitInput } from '@/utils/speedLimit';
import { extractInputRawValue } from '@/components/settings/settingsHelpers';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInput from '@/components/base/VInput.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';
import VSwitch from '@/components/base/VSwitch.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';

const {
  state,
  saveEnableVideoCompress,
  saveVideoCompressTargetGB,
  saveVideoCompressMinBitrateKbps,
  saveVideoCompressSpeedLimit,
  saveVideoThrottleScopes
} = useSettings();
const { showMessage } = useMessage();

const handleCompressToggle = (val: boolean) => {
  saveEnableVideoCompress(val);
  showMessage(val ? '已开启下载后智能视频压缩' : '已关闭下载后视频压缩', 'info');
};

const speedLimitOptions: InputSelectOption[] = [
  { label: '低速 2x', value: '2x' },
  { label: '均衡 4x', value: '4x' },
  { label: '加速 8x', value: '8x' },
  { label: '全速 (不限)', value: '全速' }
];

const speedLimitInput = ref<string>(formatSpeedLimitDisplay(state.videoCompressSpeedLimit));
const showThrottleScopeModal = ref(false);

const throttleScopeOptions: Array<{ label: string; desc: string; value: VideoThrottleScope }> = [
  { label: '自动压缩', desc: '下载完成后自动压缩视频时生效', value: 'autoCompress' },
  { label: '手动压缩', desc: '手动发起单个或批量视频压缩时生效', value: 'manualCompress' }
];

watch(
  () => state.videoCompressSpeedLimit,
  (val) => {
    speedLimitInput.value = formatSpeedLimitDisplay(val);
    if (val <= 0) {
      showThrottleScopeModal.value = false;
    }
  },
  { immediate: true }
);

const handleSpeedLimitFocus = (_val: string, evt: FocusEvent) => {
  const targetEl = evt?.target as HTMLInputElement | null;
  if (targetEl && typeof targetEl.select === 'function') {
    requestAnimationFrame(() => {
      targetEl.select();
    });
  }
};

const commitSpeedLimit = async (rawOverride?: string) => {
  const raw = rawOverride !== undefined ? rawOverride : speedLimitInput.value;
  const parsed = parseSpeedLimitInput(raw);
  if (!parsed.valid) {
    speedLimitInput.value = formatSpeedLimitDisplay(state.videoCompressSpeedLimit);
    showMessage('请输入 1-32 之间的整数，留空或输入 0 为全速', 'warning', 3000);
    return;
  }

  const nextLimit = parsed.value;
  speedLimitInput.value = formatSpeedLimitDisplay(nextLimit);

  if (parsed.clamped) {
    if (nextLimit !== state.videoCompressSpeedLimit) {
      await saveVideoCompressSpeedLimit(nextLimit);
    }
    showMessage('速度限制最大为 32x，已自动调整为 32x', 'warning', 3000);
    return;
  }

  if (nextLimit === state.videoCompressSpeedLimit) {
    return;
  }

  await saveVideoCompressSpeedLimit(nextLimit);
  showMessage(
    nextLimit > 0 ? `已将速度限制设置为 ${nextLimit}x` : '已将速度限制设置为全速',
    'info'
  );
};

const handleSpeedLimitSelect = async (val: string) => {
  await commitSpeedLimit(val);
};

const handleSpeedLimitCommit = async () => {
  await commitSpeedLimit();
};

const handleThrottleScopesChange = async (val: VideoThrottleScope[]) => {
  await saveVideoThrottleScopes(val);
};

const handleTargetGBChange = (val?: any) => {
  const raw = extractInputRawValue(val, state.videoCompressTargetGB);
  let num = parseFloat(String(raw));
  if (isNaN(num) || num < 0.1) num = 0.1;
  else if (num > 50) num = 50;
  num = Math.round(num * 10) / 10;
  state.videoCompressTargetGB = num;
  saveVideoCompressTargetGB(num);
};

const handleMinBitrateChange = (val?: any) => {
  const raw = extractInputRawValue(val, state.videoCompressMinBitrateKbps);
  let num = parseInt(String(raw), 10);
  if (isNaN(num) || num < 100) num = 100;
  else if (num > 50000) num = 50000;
  state.videoCompressMinBitrateKbps = num;
  saveVideoCompressMinBitrateKbps(num);
};
</script>
