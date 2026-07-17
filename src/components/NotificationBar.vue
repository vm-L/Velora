<template>
  <div class="notification-container">
    <div class="notification-scroll-area">
      <div class="notif-list-wrapper">
        <TransitionGroup name="notif-list">
          <NotificationItem 
            v-for="notif in notifications" 
            :key="notif.id" 
            :notification="notif" 
            @close="removeNotification(notif.id)"
            @click="openDialog"
          />
        </TransitionGroup>
      </div>
    </div>

    <!-- Dismiss All Actions -->
    <Transition name="notif-list">
      <div v-if="notifications.length > 0 || isClearing" class="notification-actions">
        <button class="dismiss-all-btn" @click="clearAllNotifications" :disabled="isClearing">
          <svg v-if="!isClearing" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <span v-if="isClearing">清理中...</span>
          <span v-else>清除全部通知</span>
        </button>
      </div>
    </Transition>

    <!-- Detailed Notification Dialog -->
    <Teleport to="body">
      <div v-if="selectedNotification" class="notif-dialog-overlay" @click="closeDialog">
        <div class="notif-dialog-modal" @click.stop>
          <div class="dialog-header">
            <h3>{{ selectedNotification.title }}</h3>
            <button class="close-btn" @click="closeDialog">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="dialog-content">
            <p class="dialog-message">{{ selectedNotification.message }}</p>
            <div v-if="selectedNotification.detail" class="dialog-detail">
              <pre>{{ selectedNotification.detail }}</pre>
            </div>
          </div>
          
          <div class="dialog-footer">
            <button class="btn btn-secondary" @click="closeDialog">确定</button>
            <button 
              v-if="canGoToSource(selectedNotification)" 
              class="btn btn-primary" 
              @click="goToSource(selectedNotification)"
            >
              前往查看
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useNotification, type NotificationItem } from '../composables/useNotification'
import NotificationItemComponent from './NotificationItem.vue'

// Alias component to avoid naming conflicts
const NotificationItem = NotificationItemComponent

const { notifications, isClearing, removeNotification, clearAllNotifications } = useNotification()
const router = useRouter()
const route = useRoute()

const selectedNotification = ref<NotificationItem | null>(null)

const openDialog = (notif: NotificationItem) => {
  selectedNotification.value = notif
}

const closeDialog = () => {
  if (selectedNotification.value) {
    removeNotification(selectedNotification.value.id)
  }
  selectedNotification.value = null
}

const canGoToSource = (notif: NotificationItem) => {
  if (!notif.sourceRoute) return false
  // Return true if the user is NOT currently on the target route
  return route.path !== notif.sourceRoute
}

const goToSource = (notif: NotificationItem) => {
  if (notif.sourceRoute) {
    router.push(notif.sourceRoute)
  }
  closeDialog()
}
</script>

<style scoped lang="less">
.notification-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
  width: 360px;
}

.notification-scroll-area {
  width: 100%;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  overflow-x: hidden;
  pointer-events: auto;
  /* Visual guidance: subtle gradient mask to indicate scrollability */
  mask-image: linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
  padding: 20px 0;
  margin: -20px 0;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(148, 163, 184, 0.3);
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background-color: rgba(148, 163, 184, 0.6);
  }
}

.notif-list-wrapper {
  display: flex;
  flex-direction: column-reverse;
  gap: 12px;
  padding-right: 8px; /* space for scrollbar */
}

.notification-actions {
  margin-top: 4px;
  margin-right: 8px;
  pointer-events: auto;
}

.dismiss-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
  
  &:hover {
    background: var(--bg-surface-hover);
    color: #ef4444;
    border-color: #fca5a5;
    box-shadow: var(--shadow-sm);
  }
}

/* Transitions */
.notif-list-enter-active,
.notif-list-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.notif-list-enter-from {
  opacity: 0;
  transform: translateX(50px) scale(0.95);
}
.notif-list-leave-to {
  opacity: 0;
  transform: translateX(50px) scale(0.95);
}

/* Dialog Overlay */
.notif-dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10001;
  display: flex;
  justify-content: center;
  align-items: center;
}

.notif-dialog-modal {
  background: var(--bg-surface);
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modal-pop {
  0% { opacity: 0; transform: scale(0.95) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
  
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  
  &:hover {
    background: var(--border-light);
    color: var(--text-primary);
  }
}

.dialog-content {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.dialog-message {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.dialog-detail {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  
  pre {
    margin: 0;
    font-size: 12px;
    color: #ef4444;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
}

.dialog-footer {
  padding: 16px 20px;
  background: var(--bg-surface-hover);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  
  &:hover {
    background: var(--border-light);
    color: var(--text-primary);
  }
}

.btn-primary {
  background: var(--color-accent);
  color: var(--bg-surface);
  
  &:hover {
    background: var(--color-accent-hover);
  }
}
</style>
