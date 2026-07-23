import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { tooltip } from './directives/tooltip'

const app = createApp(App)

app.directive('tooltip', tooltip)

app.directive('click-outside', {
  mounted(el, binding) {
    el.clickOutsideEvent = function(event: Event) {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event, el)
      }
    }
    document.body.addEventListener('click', el.clickOutsideEvent)
  },
  unmounted(el) {
    document.body.removeEventListener('click', el.clickOutsideEvent)
  }
})

app.use(router)

const initApp = async () => {
  if (window.electronAPI) {
    window.__SERVER_PORT__ = await window.electronAPI.getServerPort();
  }
  app.mount('#app');
}
initApp();

