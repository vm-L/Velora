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
          <VIcon 
            :name="msg.type === 'loading' ? 'loading' : msg.type === 'success' ? 'success' : msg.type === 'error' ? 'error' : msg.type === 'warning' ? 'warning' : 'info'" 
            :size="16" 
            :class="{ 'spin-icon': msg.type === 'loading' }"
          />
        </div>
        <div style="display: flex; align-items: center; flex: 1;">
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
import { ref, computed } from 'vue'
import { useMessage } from '../../composables/useMessage'
import VIcon from '../base/VIcon.vue'
import VButton from '../base/VButton.vue'

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

  &:hover {
    background: transparent !important;
    color: var(--text-primary) !important;
  }
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
