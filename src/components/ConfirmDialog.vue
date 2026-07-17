<template>
  <transition name="dialog-fade">
    <div v-if="state.isVisible" class="dialog-overlay" @click.self="cancel">
      <div class="dialog-content">
        <div class="dialog-body">
          <div class="dialog-icon" :class="state.type">
            <svg v-if="state.type === 'danger'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <svg v-else-if="state.type === 'warning'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <div class="dialog-text">
            <h3>{{ state.title }}</h3>
            <p>{{ state.message }}</p>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancel">{{ state.cancelText }}</button>
          <button class="btn-confirm" :class="state.type" @click="proceed">{{ state.confirmText }}</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useConfirm } from '../composables/useConfirm'

const { state, proceed, cancel } = useConfirm()
</script>

<style scoped lang="less">
.dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.dialog-content {
  background: var(--bg-surface);
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px;
}

.dialog-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
}

.dialog-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.dialog-icon.danger { background: #fee2e2; color: #ef4444; }
.dialog-icon.warning { background: #fef3c7; color: #f59e0b; }
.dialog-icon.info { background: var(--bg-surface-active); color: var(--color-accent); }
.dialog-icon svg {
  display: block;
  width: 20px;
  height: 20px;
}

.dialog-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dialog-text h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 20px;
}
.dialog-text p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-cancel {
  background: var(--border-light);
  color: var(--text-primary);
}
.btn-cancel:hover { background: var(--border-color); color: var(--text-primary); }

.btn-confirm.danger { background: #ef4444; color: var(--bg-surface); }
.btn-confirm.danger:hover { background: #dc2626; }

.btn-confirm.warning { background: #f59e0b; color: var(--bg-surface); }
.btn-confirm.warning:hover { background: #d97706; }

.btn-confirm.info { background: var(--color-accent); color: var(--bg-surface); }
.btn-confirm.info:hover { background: var(--color-accent-hover); }

/* Transitions */
.dialog-fade-enter-active, .dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-fade-enter-active .dialog-content, .dialog-fade-leave-active .dialog-content {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.dialog-fade-enter-from, .dialog-fade-leave-to {
  opacity: 0;
}
.dialog-fade-enter-from .dialog-content {
  transform: scale(0.95) translateY(10px);
}
.dialog-fade-leave-to .dialog-content {
  transform: scale(0.95);
}
</style>
