<template>
  <div class="title-bar">
    <div class="title-bar-text"></div>
    <div class="title-bar-controls">
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

const isMaximized = ref(false);

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
</script>

<style scoped lang="less">
.title-bar {
  height: 32px;
  background: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  flex-shrink: 0;
}

.title-bar-text {
  margin-left: 12px;
  font-size: 14px;
  color: #333;
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
  color: #333;
  font-size: 16px;
  transition: background 0.2s;
  outline: none;
}

.control-btn:hover {
  background: #e5e5e5;
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
