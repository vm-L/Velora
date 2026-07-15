import { ref } from 'vue'

export interface MessageData {
  id: string
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration: number
}

const messages = ref<MessageData[]>([])

export const useMessage = () => {
  const showMessage = (text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9)
    messages.value.push({ id, text, type, duration })
    
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
