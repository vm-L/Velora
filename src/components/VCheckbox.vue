<template>
  <label class="v-checkbox-wrapper" :class="{ 'disabled': disabled }">
    <input
      type="checkbox"
      :checked="isChecked"
      :disabled="disabled"
      class="v-checkbox-input"
      @change="onChange"
    />
    <span v-if="$slots.default" class="v-checkbox-label">
      <slot></slot>
    </span>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: [Boolean, Array],
    default: false,
  },
  checked: {
    type: Boolean,
    default: undefined,
  },
  value: {
    type: [String, Number, Boolean],
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'change']);

const isChecked = computed(() => {
  if (props.checked !== undefined) {
    return props.checked;
  }
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.includes(props.value);
  }
  return props.modelValue === true;
});

const onChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const val = target.checked;
  
  if (Array.isArray(props.modelValue)) {
    const newValue = [...props.modelValue];
    if (val) {
      if (!newValue.includes(props.value)) {
        newValue.push(props.value);
      }
    } else {
      const idx = newValue.indexOf(props.value);
      if (idx > -1) {
        newValue.splice(idx, 1);
      }
    }
    emit('update:modelValue', newValue);
    emit('change', newValue);
  } else {
    emit('update:modelValue', val);
    emit('change', val);
  }
};
</script>

<style scoped>
.v-checkbox-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--text-primary);
}

.v-checkbox-wrapper.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.v-checkbox-input {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  outline: none;
  background: var(--bg-surface);
  cursor: pointer;
  position: relative;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  flex-shrink: 0;
}

.v-checkbox-input:hover:not(:disabled) {
  border-color: var(--text-secondary);
  background: var(--bg-surface-hover);
}

.v-checkbox-input:checked {
  background: var(--bg-surface-hover);
  border-color: var(--color-accent);
}

/* The checkmark icon inside the checkbox */
.v-checkbox-input:checked::after {
  content: "";
  width: 4px;
  height: 8px;
  border: solid var(--color-accent);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translate(-0.5px, -1px);
  display: block;
}

.v-checkbox-input:disabled {
  cursor: not-allowed;
  background: var(--bg-surface-hover);
  border-color: var(--border-color);
}

.v-checkbox-label {
  line-height: 1;
}
</style>
