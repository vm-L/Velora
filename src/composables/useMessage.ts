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

export const useMessage = () => {
  const removeMessage = (id: string) => {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx !== -1) {
      if (messages.value[idx].timer) {
        clearTimeout(messages.value[idx].timer)
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
          msg.remainingDuration = Math.max(800, msg.remainingDuration - elapsed)
          msg.isPaused = true
        }
      }
    })
  }

  const resumeTimer = (id?: string) => {
    messages.value.forEach(msg => {
      if (!id || msg.id === id) {
        if (msg.isPaused && msg.duration > 0) {
          msg.isPaused = false
          msg.startTime = Date.now()
          const delay = Math.max(1000, msg.remainingDuration || msg.duration)
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
    duration = 1500,
    action?: MessageAction,
    id?: string
  ): string => {
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

    // 清理已存在的同名 ID 消息及其定时器
    const existingIndex = messages.value.findIndex(m => m.id === finalId)
    if (existingIndex !== -1) {
      if (messages.value[existingIndex].timer) {
        clearTimeout(messages.value[existingIndex].timer)
      }
      messages.value.splice(existingIndex, 1)
    }

    // 设置新的倒计时（若 duration > 0）
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

    // 推入消息队列末尾（置顶显示）
    messages.value.push(newMsgObj)

    return finalId
  }

  return {
    messages,
    showMessage,
    removeMessage,
    pauseTimer,
    resumeTimer
  }
}
