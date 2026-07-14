import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ConfirmState extends ConfirmOptions {
  isVisible: boolean
  resolve: (value: boolean) => void
}

const state = reactive<ConfirmState>({
  isVisible: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  type: 'danger',
  resolve: () => {}
})

export const useConfirm = () => {
  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      state.title = options.title
      state.message = options.message
      state.confirmText = options.confirmText || '确定'
      state.cancelText = options.cancelText || '取消'
      state.type = options.type || 'danger'
      state.resolve = resolve
      state.isVisible = true
    })
  }

  const proceed = () => {
    state.isVisible = false
    state.resolve(true)
  }

  const cancel = () => {
    state.isVisible = false
    state.resolve(false)
  }

  return {
    state,
    confirm,
    proceed,
    cancel
  }
}
