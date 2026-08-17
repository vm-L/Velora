import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  checkboxLabel?: string
  defaultChecked?: boolean
}

export interface ConfirmCheckboxResult {
  confirmed: boolean
  checked: boolean
}

interface ConfirmState extends ConfirmOptions {
  isVisible: boolean
  isChecked: boolean
  resolve: (value: any) => void
}

const state = reactive<ConfirmState>({
  isVisible: false,
  title: '',
  message: '是否确认操作',
  confirmText: '确定',
  cancelText: '取消',
  type: 'danger',
  checkboxLabel: undefined,
  isChecked: true,
  resolve: () => {}
})

export const useConfirm = () => {
  function confirm(options: ConfirmOptions & { checkboxLabel: string }): Promise<ConfirmCheckboxResult>;
  function confirm(options: ConfirmOptions): Promise<boolean>;
  function confirm(options: ConfirmOptions): Promise<boolean | ConfirmCheckboxResult> {
    return new Promise((resolve) => {
      state.title = options.title
      state.message = options.message || '是否确认操作'
      state.confirmText = options.confirmText || '确定'
      state.cancelText = options.cancelText || '取消'
      state.type = options.type || 'danger'
      state.checkboxLabel = options.checkboxLabel
      state.isChecked = options.defaultChecked ?? true
      state.resolve = (confirmed: boolean) => {
        if (options.checkboxLabel) {
          resolve({ confirmed, checked: state.isChecked })
        } else {
          resolve(confirmed)
        }
      }
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
