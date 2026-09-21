<template>
  <div class="title-bar">
    <div class="title-bar-text"></div>
    <div class="title-bar-controls">
      <router-link to="/help" class="control-btn help-btn" title="帮助与快捷键">
        <VIcon name="help" :size="14" />
      </router-link>
      <router-link to="/settings" class="control-btn settings-btn" title="设置">
        <VIcon name="settings" :size="14" />
      </router-link>
      <button class="control-btn theme-btn" :title="state.theme === 'dark' ? '浅色模式' : '深色模式'" @click="toggleTheme">
        <VIcon :name="state.theme === 'dark' ? 'sun' : 'moon'" :size="14" />
      </button>
      <button class="control-btn" title="最小化" @click="minimize">
        <VIcon name="minimize" :size="12" />
      </button>
      <button class="control-btn" :title="isMaximized ? '还原' : '最大化'" @click="maximize">
        <VIcon :name="isMaximized ? 'restore' : 'maximize'" :size="12" />
      </button>
      <button class="control-btn close" title="关闭" @click="close">
        <VIcon name="close" :size="12" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettings } from '../../composables/useSettings';
import VIcon from '../base/VIcon.vue';

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
  transition: all 0.2s;
  outline: none;
  text-decoration: none;
  box-sizing: border-box;
}

.control-btn:hover {
  background: var(--bg-surface-hover);
}

.control-btn.router-link-active {
  color: var(--color-accent);
  background: var(--bg-surface-hover);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
