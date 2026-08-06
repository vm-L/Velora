<template>
  <div v-if="modelValue" class="inspector-dialog" :style="{ top: position.y + 'px', left: position.x + 'px' }">
    <!-- Header -->
    <div class="inspector-header" @mousedown="startDrag">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="20" y1="20" x2="10" y2="10"></line>
          <line x1="13" y1="13" x2="10" y2="10" stroke-width="3"></line>
          <path d="M7 1l1.2 2.3L10.5 4.5L8.2 5.7L7 8l-1.2-2.3L3.5 4.5l2.3-1.2z" fill="currentColor" stroke="none"></path>
          <path d="M3 12v3M1.5 13.5h3" stroke-width="1.5"></path>
          <path d="M16 3v3M14.5 4.5h3" stroke-width="1.5"></path>
        </svg>
        解析规则
      </div>
      <div class="header-actions">
        <v-button variant="icon" class="action-btn close-btn" @click="close" title="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </v-button>
      </div>
    </div>

    <!-- Content -->
    <div class="inspector-content">
      <div class="inspector-content-inner">
        <div class="inspector-body">
          <!-- 行 1：匹配规则 -->
          <div class="info-row domain-info" style="align-items: center;">
            <span class="label">匹配规则</span>
            <VInputSelect
              v-model="currentRule.domain"
              placeholder="匹配域名，例如: *://*.bilibili.com/*"
              :options="historyDomainOptions"
              class="mono-input value-input flex-1"
              style="margin-left: 12px;"
              @change="onDomainOrActionChange"
            />
          </div>

          <!-- 行 2：行为类型 -->
          <div class="info-row" style="align-items: center;">
            <span class="label">行为类型</span>
            <VInputSelect
              v-model="currentRule.actionType"
              :options="actionTypeOptions"
              :allow-input="false"
              class="value-input flex-1"
              style="margin-left: 12px;"
              @change="onDomainOrActionChange"
            />
          </div>

          <!-- 解析项列表编辑区 -->
          <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: column; flex: 1; min-height: 220px;">
            <div class="label-row" style="margin-bottom: 8px;">
              <label>解析项编辑</label>
              <v-button variant="text" class="text-btn" @click="addItem">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 2px;">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                新增解析项
              </v-button>
            </div>

            <!-- 解析项可滚动列表 -->
            <div class="items-list-container">
              <div v-if="currentRule.items.length === 0" class="items-empty">
                暂未添加解析项，点击右上角“新增解析项”开始配置。
              </div>

              <div 
                v-for="(item, idx) in currentRule.items" 
                :key="item.id" 
                class="parse-item-row"
                :class="{ 'is-dragging': draggedIndex === idx }"
                @dragover.prevent
                @drop="onDrop(idx)"
              >
                <!-- 拖拽排序 Handle -->
                <div 
                  class="drag-handle" 
                  draggable="true"
                  @dragstart="onDragStart(idx)"
                  title="按住拖拽排序"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="5" r="1.2" fill="currentColor"></circle>
                    <circle cx="15" cy="5" r="1.2" fill="currentColor"></circle>
                    <circle cx="9" cy="12" r="1.2" fill="currentColor"></circle>
                    <circle cx="15" cy="12" r="1.2" fill="currentColor"></circle>
                    <circle cx="9" cy="19" r="1.2" fill="currentColor"></circle>
                    <circle cx="15" cy="19" r="1.2" fill="currentColor"></circle>
                  </svg>
                </div>

                <!-- Key 输入框 -->
                <div class="field-wrap key-wrap">
                  <v-input 
                    v-model="item.key" 
                    placeholder="Key" 
                    class="item-input"
                    :class="{ 'is-invalid': itemErrors[idx]?.key }"
                    @blur="validateKey(idx)"
                  />
                </div>

                <!-- Regex 输入框 -->
                <div class="field-wrap regex-wrap">
                  <v-input 
                    v-model="item.regex" 
                    placeholder="正则表达式" 
                    class="item-input mono-input"
                    :class="{ 'is-invalid': itemErrors[idx]?.regex }"
                    @blur="validateRegex(idx)"
                  />
                </div>

                <!-- 删除操作 Icon -->
                <v-button variant="icon" class="delete-icon-btn" @click="removeItem(idx)" title="删除解析项">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </v-button>
              </div>
            </div>
          </div>
        </div>

        <div class="inspector-footer">
          <v-button variant="secondary" class="btn" @click="close">取消</v-button>
          <v-button variant="primary" class="btn" @click="save">保存规则</v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import VInputSelect, { type InputSelectOption } from '../base/VInputSelect.vue';
import { useSettings, type ParseRule } from '../../composables/useSettings';
import { useMessage } from '../../composables/useMessage';

const props = defineProps<{
  modelValue: boolean;
  resourceId: string;
  currentUrl?: string;
  editingRule?: ParseRule | null;
}>();

const emit = defineEmits(['update:modelValue', 'save']);

const { state: settingsState, saveCustomParseRules } = useSettings();
const { showMessage } = useMessage();

const position = reactive({ x: 300, y: 100 });
let isDraggingModal = false;
let dragOffset = { x: 0, y: 0 };

const startDrag = (e: MouseEvent) => {
  isDraggingModal = true;
  dragOffset = { x: e.clientX - position.x, y: e.clientY - position.y };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDraggingModal) return;
  position.x = e.clientX - dragOffset.x;
  position.y = e.clientY - dragOffset.y;
};

const stopDrag = () => {
  isDraggingModal = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
};

const actionTypeOptions: InputSelectOption[] = [
  { label: '下载', value: 'download' },
  { label: '复制', value: 'copy' }
];

const currentRule = ref<ParseRule>({
  id: '',
  domain: '',
  actionType: 'download',
  items: []
});

const itemErrors = reactive<Record<number, { key?: boolean; regex?: boolean }>>({});
const draggedIndex = ref<number | null>(null);

const historyDomainOptions = computed<InputSelectOption[]>(() => {
  const rules = settingsState.customParseRules[props.resourceId] || [];
  const set = new Set<string>();
  rules.forEach(r => set.add(r.domain));
  if (props.currentUrl) {
    try {
      const u = new URL(props.currentUrl);
      set.add(`*://${u.hostname}/*`);
    } catch {}
  }
  return Array.from(set).map(d => ({ label: d, value: d }));
});

watch(() => props.modelValue, (val) => {
  if (val) {
    for (const key in itemErrors) delete itemErrors[key];

    if (props.editingRule) {
      currentRule.value = JSON.parse(JSON.stringify(props.editingRule));
    } else {
      let defaultDomain = '*';
      if (props.currentUrl) {
        try {
          const u = new URL(props.currentUrl);
          defaultDomain = `*://${u.hostname}/*`;
        } catch {}
      }
      currentRule.value = {
        id: Math.random().toString(36).substring(2, 9),
        domain: defaultDomain,
        actionType: 'download',
        items: []
      };
      loadExistingRule();
    }
  }
});

const loadExistingRule = () => {
  const rules = settingsState.customParseRules[props.resourceId] || [];
  const found = rules.find(r => r.domain === currentRule.value.domain && r.actionType === currentRule.value.actionType);
  if (found) {
    currentRule.value = JSON.parse(JSON.stringify(found));
  }
};

const onDomainOrActionChange = () => {
  loadExistingRule();
};

const addItem = () => {
  currentRule.value.items.push({
    id: Math.random().toString(36).substring(2, 9),
    key: '',
    regex: ''
  });
};

const removeItem = (idx: number) => {
  currentRule.value.items.splice(idx, 1);
  delete itemErrors[idx];
  validateAll();
};

const validateKey = (idx: number) => {
  const item = currentRule.value.items[idx];
  if (!item) return;
  const k = item.key.trim();

  if (!itemErrors[idx]) itemErrors[idx] = {};

  if (!k) {
    itemErrors[idx].key = true;
    return false;
  }

  // 检查重复 key
  const duplicate = currentRule.value.items.some((it, i) => i !== idx && it.key.trim() === k);
  if (duplicate) {
    itemErrors[idx].key = true;
    return false;
  }

  itemErrors[idx].key = false;
  return true;
};

const createRegExp = (rawPattern: string): RegExp => {
  const trimmed = rawPattern.trim();
  if (!trimmed) return new RegExp('');

  // 检查是否为 /pattern/flags 格式
  const match = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
  if (match) {
    return new RegExp(match[1], match[2]);
  }
  // 否则直接作为原生正则字符串 't.*t'
  return new RegExp(trimmed);
};

const validateRegex = (idx: number) => {
  const item = currentRule.value.items[idx];
  if (!item) return;
  const r = item.regex.trim();

  if (!itemErrors[idx]) itemErrors[idx] = {};

  if (!r) {
    itemErrors[idx].regex = true;
    return false;
  }

  try {
    createRegExp(r);
    itemErrors[idx].regex = false;
    return true;
  } catch {
    itemErrors[idx].regex = true;
    return false;
  }
};

const validateAll = () => {
  let valid = true;
  currentRule.value.items.forEach((_, idx) => {
    const kValid = validateKey(idx);
    const rValid = validateRegex(idx);
    if (!kValid || !rValid) valid = false;
  });
  return valid;
};

const onDragStart = (idx: number) => {
  draggedIndex.value = idx;
};

const onDrop = (targetIdx: number) => {
  if (draggedIndex.value === null || draggedIndex.value === targetIdx) return;
  const item = currentRule.value.items.splice(draggedIndex.value, 1)[0];
  currentRule.value.items.splice(targetIdx, 0, item);
  draggedIndex.value = null;
  validateAll();
};

const close = () => {
  emit('update:modelValue', false);
};

const save = async () => {
  if (!currentRule.value.domain.trim()) {
    showMessage({ text: '匹配规则不能为空', type: 'error' });
    return;
  }

  if (currentRule.value.items.length > 0 && !validateAll()) {
    showMessage({ text: '解析项存在重复Key或非法正则表达式，请检查后重试', type: 'error' });
    return;
  }

  const resourceRules = settingsState.customParseRules[props.resourceId] || [];
  const rulesCopy = JSON.parse(JSON.stringify(resourceRules)) as ParseRule[];

  // 以 匹配规则 + 行为类型 为唯一键更新或添加
  const existingIdx = rulesCopy.findIndex(
    r => r.domain === currentRule.value.domain && r.actionType === currentRule.value.actionType
  );

  if (existingIdx !== -1) {
    rulesCopy[existingIdx] = { ...currentRule.value };
  } else {
    rulesCopy.push({ ...currentRule.value });
  }

  const allParseRules = {
    ...settingsState.customParseRules,
    [props.resourceId]: rulesCopy
  };

  await saveCustomParseRules(allParseRules);
  showMessage({ text: '解析规则保存成功！', type: 'success' });
  emit('save', currentRule.value);
  close();
};
</script>

<style scoped lang="less">
.inspector-dialog {
  position: fixed;
  width: 500px;
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.inspector-header {
  height: 40px;
  padding: 0 16px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: move;
  user-select: none;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }
}

.inspector-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.inspector-content-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.inspector-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.info-row {
  display: flex;
  margin-bottom: 12px;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  width: 55px;
  flex-shrink: 0;
}

.value-input {
  outline: none;
  color: var(--text-primary);
}

.mono-input {
  font-family: ui-monospace, monospace;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-row label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.text-btn {
  background: transparent;
  border: none;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;

  &:hover {
    background: var(--bg-surface-active);
  }
}

.items-list-container {
  flex: 1;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-app);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.items-empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.parse-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 8px;
  transition: all 0.2s ease;

  &.is-dragging {
    opacity: 0.5;
    background: var(--bg-surface-hover);
  }
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: grab;
  padding: 2px;
  border-radius: 4px;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  &:active {
    cursor: grabbing;
  }
}

.field-wrap {
  flex: 1;

  &.key-wrap {
    flex: 0 0 110px;
  }
}

.item-input {
  width: 100%;

  :deep(input.v-input) {
    height: 30px;
    font-size: 12px;
    padding: 4px 8px;
  }

  :deep(input.v-input.is-invalid) {
    border-color: #ef4444 !important;
    background-color: rgba(239, 68, 68, 0.08) !important;
  }
}

.delete-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
}

.inspector-footer {
  padding: 12px 16px;
  background: var(--bg-surface-hover);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
