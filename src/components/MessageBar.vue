<template>
  <div class="message-container">
    <TransitionGroup name="message-list">
      <div v-for="msg in messages" :key="msg.id" class="message-item" :class="`message-${msg.type}`">
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
        <span class="message-text">{{ msg.text }}</span>
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
import { useMessage } from '../composables/useMessage'
const { messages, removeMessage } = useMessage()
</script>

<style scoped lang="less">
.message-container {
  position: fixed;
  top: 50px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.message-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0,0,0,0.05);
  pointer-events: auto;
  font-size: 13px;
  font-weight: 500;
}

.message-text {
  color: #334155;
}

.message-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-info .message-icon { color: #3b82f6; }
.message-success .message-icon { color: #10b981; }
.message-warning .message-icon { color: #f59e0b; }
.message-error .message-icon { color: #ef4444; }

.message-close {
  background: transparent;
  border: none;
  color: #94a3b8;
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
  background: #f1f5f9;
  color: #334155;
}

/* Transitions */
.message-list-enter-active,
.message-list-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.message-list-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}
.message-list-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
</style>
