<template>
  <div class="title-bar">
    <div class="title-bar-text"></div>
    <div class="title-bar-controls">
      <button class="control-btn theme-btn" :title="state.theme === 'dark' ? '浅色模式' : '深色模式'" @click="toggleTheme">
        <svg v-if="state.theme === 'dark'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
      <button class="control-btn" title="最小化" @click="minimize">&#8211;</button>
      <button class="control-btn" :title="isMaximized ? '还原' : '最大化'" @click="maximize"
        v-html="isMaximized ? '&#10066;' : '&#10064;'">
      </button>
      <button class="control-btn close" title="关闭" @click="close">&#10006;</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettings } from '../composables/useSettings';

const isMaximized = ref(false);
const { state, setTheme } = useSettings();

onMounted(() => {
  window.electronAPI.onWindowMaximized(() => {
    isMaximized.value = true;
  });
  window.electronAPI.onWindowUnmaximized(() => {
    isMaximized.value = false;
  });
});

const minimize = () => {
  window.electronAPI.minimize();
};

const maximize = () => {
  window.electronAPI.maximize();
};

const close = () => {
  window.electronAPI.close();
};

const toggleTheme = (event: MouseEvent) => {
  const isDark = state.theme === 'dark';
  const newTheme = isDark ? 'light' : 'dark';

  if (!document.startViewTransition) {
    setTheme(newTheme);
    return;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y)
  );

  const transition = document.startViewTransition(() => {
    setTheme(newTheme);
  });

  transition.ready.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`
    ];
    
    document.documentElement.animate(
      { clipPath },
      {
        duration: 400,
        easing: 'ease-in-out',
        pseudoElement: '::view-transition-new(root)',
        fill: 'forwards'
      }
    );
  });
};
</script>

<style scoped lang="less">
.title-bar {
  height: 32px;
  background: var(--bg-surface);
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  user-select: none;
  box-shadow: var(--shadow-sm);
  z-index: 1000;
  flex-shrink: 0;
}

.title-bar-text {
  margin-left: 12px;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.title-bar-controls {
  display: flex;
  -webkit-app-region: no-drag;
  height: 100%;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 16px;
  transition: background 0.2s;
  outline: none;
}

.control-btn:hover {
  background: var(--bg-surface-hover);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
