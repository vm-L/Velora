<template>
  <div class="v-switch-control" :class="{ 'disabled': disabled }">
    <label
      v-for="(opt, idx) in normalizedOptions"
      :key="idx"
      class="v-switch-item"
      :class="{ 'is-active': modelValue === opt.value }"
      @click="selectOption(opt.value)"
    >
      <input
        type="radio"
        :name="uniqueName"
        :value="opt.value"
        :checked="modelValue === opt.value"
        :disabled="disabled"
        class="v-switch-radio"
      />
      <span>{{ opt.label }}</span>
    </label>
    <div
      class="v-switch-pill"
      :style="pillStyle"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface VSwitchOption {
  label: string;
  value: any;
}

const props = withDefaults(
  defineProps<{
    modelValue: any;
    options?: VSwitchOption[];
    disabled?: boolean;
    name?: string;
  }>(),
  {
    disabled: false,
    options: () => [
      { label: '关闭', value: false },
      { label: '开启', value: true }
    ]
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'change', value: any): void;
}>();

const uniqueName = computed(() => props.name || `v-switch-${Math.random().toString(36).slice(2, 9)}`);

const normalizedOptions = computed(() => {
  if (props.options && props.options.length > 0) {
    return props.options;
  }
  return [
    { label: '关闭', value: false },
    { label: '开启', value: true }
  ];
});

const activeIndex = computed(() => {
  const idx = normalizedOptions.value.findIndex(opt => opt.value === props.modelValue);
  return idx >= 0 ? idx : 0;
});

const pillStyle = computed(() => {
  const count = normalizedOptions.value.length;
  if (count === 0) return {};
  return {
    width: `calc((100% - 8px) / ${count})`,
    transform: `translateX(${activeIndex.value * 100}%)`,
    left: `4px`
  };
});

const selectOption = (val: any) => {
  if (props.disabled || props.modelValue === val) return;
  emit('update:modelValue', val);
  emit('change', val);
};
</script>

<style scoped>
.v-switch-control {
  display: inline-flex;
  background: var(--border-light);
  padding: 4px;
  border-radius: 8px;
  position: relative;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
  user-select: none;
  align-items: center;
}

.v-switch-control.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.v-switch-item {
  position: relative;
  z-index: 2;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;
  min-width: 90px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.v-switch-radio {
  display: none;
}

.v-switch-item.is-active span {
  color: var(--text-primary);
}

.v-switch-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  background: var(--bg-surface);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
