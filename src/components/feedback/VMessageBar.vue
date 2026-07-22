<template>
  <div class="message-container" :class="{ 'is-expanded': isHovered }" :style="containerStyle" @mouseenter="isHovered = true" @mouseleave="isHovered = false">
    <TransitionGroup name="message-list">
      <div 
        v-for="(msg, index) in messages" 
        :key="msg.id" 
        class="message-item" 
        :class="`message-${msg.type}`"
        :style="getStyle(index)"
      >
        <div class="message-icon">
          <svg v-if="msg.type === 'success'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <svg v-else-if="msg.type === 'error'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <svg v-else-if="msg.type === 'warning'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <div style="display: flex; align-items: center; flex: 1;">
          <span class="message-text">{{ msg.text }}</span>
          <button v-if="msg.action" class="message-action-btn" @click.stop="msg.action.callback(); removeMessage(msg.id)">
            {{ msg.action.text }}
          </button>
        </div>
        <button class="message-close" @click="removeMessage(msg.id)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from '../../composables/useMessage'

const { messages, removeMessage } = useMessage()
const isHovered = ref(false)

const containerStyle = computed(() => {
  if (!isHovered.value) return { transform: 'translate(-50%, 0)' };
  const count = messages.value.length;
  if (count <= 1) return { transform: 'translate(-50%, 0)' };
  const shiftDown = (count - 1) * 60;
  return {
    transform: `translate(-50%, ${shiftDown}px)`
  };
});

const getStyle = (index: number): any => {
  const total = messages.value.length;
  // reverseIndex: 0 is the newest (visually in the front)
  const reverseIndex = total - 1 - index;
  
  if (isHovered.value) {
    // Spread out mode
    return {
      transform: `translate3d(0, ${reverseIndex * -60}px, 0) scale(1)`,
      zIndex: 1000 - reverseIndex,
      opacity: 1, // Show all when hovered
      pointerEvents: 'auto'
    }
  } else {
    // Stacked mode
    const isActive = reverseIndex < 3; // Show top 3
    const yOffset = isActive ? reverseIndex * -14 : -14 * 3;
    const scale = isActive ? 1 - reverseIndex * 0.05 : 1 - 3 * 0.05;
    
    return {
      transform: `translate3d(0, ${yOffset}px, 0) scale(${scale})`,
      zIndex: 1000 - reverseIndex,
      opacity: isActive ? 1 - reverseIndex * 0.15 : 0,
      pointerEvents: reverseIndex === 0 ? 'auto' : 'none'
    }
  }
}
</script>

<style scoped lang="less">
.message-container {
  position: fixed;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  pointer-events: none;
  width: 380px;
  height: 52px; /* Base height for hover catching */
  transition: transform 0.4s cubic-bezier(0.2, 1, 0.2, 1);
  
  &.is-expanded {
    /* Optional: When expanded, make container capture events in gaps */
  }
  
  /* Catch hover seamlessly when expanding upwards */
  &::before {
    content: '';
    position: absolute;
    top: -400px; left: 0; right: 0; bottom: 10px;
    pointer-events: none;
  }
  &.is-expanded::before {
    pointer-events: auto;
  }
}

.message-item {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
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
  transition: all 0.4s cubic-bezier(0.2, 1, 0.2, 1);
  transform-origin: bottom center;
}

.message-text {
  color: var(--text-primary);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  flex: 1;
}

.message-action-btn {
  margin-left: 12px;
  background: rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.1);
  color: var(--text-primary);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.message-action-btn:hover {
  background: rgba(0,0,0,0.1);
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-info .message-icon { color: var(--color-accent); }
.message-success .message-icon { color: #10b981; }
.message-warning .message-icon { color: #f59e0b; }
.message-error .message-icon { color: #ef4444; }

.message-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  margin-left: 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.message-close:hover {
  background: var(--border-light);
  color: var(--text-primary);
}

/* Transitions */
.message-list-enter-active,
.message-list-leave-active {
  transition: all 0.4s cubic-bezier(0.2, 1, 0.2, 1);
}
.message-list-enter-from {
  opacity: 0;
  transform: translate3d(0, -20px, 0) scale(0.9) !important;
}
.message-list-leave-to {
  opacity: 0;
  transform: translate3d(0, -10px, 0) scale(0.95) !important;
}
</style>
