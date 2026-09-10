<template>
  <div 
    class="message-container" 
    :class="{ 'is-expanded': isHovered }"
  >
    <TransitionGroup name="message-list">
      <div 
        v-for="(msg, index) in messages" 
        :key="msg.id" 
        class="message-item" 
        :class="[`message-${msg.type}`, { 'is-front': index === messages.length - 1 }]"
        :style="getStyle(index)"
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
          <span class="message-text">{{ msg.text }}</span>
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
          @click="removeMessage(msg.id)"
        >
          <VIcon name="close" :size="12" />
        </VButton>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useMessage } from '../../composables/useMessage'
import VIcon from '../base/VIcon.vue'
import VButton from '../base/VButton.vue'

const { messages, removeMessage, pauseTimer, resumeTimer } = useMessage()
const isHovered = ref(false)
let hoverLeaveTimer: any = null

watch(
  () => messages.value.length,
  (len) => {
    if (len === 0) {
      isHovered.value = false
      if (hoverLeaveTimer) {
        clearTimeout(hoverLeaveTimer)
        hoverLeaveTimer = null
      }
    }
  }
)

const handleMouseEnter = () => {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
  if (!isHovered.value) {
    isHovered.value = true
    pauseTimer()
  }
}

const handleMouseLeave = () => {
  if (hoverLeaveTimer) clearTimeout(hoverLeaveTimer)
  hoverLeaveTimer = setTimeout(() => {
    isHovered.value = false
    resumeTimer()
    hoverLeaveTimer = null
  }, 150)
}

onBeforeUnmount(() => {
  if (hoverLeaveTimer) {
    clearTimeout(hoverLeaveTimer)
    hoverLeaveTimer = null
  }
})

const getStyle = (index: number): any => {
  const total = messages.value.length
  // reverseIndex: 0 is the newest (visually in the front/top)
  const reverseIndex = total - 1 - index
  
  const isActive = reverseIndex < 3
  const yOffset = isActive ? reverseIndex * -12 : -12 * 3
  const scale = isActive ? 1 - reverseIndex * 0.04 : 1 - 3 * 0.04
  
  return {
    transform: `translate3d(0, ${yOffset}px, 0) scale(${scale})`,
    zIndex: 1000 - reverseIndex,
    opacity: isActive ? 1 - reverseIndex * 0.15 : 0,
    pointerEvents: reverseIndex === 0 ? 'auto' : 'none'
  }
}
</script>

<style scoped lang="less">
.message-container {
  position: fixed;
  top: 40px;
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
  min-width: 320px;
  max-width: 440px;
  height: 52px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  pointer-events: auto;
  font-size: 14px;
  font-weight: 500;
  transition: transform 0.4s cubic-bezier(0.2, 1, 0.2, 1), max-width 0.3s cubic-bezier(0.2, 1, 0.2, 1), opacity 0.3s ease, padding 0.2s ease;
  transform-origin: top center;
  overflow: hidden;

  .is-expanded & {
    height: auto;
    min-height: 52px;
    max-width: min(88vw, 780px);
    padding: 14px 16px;
    align-items: flex-start;
    overflow: visible;
  }
}

.message-content {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: hidden;

  .is-expanded & {
    align-items: flex-start;
    overflow: visible;
  }
}

.message-text {
  color: var(--text-primary);
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;

  .is-expanded & {
    white-space: normal;
    word-break: break-word;
    overflow: visible;
    text-overflow: clip;
  }
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

  .is-expanded & {
    margin-top: 2px;
  }
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

  .is-expanded & {
    margin-top: -2px;
  }

  &:hover {
    background: transparent !important;
    color: var(--text-primary) !important;
  }
}

/* Transitions */
.message-list-move,
.message-list-enter-active,
.message-list-leave-active {
  transition: all 0.35s cubic-bezier(0.2, 1, 0.2, 1);
}
.message-list-leave-active {
  position: absolute !important;
  pointer-events: none !important;
  z-index: 990 !important;
}
.message-list-enter-from {
  opacity: 0;
  transform: translate3d(0, -20px, 0) scale(0.9) !important;
}
.message-list-leave-to {
  opacity: 0 !important;
  transform: translate3d(0, -16px, 0) scale(0.96) !important;
}
</style>
