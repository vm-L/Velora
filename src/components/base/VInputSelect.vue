<template>
  <div class="v-input-select" ref="containerRef" @mousedown.stop @click.stop>
    <div class="input-wrapper" ref="wrapperRef" :class="{ readonly: !allowInput }" @click="onWrapperClick">
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
        <VIcon name="chevron-down" :size="14" :class="{ open: isOpen }" />
      </button>
    </div>

    <!-- Floating Dropdown Popover (Teleported to body to avoid overflow clipping) -->
    <Teleport to="body">
      <div v-if="isOpen" class="select-popover-teleported" ref="popoverRef" :style="popoverStyle" @mousedown.stop @click.stop>
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
              <VIcon v-if="item.depth === 0" name="home" :size="14" />
              <!-- Folder Icon -->
              <VIcon v-else name="folder" :size="14" />
            </span>
            <span class="item-label">{{ item.label }}</span>
          </div>
        </template>
        <div v-else class="select-empty">
          暂无选项记录
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';

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
  (e: 'select', val: string, item: InputSelectOption): void;
  (e: 'enter', evt: KeyboardEvent): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const popoverStyle = ref<Record<string, string>>({});

const displayValue = computed(() => {
  if (props.allowInput) {
    return props.modelValue;
  }
  const matched = props.options?.find(opt => opt.value === props.modelValue);
  return matched ? matched.label : props.modelValue;
});

const updatePopoverPosition = () => {
  if (!wrapperRef.value || !isOpen.value) return;
  const rect = wrapperRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  const desiredMaxHeight = 220;
  let openUpward = false;

  if (spaceBelow < 160 && spaceAbove > spaceBelow) {
    openUpward = true;
  }

  const maxH = openUpward
    ? Math.min(desiredMaxHeight, spaceAbove - 16)
    : Math.min(desiredMaxHeight, spaceBelow - 16);

  if (openUpward) {
    popoverStyle.value = {
      position: 'fixed',
      bottom: `${window.innerHeight - rect.top + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.max(80, maxH)}px`,
      top: 'auto',
      zIndex: '2147483647'
    };
  } else {
    popoverStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.max(80, maxH)}px`,
      bottom: 'auto',
      zIndex: '2147483647'
    };
  }
};

const toggleOpen = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    nextTick(() => updatePopoverPosition());
  }
};

watch(isOpen, (newVal) => {
  if (newVal) {
    nextTick(() => updatePopoverPosition());
  }
});

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
  emit('select', item.value, item);
  isOpen.value = false;
};

const handleDocumentClick = (e: MouseEvent) => {
  const target = e.target as Node;
  if (
    containerRef.value && !containerRef.value.contains(target) &&
    popoverRef.value && !popoverRef.value.contains(target)
  ) {
    isOpen.value = false;
  }
};

const handleScrollOrResize = () => {
  if (isOpen.value) {
    updatePopoverPosition();
  }
};

onMounted(() => {
  window.addEventListener('click', handleDocumentClick);
  window.addEventListener('resize', handleScrollOrResize);
  window.addEventListener('scroll', handleScrollOrResize, true);
});

onUnmounted(() => {
  window.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('resize', handleScrollOrResize);
  window.removeEventListener('scroll', handleScrollOrResize, true);
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

.select-popover-teleported {
  position: fixed;
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
  z-index: 2147483647;
  padding: 4px 0;
  box-sizing: border-box;
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
