import { ref } from 'vue'

export type MessageType = 'info' | 'success' | 'warning' | 'error' | 'loading'

export interface MessageAction {
  text: string
  callback: () => void
}

export interface MessageData {
  id: string
  text: string
  type: MessageType
  duration: number
  remainingDuration: number
  startTime: number
  action?: MessageAction
  timer?: any
  isPaused?: boolean
}

export interface MessageOptions {
  id?: string
  text: string
  type?: MessageType
  duration?: number
  action?: MessageAction
}

const messages = ref<MessageData[]>([])

// 确保页面可见性变化监听只绑定一次
let visibilityListenerRegistered = false

export const useMessage = () => {
  const clearAllMessages = () => {
    messages.value.forEach(msg => {
      if (msg.timer) {
        clearTimeout(msg.timer)
        msg.timer = null
      }
    })
    messages.value = []
  }

  // 绑定可见性监听：当窗口不可见时立即清除所有 message 实例，禁止后台累积
  if (typeof document !== 'undefined' && !visibilityListenerRegistered) {
    visibilityListenerRegistered = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || document.visibilityState !== 'visible') {
        clearAllMessages()
      }
    })
    window.addEventListener('pagehide', () => {
      clearAllMessages()
    })
  }

  const removeMessage = (id: string) => {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx !== -1) {
      if (messages.value[idx].timer) {
        clearTimeout(messages.value[idx].timer)
        messages.value[idx].timer = null
      }
      messages.value.splice(idx, 1)
    }
  }

  const pauseTimer = (id?: string) => {
    messages.value.forEach(msg => {
      if (!id || msg.id === id) {
        if (msg.timer && !msg.isPaused) {
          clearTimeout(msg.timer)
          msg.timer = null
          const elapsed = Date.now() - msg.startTime
          msg.remainingDuration = Math.max(0, msg.remainingDuration - elapsed)
        }
        msg.isPaused = true
      }
    })
  }

  const resumeTimer = (id?: string) => {
    messages.value.forEach(msg => {
      if (!id || msg.id === id) {
        msg.isPaused = false
        if (msg.duration > 0 && !msg.timer) {
          const delay = Math.max(800, msg.remainingDuration > 0 ? msg.remainingDuration : msg.duration)
          msg.startTime = Date.now()
          msg.timer = setTimeout(() => {
            removeMessage(msg.id)
          }, delay)
        }
      }
    })
  }

  const showMessage = (
    textOrOptions: string | MessageOptions,
    type: MessageType = 'info',
    duration = 2000,
    action?: MessageAction,
    id?: string
  ): string => {
    // message 实例仅在程序在前台且窗口可见时才创建
    if (typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible')) {
      return ''
    }

    let msgText = ''
    let msgType: MessageType = 'info'
    let msgDuration = 2000
    let msgAction: MessageAction | undefined = undefined
    let msgId = id

    if (typeof textOrOptions === 'object') {
      msgText = textOrOptions.text
      msgType = textOrOptions.type || 'info'
      msgDuration = textOrOptions.duration !== undefined ? textOrOptions.duration : 2000
      msgAction = textOrOptions.action
      msgId = textOrOptions.id || id
    } else {
      msgText = textOrOptions
      msgType = type
      msgDuration = duration
      msgAction = action
    }

    const finalId = msgId || Math.random().toString(36).substring(2, 11)

    // 1. 若指定了相同 ID 且该消息当前存在，直接原位更新（如 loading -> success/error 顺滑流转）
    const existingIndex = messages.value.findIndex(m => m.id === finalId)
    if (existingIndex !== -1) {
      const existing = messages.value[existingIndex]
      if (existing.timer) {
        clearTimeout(existing.timer)
        existing.timer = null
      }
      existing.text = msgText
      existing.type = msgType
      existing.duration = msgDuration
      existing.remainingDuration = msgDuration
      existing.startTime = Date.now()
      existing.action = msgAction
      existing.isPaused = false
      if (msgDuration > 0) {
        existing.timer = setTimeout(() => {
          removeMessage(finalId)
        }, msgDuration)
      }
      return finalId
    }

    // 2. 若为新消息，立即清理并淘汰所有旧消息定时器，杜绝后进先出栈式倒挂与旧消息“死而复生”
    messages.value.forEach(m => {
      if (m.timer) {
        clearTimeout(m.timer)
        m.timer = null
      }
    })

    let timer: any = null
    if (msgDuration > 0) {
      timer = setTimeout(() => {
        removeMessage(finalId)
      }, msgDuration)
    }

    const newMsgObj: MessageData = {
      id: finalId,
      text: msgText,
      type: msgType,
      duration: msgDuration,
      remainingDuration: msgDuration,
      startTime: Date.now(),
      action: msgAction,
      timer,
      isPaused: false
    }

    // 单实例精准展示：确保当前仅展示最新有效反馈，绝不堆叠冲突
    messages.value = [newMsgObj]

    return finalId
  }

  return {
    messages,
    showMessage,
    removeMessage,
    clearAllMessages,
    pauseTimer,
    resumeTimer
  }
}
