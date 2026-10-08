<template>
  <div v-show="modelValue && !isElementPickingActive" class="inspector-dialog" :style="{ top: position.y + 'px', left: position.x + 'px' }">
    <!-- Header -->
    <div class="inspector-header" @mousedown="startDrag">
      <div class="header-title">
        <VIcon name="duplicate-mark" :size="14" style="margin-right: 6px;" />
        标记重复
      </div>
      <div class="header-actions">
        <v-button variant="secondary" size="small" style="padding: 2px 4px; min-width: unset;" @click="close" title="关闭">
          <VIcon name="close" :size="12" />
        </v-button>
      </div>
    </div>

    <!-- Content -->
    <div class="inspector-content">
      <div class="inspector-content-inner">
        <div class="inspector-body">
          <!-- 规则快速切换 / 新增 -->
          <div class="info-row" v-if="rules && rules.length > 0">
            <span class="label">已存规则</span>
            <div class="field-control rule-switch-group">
              <VInputSelect
                v-model="selectedRuleId"
                :options="savedRuleOptions"
                :allow-input="false"
                class="value-input flex-1"
                placeholder="选择已有规则进行编辑"
                @change="onRuleSelectChange"
              />
              <v-button variant="secondary" size="small" class="action-btn-inline" @click="resetToNewRule" title="新建一条规则">
                <VIcon name="plus" :size="12" style="margin-right: 4px;" />
                新建
              </v-button>
            </div>
          </div>

          <!-- 匹配 URL -->
          <div class="info-row domain-info">
            <span class="label">匹配域名<span class="required-star">*</span></span>
            <div class="field-control">
              <v-input
                v-model="currentRule.domain"
                placeholder="匹配URL，例如: www.bilibili.com 或 www.bilibili.com/list"
                class="mono-input value-input flex-1"
              />
            </div>
          </div>

          <!-- 规则名称 -->
          <div class="info-row">
            <span class="label">规则名称</span>
            <div class="field-control">
              <v-input
                v-model="currentRule.name"
                class="value-input flex-1"
                placeholder="例如: 列表卡片去重标记"
              />
            </div>
          </div>

          <!-- 挂载元素选择器 -->
          <div class="info-row">
            <span class="label">挂载元素<span class="required-star">*</span></span>
            <div class="field-control selector-group">
              <v-input
                v-model="currentRule.mountSelector"
                class="value-input mono-input flex-1"
                placeholder="例如: .bili-video-card"
              />
              <v-button variant="secondary" size="small" class="action-btn-inline pick-btn" @click="emit('pick-mount')" title="在网页中拾取挂载元素">
                <VIcon name="magic" :size="12" style="margin-right: 4px;" />
                选取
              </v-button>
            </div>
          </div>

          <!-- 标题元素选择器与属性 -->
          <div class="info-row">
            <span class="label">标题元素</span>
            <div class="field-control title-element-group">
              <v-input
                v-model="currentRule.titleSelector"
                class="value-input mono-input title-selector-input"
                placeholder="子选择器(留空为挂载元素)"
              />
              <VInputSelect
                v-model="currentRule.titleAttribute"
                :options="titleAttributeOptions"
                :allow-input="true"
                class="value-input mono-input title-attr-select"
                placeholder="属性(默认innerText)"
              />
            </div>
          </div>

          <!-- XY 轴偏移数值 -->
          <div class="info-row">
            <span class="label">偏移位置</span>
            <div class="field-control offset-group">
              <div class="offset-item">
                <span class="sub-label">X 轴:</span>
                <v-input
                  v-model.number="currentRule.offsetX"
                  type="number"
                  class="value-input flex-1"
                  placeholder="8"
                />
                <span class="unit">px</span>
              </div>
              <div class="offset-item">
                <span class="sub-label">Y 轴:</span>
                <v-input
                  v-model.number="currentRule.offsetY"
                  type="number"
                  class="value-input flex-1"
                  placeholder="8"
                />
                <span class="unit">px</span>
              </div>
            </div>
          </div>

          <!-- 启用开关 -->
          <div class="info-row" style="margin-top: 2px;">
            <span class="label">启用状态</span>
            <div class="field-control">
              <label class="toggle-label">
                <input type="checkbox" v-model="currentRule.enabled" />
                <span class="toggle-text">{{ currentRule.enabled ? '已启用' : '已禁用' }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="inspector-footer">
          <v-button
            v-if="isEditingExisting"
            variant="danger"
            class="btn"
            style="margin-right: auto;"
            @click="deleteCurrentRule"
          >
            删除
          </v-button>
          <v-button variant="secondary" class="btn" @click="close">取消</v-button>
          <v-button variant="primary" class="btn" @click="save">保存</v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';
import type { DuplicateMarkRule } from '@/composables/useSettings';
import { useDraggableDialog } from '@/composables/useDraggableDialog';
import { useMessage } from '@/composables/useMessage';
import { useConfirm } from '@/composables/useConfirm';
import { useElementPickerSession } from '@/composables/useElementPickerSession';
import { getDefaultUrlPattern, isUrlMatchPattern } from '@/utils/urlMatcher';

const props = defineProps<{
  modelValue: boolean;
  url?: string;
  resourceId: string;
  rules?: DuplicateMarkRule[];
}>();

const emit = defineEmits([
  'update:modelValue',
  'save',
  'delete',
  'preview',
  'pick-mount',
  'interaction-start',
  'interaction-end'
]);

const titleAttributeOptions: InputSelectOption[] = [
  { label: 'innerText (默认)', value: 'innerText' },
  { label: 'textContent', value: 'textContent' },
  { label: 'title', value: 'title' },
  { label: 'alt', value: 'alt' },
  { label: 'aria-label', value: 'aria-label' }
];

const { showMessage } = useMessage();
const { confirm } = useConfirm();
const { isElementPickingActive } = useElementPickerSession();

const { position, startDrag, resetPosition } = useDraggableDialog({
  dialogWidth: 460,
  dialogHeight: 460,
  onInteractionStart: () => emit('interaction-start'),
  onInteractionEnd: () => emit('interaction-end')
});

const currentRule = reactive<{
  id: string;
  name: string;
  domain: string;
  mountSelector: string;
  titleSelector: string;
  titleAttribute: string;
  offsetX: number;
  offsetY: number;
  enabled: boolean;
}>({
  id: '',
  name: '',
  domain: '',
  mountSelector: '',
  titleSelector: '',
  titleAttribute: 'innerText',
  offsetX: 8,
  offsetY: 8,
  enabled: true
});

const selectedRuleId = ref('');

const isEditingExisting = computed(() => {
  return !!(props.rules && props.rules.some(r => r.id === currentRule.id));
});

const savedRuleOptions = computed<InputSelectOption[]>(() => {
  if (!props.rules || props.rules.length === 0) return [];
  return props.rules.map(r => ({
    label: r.name ? `${r.name} (${r.domain})` : (r.domain || '未命名规则'),
    value: r.id
  }));
});

const loadRule = (rule: DuplicateMarkRule) => {
  currentRule.id = rule.id;
  currentRule.name = rule.name || '';
  currentRule.domain = rule.domain;
  currentRule.mountSelector = rule.mountSelector;
  currentRule.titleSelector = rule.titleSelector || '';
  currentRule.titleAttribute = (rule.titleAttribute && rule.titleAttribute.trim()) ? rule.titleAttribute.trim() : 'innerText';
  currentRule.offsetX = typeof rule.offsetX === 'number' ? rule.offsetX : 8;
  currentRule.offsetY = typeof rule.offsetY === 'number' ? rule.offsetY : 8;
  currentRule.enabled = rule.enabled !== false;
  selectedRuleId.value = rule.id;
};

const resetToNewRule = () => {
  const defaultDomain = getDefaultUrlPattern(props.url);
  currentRule.id = 'dup_rule_' + Date.now();
  currentRule.name = '';
  currentRule.domain = defaultDomain;
  currentRule.mountSelector = '';
  currentRule.titleSelector = '';
  currentRule.titleAttribute = 'innerText';
  currentRule.offsetX = 8;
  currentRule.offsetY = 8;
  currentRule.enabled = true;
  selectedRuleId.value = '';
};

const onRuleSelectChange = (ruleId: string) => {
  const found = props.rules?.find(r => r.id === ruleId);
  if (found) {
    loadRule(found);
  }
};

const setMountSelector = (selector: string) => {
  currentRule.mountSelector = selector;
};

const setTitleSelector = (selector: string) => {
  currentRule.titleSelector = selector;
};

let previewTimer: ReturnType<typeof setTimeout> | null = null;

const triggerPreview = () => {
  if (!props.modelValue) return;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    emit('preview', { ...currentRule });
  }, 150);
};

watch(
  currentRule,
  () => {
    triggerPreview();
  },
  { deep: true }
);

const autoLoadOrNewRule = (availableRules?: DuplicateMarkRule[]) => {
  const rulesList = availableRules !== undefined ? availableRules : (props.rules || []);
  if (rulesList.length > 0 && props.url) {
    const matched = rulesList.find(r => r.domain && isUrlMatchPattern(r.domain, props.url!));
    if (matched) {
      loadRule(matched);
      return;
    }
  }
  resetToNewRule();
};

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      resetPosition();
      autoLoadOrNewRule();
    } else {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    }
  },
  { immediate: true }
);

const close = () => {
  emit('update:modelValue', false);
};

const deleteCurrentRule = async () => {
  if (!currentRule.id) return;
  const confirmed = await confirm({
    title: '删除规则',
    message: `确定要删除规则 "${currentRule.name || currentRule.domain}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const currentList = props.rules || [];
  const updated = currentList.filter(r => r.id !== currentRule.id);
  emit('delete', updated);
  autoLoadOrNewRule(updated);
};

const save = () => {
  if (!currentRule.domain.trim()) {
    showMessage('请输入匹配域名', 'error');
    return;
  }
  if (!currentRule.mountSelector.trim()) {
    showMessage('请输入挂载元素选择器', 'error');
    return;
  }

  const currentList = [...(props.rules || [])];
  const ruleToSave: DuplicateMarkRule = {
    id: currentRule.id || 'dup_rule_' + Date.now(),
    name: (currentRule.name || '').trim(),
    domain: currentRule.domain.trim(),
    mountSelector: currentRule.mountSelector.trim(),
    titleSelector: (currentRule.titleSelector || '').trim(),
    titleAttribute: (currentRule.titleAttribute || '').trim() || 'innerText',
    offsetX: typeof currentRule.offsetX === 'number' ? currentRule.offsetX : 8,
    offsetY: typeof currentRule.offsetY === 'number' ? currentRule.offsetY : 8,
    enabled: currentRule.enabled !== false
  };

  const existingIdx = currentList.findIndex(r => r.id === ruleToSave.id);
  if (existingIdx !== -1) {
    currentList[existingIdx] = ruleToSave;
  } else {
    currentList.push(ruleToSave);
  }

  emit('save', currentList);
  close();
};

defineExpose({
  setMountSelector,
  setTitleSelector,
  resetToNewRule,
  loadRule
});
</script>

<style scoped>
.inspector-dialog {
  position: fixed;
  width: 460px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.inspector-header {
  height: 36px;
  padding: 0 12px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: move;
  user-select: none;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
}

.inspector-content {
  display: flex;
  flex-direction: column;
}

.inspector-content-inner {
  display: flex;
  flex-direction: column;
}

.inspector-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  width: 68px;
  min-width: 68px;
  max-width: 68px;
  flex-shrink: 0;
  line-height: 32px;
  white-space: nowrap;
  display: inline-block;
  user-select: none;
}

.required-star {
  color: var(--color-error, #ef4444);
  margin-left: 2px;
  font-weight: bold;
  display: inline-block;
  white-space: nowrap;
}

.field-control {
  flex: 1 1 0%;
  min-width: 0;
  margin-left: 12px;
  display: flex;
  align-items: center;
}

.rule-switch-group,
.selector-group,
.title-element-group {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.title-selector-input {
  flex: 6 6 0%;
  min-width: 0;
}

.title-attr-select {
  flex: 4 4 0%;
  min-width: 0;
}

.action-btn-inline {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 0 12px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.offset-group {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.offset-item {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
  white-space: nowrap;
}

.unit {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
  white-space: nowrap;
}

.value-input {
  width: 100%;
  flex: 1 1 0%;
  min-width: 0;
  outline: none;
  color: var(--text-primary);
}

.mono-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.toggle-label input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--color-accent);
}

.toggle-text {
  font-size: 12px;
  color: var(--text-primary);
}

.inspector-footer {
  padding: 12px 16px;
  background: var(--bg-surface-hover);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
</style>
