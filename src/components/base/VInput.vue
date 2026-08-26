<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    class="v-input"
    @input="onInput"
    @change="onChange"
    @blur="onBlur"
    @keyup.enter="$emit('enter', $event)"
  />
</template>

<script setup lang="ts">
defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'input', 'change', 'blur', 'enter']);

const onInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', target.value);
  emit('input', target.value);
};

const onChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  emit('change', target.value);
};

const onBlur = (e: FocusEvent) => {
  const target = e.target as HTMLInputElement;
  emit('blur', target.value, e);
};
</script>

<style scoped>
.v-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  background: var(--bg-app);
  color: var(--text-primary);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  width: 100%;
}

.v-input:focus {
  border-color: var(--text-secondary);
}

.v-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-surface-hover);
}
</style>
