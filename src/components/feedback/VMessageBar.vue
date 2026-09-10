<template>
  <div class="message-container">
    <TransitionGroup name="message-list">
      <div 
        v-for="msg in messages" 
        :key="msg.id" 
        class="message-item" 
        :class="`message-${msg.type}`"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <div class="message-icon">
          <VIcon 
            :name="msg.type === 'loading' ? 'loading' : msg.type === 'success' ? 'success' : msg.type === 'error' ? 'error' : msg.type === 'warning' ? 'warning' : 'info'" 
            :size="16" 
            :class="{ 'spin-icon': msg.type === 'loading' }"
          />
        </div>
        <div class="message-content">
          <span class="message-text" :title="msg.text">{{ msg.text }}</span>
          <VButton
            v-if="msg.action"
            variant="text"
            class="message-action-btn"
            @click.stop="msg.action.callback(); removeMessage(msg.id)"
          >
            {{ msg.action.text }}
          </VButton>
        </div>
        <VButton
          variant="icon"
          class="message-close-btn"
          @click.stop="removeMessage(msg.id)"
          title="关闭"
        >
          <VIcon name="close" :size="12" />
        </VButton>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useMessage } from '../../composables/useMessage'
import VIcon from '../base/VIcon.vue'
import VButton from '../base/VButton.vue'

const { messages, removeMessage, pauseTimer, resumeTimer } = useMessage()
const isHovered = ref(false)
let hoverLeaveTimer: any = null

const handleMouseEnter = () => {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  isHovered.value = true
  pauseTimer()
}

const handleMouseLeave = () => {
  if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer)
  hoverLeaveTimer = setTimeout(() => {
    isHovered.value = false
    resumeTimer()
    hoverLeaveTimer = null
  }, 100)
}

onBeforeUnmount(() => {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
})
</script>

<style scoped lang="less">
.message-container {
  position: fixed;
  top: 36px;
  left: 0;
  right: 0;
  z-index: 10000;
  pointer-events: none;
  height: 0;
  display: flex;
  justify-content: center;
}

.message-item {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  margin-left: auto;
  margin-right: auto;
  width: max-content;
  min-width: 280px;
  max-width: min(85vw, 620px);
  min-height: 48px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  box-shadow: var(--shadow-soft), 0 8px 24px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  transform-origin: top center;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  user-select: none;
}

.message-content {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.message-text {
  color: var(--text-primary);
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.message-action-btn {
  margin-left: 10px;
  background: transparent !important;
  border: none !important;
  color: var(--color-accent) !important;
  font-size: 13px;
  font-weight: 600;
  padding: 2px 6px;
  height: auto;
  cursor: pointer;
  transition: opacity 0.2s ease;
  white-space: nowrap;
  box-shadow: none !important;

  &:hover {
    background: transparent !important;
    opacity: 0.8;
  }
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-info .message-icon { color: var(--color-accent); }
.message-loading .message-icon { color: var(--color-accent); }
.message-success .message-icon { color: #10b981; }
.message-warning .message-icon { color: #f59e0b; }
.message-error .message-icon { color: #ef4444; }

.spin-icon {
  animation: message-spin 1s linear infinite;
}

@keyframes message-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.message-close-btn {
  background: transparent !important;
  border: none !important;
  color: var(--text-tertiary) !important;
  cursor: pointer;
  padding: 4px;
  margin-left: 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  min-width: unset;
  transition: color 0.2s ease, opacity 0.2s ease;
  box-shadow: none !important;
  flex-shrink: 0;

  &:hover {
    background: transparent !important;
    color: var(--text-primary) !important;
  }
}

/* Transitions */
.message-list-move,
.message-list-enter-active,
.message-list-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.message-list-leave-active {
  position: absolute !important;
  pointer-events: none !important;
  z-index: 990 !important;
}
.message-list-enter-from {
  opacity: 0;
  transform: translate3d(0, -16px, 0) scale(0.95) !important;
}
.message-list-leave-to {
  opacity: 0 !important;
  transform: translate3d(0, -12px, 0) scale(0.96) !important;
}
</style>
