import { ref } from 'vue'

export interface MessageData {
  id: string
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration: number
  action?: {
    text: string
    callback: () => void
  }
}

const messages = ref<MessageData[]>([])

export const useMessage = () => {
  const showMessage = (text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3000, action?: {text: string, callback: () => void}) => {
    const id = Math.random().toString(36).substr(2, 9)
    messages.value.push({ id, text, type, duration, action })
    
    setTimeout(() => {
      removeMessage(id)
    }, duration)
  }

  const removeMessage = (id: string) => {
    messages.value = messages.value.filter(m => m.id !== id)
  }

  return {
    messages,
    showMessage,
    removeMessage
  }
}
