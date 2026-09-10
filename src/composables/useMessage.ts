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

const MAX_MESSAGES = 3
const messages = ref<MessageData[]>([])

// 确保页面可见性变化监听只绑定一次
let visibilityListenerRegistered = false

export const useMessage = () => {
  const updateTopTimer = () => {
    // 清理所有非栈顶消息的定时器，确保仅最顶层可见消息在计时
    for (let i = 0; i < messages.value.length - 1; i++) {
      const msg = messages.value[i]
      if (msg.timer) {
        clearTimeout(msg.timer)
        msg.timer = null
      }
    }

    if (messages.value.length === 0) return

    // 栈顶消息（数组末尾，视觉最顶层）
    const topMsg = messages.value[messages.value.length - 1]

    // 若页面处于后台隐藏状态，或处于暂停状态，不启动计时器
    if (typeof document !== 'undefined' && document.hidden) {
      topMsg.isPaused = true
      return
    }

    if (topMsg.isPaused) return

    if (topMsg.duration > 0 && !topMsg.timer) {
      topMsg.startTime = Date.now()
      const delay = Math.max(300, topMsg.remainingDuration || topMsg.duration)
      topMsg.timer = setTimeout(() => {
        removeMessage(topMsg.id)
      }, delay)
    }
  }

  const clearAllMessages = () => {
    messages.value.forEach(msg => {
      if (msg.timer) {
        clearTimeout(msg.timer)
        msg.timer = null
      }
    })
    messages.value = []
  }

  // 绑定可见性监听：当窗口不可见时立即清除所有 message 实例
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
      // 移除当前消息后，为新晋升到栈顶的消息开启倒计时
      updateTopTimer()
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
        if (msg.remainingDuration <= 0) {
          msg.remainingDuration = msg.duration > 0 ? msg.duration : 1500
        }
      }
    })
    updateTopTimer()
  }

  const showMessage = (
    textOrOptions: string | MessageOptions,
    type: MessageType = 'info',
    duration = 1500,
    action?: MessageAction,
    id?: string
  ): string => {
    // message 实例仅在程序在前台且窗口可见时才创建
    if (typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible')) {
      return ''
    }

    let msgText = ''
    let msgType: MessageType = 'info'
    let msgDuration = 1500
    let msgAction: MessageAction | undefined = undefined
    let msgId = id

    if (typeof textOrOptions === 'object') {
      msgText = textOrOptions.text
      msgType = textOrOptions.type || 'info'
      msgDuration = textOrOptions.duration !== undefined ? textOrOptions.duration : 1500
      msgAction = textOrOptions.action
      msgId = textOrOptions.id || id
    } else {
      msgText = textOrOptions
      msgType = type
      msgDuration = duration
      msgAction = action
    }

    const finalId = msgId || Math.random().toString(36).substring(2, 11)

    // 若已存在同名 ID 消息，直接原位更新
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
      updateTopTimer()
      return finalId
    }

    // 控制消息队列上限：超出 MAX_MESSAGES 时，优雅淘汰最老的消息
    while (messages.value.length >= MAX_MESSAGES) {
      const oldest = messages.value.shift()
      if (oldest?.timer) {
        clearTimeout(oldest.timer)
      }
    }

    const newMsgObj: MessageData = {
      id: finalId,
      text: msgText,
      type: msgType,
      duration: msgDuration,
      remainingDuration: msgDuration,
      startTime: Date.now(),
      action: msgAction,
      timer: null,
      isPaused: false
    }

    // 推入消息队列末尾（栈顶显示）
    messages.value.push(newMsgObj)
    updateTopTimer()

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
