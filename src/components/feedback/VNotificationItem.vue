<template>
  <div class="notification-item" 
    :class="`type-${notification.type}`"
    @mouseenter="pauseTimer" 
    @mouseleave="resumeTimer"
    @click="onClick">
    
    <div class="notif-icon">
      <svg v-if="notification.type === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <svg v-else-if="notification.type === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      <svg v-else-if="notification.type === 'warning'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    </div>

    <div class="notif-content">
      <div class="notif-title">{{ notification.title }}</div>
      <div class="notif-message">{{ notification.message }}</div>
    </div>

    <button class="notif-close" @click.stop="onClose">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>

    <div v-if="notification.duration > 0" class="notif-progress-bg">
      <div class="notif-progress-fill" :style="{ transform: `scaleX(${progressRatio})` }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { NotificationItem } from '../../composables/useNotification'

const props = defineProps<{
  notification: NotificationItem
}>()

const emit = defineEmits(['close', 'click'])

const remaining = ref(props.notification.duration)
const progressRatio = ref(1)

let startTime = 0
let animationFrameId = 0
let isPaused = false

const updateProgress = (timestamp: number) => {
  if (isPaused || props.notification.duration <= 0) return

  if (!startTime) startTime = timestamp
  const elapsed = timestamp - startTime
  
  if (elapsed >= remaining.value) {
    emit('close')
    return
  }
  
  progressRatio.value = 1 - (elapsed / remaining.value)
  animationFrameId = requestAnimationFrame(updateProgress)
}

const startTimer = () => {
  if (props.notification.duration > 0) {
    startTime = 0
    isPaused = false
    animationFrameId = requestAnimationFrame(updateProgress)
  }
}

const pauseTimer = () => {
  if (props.notification.duration > 0) {
    isPaused = true
    cancelAnimationFrame(animationFrameId)
    remaining.value = remaining.value * progressRatio.value
  }
}

const resumeTimer = () => {
  if (props.notification.duration > 0) {
    startTimer()
  }
}

const onClose = () => {
  emit('close')
}

const onClick = () => {
  emit('click', props.notification)
}

onMounted(() => {
  startTimer()
})

onBeforeUnmount(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
})
</script>

<style scoped lang="less">
.notification-item {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-surface);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.05);
  pointer-events: auto;
  transition: transform 0.2s, box-shadow 0.2s;
}

.notification-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-soft);
}

.notif-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 2px;
}

.type-success .notif-icon { color: #10b981; }
.type-error .notif-icon { color: #ef4444; }
.type-warning .notif-icon { color: #f59e0b; }
.type-info .notif-icon { color: var(--color-accent); }

.notif-content {
  flex: 1;
  min-width: 0;
}

.notif-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.notif-message {
  font-size: 13px;
  color: var(--text-secondary);
  word-break: break-all;
  line-height: 1.4;
}

.notif-close {
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
  flex-shrink: 0;
  margin-top: -4px;
  margin-right: -4px;
}

.notif-close:hover {
  background: var(--border-light);
  color: var(--text-primary);
}

.notif-progress-bg {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(0,0,0,0.05);
}

.notif-progress-fill {
  height: 100%;
  transform-origin: left center;
  /* Will-change helps with smooth animation */
  will-change: transform;
}

.type-success .notif-progress-fill { background: #10b981; }
.type-error .notif-progress-fill { background: #ef4444; }
.type-warning .notif-progress-fill { background: #f59e0b; }
.type-info .notif-progress-fill { background: var(--color-accent); }
</style>
