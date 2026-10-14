import type { Directive, DirectiveBinding } from 'vue'

interface OverlayCloseElement extends HTMLElement {
  _overlayCloseCallback?: (() => void) | undefined
  _overlayCloseHandler?: {
    onMouseDown: (e: MouseEvent) => void
    onMouseUp: (e: MouseEvent) => void
  }
}

/**
 * v-overlay-close 自定义指令
 * 用于模态框遮罩层：当且仅当鼠标左键按下(mousedown)和松开(mouseup)的目标元素均为遮罩层自身时，
 * 才触发关闭回调。彻底避免在输入框内框选文本并拖拽到遮罩区松开时导致的误触关闭弹窗问题。
 */
export const overlayClose: Directive<OverlayCloseElement, (() => void) | undefined> = {
  mounted(el, binding: DirectiveBinding<(() => void) | undefined>) {
    el._overlayCloseCallback = typeof binding.value === 'function' ? binding.value : undefined

    let isMouseDownOnEl = false

    const onMouseDown = (e: MouseEvent) => {
      // 仅响应鼠标左键 (button === 0)
      if (e.button !== 0) return
      isMouseDownOnEl = e.target === el
    }

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return
      // 当且仅当按下与松开均在遮罩自身时触发
      if (isMouseDownOnEl && e.target === el) {
        el._overlayCloseCallback?.()
      }
      isMouseDownOnEl = false
    }

    el._overlayCloseHandler = { onMouseDown, onMouseUp }
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseup', onMouseUp)
  },

  updated(el, binding: DirectiveBinding<(() => void) | undefined>) {
    el._overlayCloseCallback = typeof binding.value === 'function' ? binding.value : undefined
  },

  unmounted(el) {
    if (el._overlayCloseHandler) {
      el.removeEventListener('mousedown', el._overlayCloseHandler.onMouseDown)
      el.removeEventListener('mouseup', el._overlayCloseHandler.onMouseUp)
      delete el._overlayCloseHandler
    }
    delete el._overlayCloseCallback
  }
}
