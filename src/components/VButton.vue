<template>
  <button
    :type="type"
    :class="['v-btn', `v-btn-${variant}`, { 'active': active }]"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot name="icon"></slot>
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
defineProps({
  variant: {
    type: String,
    default: 'secondary', // 'primary' | 'secondary' | 'danger' | 'text' | 'icon'
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String as () => 'button' | 'submit' | 'reset',
    default: 'button',
  },
  active: {
    type: Boolean,
    default: false,
  }
});
defineEmits(['click']);
</script>

<style scoped>
.v-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  height: 32px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: inherit;
  outline: none;
  user-select: none;
  flex-shrink: 0;
  white-space: nowrap;
}

.v-btn:disabled,
.v-btn-primary:disabled,
.v-btn-secondary:disabled,
.v-btn-danger:disabled,
.v-btn-danger-soft:disabled,
.v-btn-warning:disabled,
.v-btn-text:disabled,
.v-btn-icon:disabled {
  background: var(--border-light);
  border-color: var(--border-light);
  color: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}

/* Primary Button */
.v-btn-primary {
  background: var(--bg-surface);
  color: var(--color-accent);
  border-color: var(--color-accent);
}
.v-btn-primary:hover:not(:disabled) {
  background: var(--bg-surface-hover);
  color: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

/* Secondary Button */
.v-btn-secondary {
  background: var(--border-light);
  color: var(--text-primary);
  border-color: var(--border-color);
}
.v-btn-secondary:hover:not(:disabled) {
  background: var(--border-color);
}

/* Danger (Solid Red) Button */
.v-btn-danger {
  background: var(--color-error);
  color: var(--bg-surface);
  border-color: var(--color-error);
}
.v-btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error) 85%, black);
  border-color: color-mix(in srgb, var(--color-error) 85%, black);
}

/* Danger Soft Button */
.v-btn-danger-soft {
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
  border-color: color-mix(in srgb, var(--color-error) 15%, transparent);
}
.v-btn-danger-soft:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error) 22%, transparent);
  border-color: color-mix(in srgb, var(--color-error) 35%, transparent);
}

/* Warning Button */
.v-btn-warning {
  background: #f59e0b;
  color: var(--bg-surface);
  border-color: #f59e0b;
}
.v-btn-warning:hover:not(:disabled) {
  background: #d97706;
  border-color: #d97706;
}

/* Text Button */
.v-btn-text {
  background: transparent;
  color: var(--text-secondary);
  padding: 4px 8px;
  height: auto;
}
.v-btn-text:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-surface-hover);
}

/* Icon Button */
.v-btn-icon {
  background: transparent;
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}
.v-btn-icon:hover:not(:disabled),
.v-btn-icon.active {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

/* Icon Secondary (Used in task action list) */
.v-btn-icon-secondary {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}
.v-btn-icon-secondary:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--color-accent);
}

/* Icon Danger (Used in task delete button) */
.v-btn-icon-danger {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
}
.v-btn-icon-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-error) 35%, transparent);
  color: var(--color-error);
}
</style>
