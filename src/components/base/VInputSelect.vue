<template>
  <div class="v-input-select" ref="containerRef" @mousedown.stop @click.stop>
    <div class="input-wrapper" :class="{ readonly: !allowInput }" @click="onWrapperClick">
      <VInput
        :model-value="displayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="!allowInput"
        class="select-input"
        @update:model-value="onInputChange"
        @keyup.enter="$emit('enter', $event)"
      />
      <button
        type="button"
        class="dropdown-toggle-btn"
        :title="isOpen ? '收起选项' : '展开选项'"
        :disabled="disabled"
        @click.stop="toggleOpen"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ open: isOpen }">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>

    <!-- Floating Dropdown Popover -->
    <div v-if="isOpen" class="select-popover">
      <template v-if="options && options.length > 0">
        <div
          v-for="item in options"
          :key="item.value"
          class="select-item"
          :class="{ active: modelValue === item.value }"
          :style="{ paddingLeft: (12 + (item.depth || 0) * 14) + 'px' }"
          @click="selectOption(item)"
        >
          <span class="item-icon" v-if="item.depth !== undefined">
            <!-- Root / Home Icon -->
            <svg v-if="item.depth === 0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <!-- Folder Icon -->
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span class="item-label">{{ item.label }}</span>
        </div>
      </template>
      <div v-else class="select-empty">
        暂无选项记录
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import VInput from './VInput.vue';

export interface InputSelectOption {
  label: string;
  value: string;
  depth?: number;
  [key: string]: any;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    options?: InputSelectOption[];
    disabled?: boolean;
    allowInput?: boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    options: () => [],
    disabled: false,
    allowInput: true,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'change', val: string): void;
  (e: 'enter', evt: KeyboardEvent): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);

const displayValue = computed(() => {
  if (props.allowInput) {
    return props.modelValue;
  }
  const matched = props.options?.find(opt => opt.value === props.modelValue);
  return matched ? matched.label : props.modelValue;
});

const toggleOpen = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
};

const onWrapperClick = () => {
  if (!props.allowInput && !props.disabled) {
    toggleOpen();
  }
};

const onInputChange = (val: string) => {
  if (!props.allowInput) return;
  emit('update:modelValue', val);
  emit('change', val);
};

const selectOption = (item: InputSelectOption) => {
  emit('update:modelValue', item.value);
  emit('change', item.value);
  isOpen.value = false;
};

const handleDocumentClick = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  window.addEventListener('click', handleDocumentClick);
});

onUnmounted(() => {
  window.removeEventListener('click', handleDocumentClick);
});
</script>

<style scoped lang="less">
.v-input-select {
  position: relative;
  width: 100%;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
}

.input-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;

  :deep(.v-input) {
    width: 100%;
    padding-right: 32px;
  }

  &.readonly {
    cursor: pointer;

    :deep(.v-input) {
      cursor: pointer;
      user-select: none;
    }
  }
}

.dropdown-toggle-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 2;

  &:hover:not(:disabled) {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    transition: transform 0.2s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.select-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  z-index: 9999;
  padding: 4px 0;
}

.select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
  padding-right: 12px;

  &:hover {
    background: var(--bg-surface-hover);
  }

  &.active {
    background: var(--bg-surface-active);
    color: var(--color-accent);
    font-weight: 500;
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  &.active .item-icon {
    color: var(--color-accent);
  }

  .item-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.select-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  user-select: none;
}
</style>
