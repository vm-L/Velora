<template>
  <Teleport to="body">
    <transition name="dialog-fade">
      <div v-if="state.isVisible" class="dialog-overlay" @click.self="cancel">
        <div class="dialog-content">
          <div class="dialog-body">
            <div class="dialog-icon" :class="state.type">
              <VIcon
                :name="state.type === 'danger' ? 'warning' : (state.type === 'warning' ? 'warning' : 'info')"
                :size="20"
              />
            </div>
            <div class="dialog-text">
              <h3>{{ state.title }}</h3>
              <p>{{ state.message }}</p>
            </div>
          </div>
          <div v-if="state.checkboxLabel" class="dialog-checkbox-row">
            <VCheckbox v-model="state.isChecked">
              {{ state.checkboxLabel }}
            </VCheckbox>
          </div>
          <div class="dialog-actions">
            <v-button variant="secondary" class="btn-cancel" @click="cancel">{{ state.cancelText }}</v-button>
            <v-button :variant="state.type === 'danger' ? 'danger' : (state.type === 'warning' ? 'warning' : 'primary')" class="btn-confirm" @click="proceed">{{ state.confirmText }}</v-button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useConfirm } from '../../composables/useConfirm'
import VButton from '../base/VButton.vue'
import VIcon from '../base/VIcon.vue'
import VCheckbox from '../base/VCheckbox.vue'

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
  z-index: 2147483647;
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

.dialog-checkbox-row {
  margin-bottom: 16px;
  padding-left: 50px;
  display: flex;
  align-items: center;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Styled by custom VButton component */

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
