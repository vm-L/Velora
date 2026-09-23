<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content waterfall-modal" style="max-width: 520px; width: 92vw;">
      <!-- 步骤 1: 填写域名 -->
      <template v-if="step === 1">
        <div class="modal-header">
          <div class="title-group">
            <h3>新建瀑布流规则 (1/4)</h3>
            <p class="subtitle">设置规则适用的 URL 规则</p>
          </div>
          <v-button variant="icon" class="modal-close-btn" @click="handleCancel">
            <VIcon name="close" :size="20" />
          </v-button>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px; padding: 20px;">
          <div class="form-item">
            <label class="form-label">匹配URL<span class="required">*</span></label>
            <VInputSelect
              v-model="form.domain"
              placeholder="匹配URL，例如: *://*.bilibili.com/*"
              :options="historyRuleOptions"
              class="full-width-input"
              autofocus
              @select="onDomainSelect"
              @enter="goToStep2"
            />
            <span class="form-hint">支持通配符 * (例如 *://*.example.com/*)</span>
          </div>

          <div class="form-item">
            <label class="form-label">规则备注 (可选)</label>
            <v-input
              v-model="form.name"
              type="text"
              placeholder="例如: 帖子列表 / 图库翻页"
              class="full-width-input"
              @enter="goToStep2"
            />
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-light);">
          <v-button variant="secondary" @click="handleCancel">取消</v-button>
          <v-button variant="primary" :disabled="!form.domain.trim()" @click="goToStep2">
            下一步
          </v-button>
        </div>
      </template>

      <!-- 步骤 4: 确认规则并开启 -->
      <template v-else-if="step === 4">
        <div class="modal-header">
          <div class="title-group">
            <h3>确认瀑布流规则 (4/4)</h3>
            <p class="subtitle">核对规则信息，确认后将保存并立即生效</p>
          </div>
          <v-button variant="icon" class="modal-close-btn" @click="handleCancel">
            <VIcon name="close" :size="20" />
          </v-button>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 20px;">
          <div class="summary-card">
            <div class="summary-row">
              <span class="summary-label">匹配URL</span>
              <span class="summary-value code-font">{{ form.domain }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">下一页选择器</span>
              <span class="summary-value code-font highlight-tag">{{ form.nextSelector }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">内容区选择器</span>
              <span class="summary-value code-font highlight-tag">{{ form.contentSelector }}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border-light);">
          <v-button variant="secondary" @click="restartPicking">重新选取</v-button>
          <div style="display: flex; gap: 10px;">
            <v-button variant="secondary" @click="handleCancel">取消</v-button>
            <v-button variant="primary" @click="handleConfirm">确认并开启</v-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInput from '@/components/base/VInput.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';
import type { WaterfallRule } from '@/composables/useSettings';

const props = defineProps<{
  visible: boolean;
  step: number;
  initialDomain?: string;
  initialNextSelector?: string;
  initialContentSelector?: string;
  rules?: WaterfallRule[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void;
  (e: 'start-picking-next'): void;
  (e: 'restart-picking'): void;
  (e: 'confirm', rule: Omit<WaterfallRule, 'id'>): void;
  (e: 'cancel'): void;
}>();

const historyRuleOptions = computed<InputSelectOption[]>(() => {
  if (!props.rules) return [];
  return props.rules.map(r => ({
    label: r.name ? `${r.name} (${r.domain})` : r.domain,
    value: r.domain
  }));
});

const form = reactive({
  domain: '',
  name: '',
  nextSelector: '',
  contentSelector: '',
  enabled: true
});

const loadExistingWaterfallRule = (targetDomain: string) => {
  if (!props.rules || !targetDomain) return;
  const found = props.rules.find(r => r.domain === targetDomain);
  if (found) {
    form.name = found.name || '';
    form.nextSelector = found.nextSelector || '';
    form.contentSelector = found.contentSelector || '';
    form.enabled = found.enabled !== false;
  }
};

const onDomainSelect = (selectedDomain: string) => {
  form.domain = selectedDomain;
  loadExistingWaterfallRule(selectedDomain);
};

watch(() => props.visible, (val) => {
  if (val) {
    if (props.step === 1) {
      form.domain = props.initialDomain || '';
      form.name = '';
      form.nextSelector = '';
      form.contentSelector = '';
      form.enabled = true;
      if (form.domain) {
        loadExistingWaterfallRule(form.domain);
      }
    }
  }
});

watch(() => props.initialDomain, (val) => {
  if (val && !form.domain) form.domain = val;
});

watch(() => props.initialNextSelector, (val) => {
  if (val) form.nextSelector = val;
});

watch(() => props.initialContentSelector, (val) => {
  if (val) form.contentSelector = val;
});

const goToStep2 = () => {
  if (!form.domain.trim()) return;
  emit('start-picking-next');
};

const restartPicking = () => {
  emit('restart-picking');
};

const handleConfirm = () => {
  emit('confirm', {
    domain: form.domain.trim(),
    name: form.name.trim() || undefined,
    nextSelector: form.nextSelector.trim(),
    contentSelector: form.contentSelector.trim(),
    enabled: true
  });
  emit('update:visible', false);
};

const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};
</script>

<style scoped lang="less">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  animation: fadeIn 0.15s ease-out;
}

.waterfall-modal {
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px 14px 20px;
  border-bottom: 1px solid var(--border-light);

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 4px;

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .subtitle {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .form-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);

    .required {
      color: var(--color-error, #ef4444);
    }
  }

  .form-hint {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.full-width-input {
  width: 100%;
}

.summary-card {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  .summary-label {
    font-size: 13px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .summary-value {
    font-size: 13px;
    color: var(--text-primary);
    text-align: right;
    word-break: break-all;
  }

  .highlight-tag {
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--bg-surface-active);
    color: var(--color-accent);
    font-weight: 600;
  }
}

.code-font {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
</style>
