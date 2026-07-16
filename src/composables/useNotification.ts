import { ref } from 'vue'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface NotificationAction {
  label: string
  handler: () => void
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  duration: number
  detail?: string // Detailed error log or extra info
  sourceRoute?: string // The route where this notification originated
  createdAt: number
}

const notifications = ref<NotificationItem[]>([])
let notificationCounter = 0
const isClearing = ref(false)

export const useNotification = () => {
  const showNotification = (
    options: Omit<NotificationItem, 'id' | 'createdAt' | 'duration'> & { duration?: number }
  ) => {
    const id = `notif_${Date.now()}_${notificationCounter++}`
    
    // Default durations based on type
    let duration = options.duration
    if (duration === undefined) {
      if (options.type === 'error' || options.type === 'warning') {
        duration = 0 // Infinite
      } else {
        duration = 2000 // 2 seconds for success/info
      }
    }

    const notification: NotificationItem = {
      id,
      createdAt: Date.now(),
      ...options,
      duration
    }
    
    notifications.value.push(notification)
    return id
  }

  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  const clearAllNotifications = () => {
    if (isClearing.value) return
    isClearing.value = true
    
    const clearNext = () => {
      if (notifications.value.length > 0) {
        notifications.value.pop()
        setTimeout(clearNext, 60)
      } else {
        isClearing.value = false
      }
    }
    clearNext()
  }

  return {
    notifications,
    isClearing,
    showNotification,
    removeNotification,
    clearAllNotifications
  }
}
