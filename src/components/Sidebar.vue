<template>
  <div class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="sidebar-header" @click="toggleSidebar">
      <div class="sidebar-title">
        <span v-for="(char, index) in titleText" :key="index"
          :style="{ '--i': index, '--inv-i': titleText.length - 1 - index }">{{ char }}</span>
      </div>
      <button class="toggle-btn" title="展开/收起">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
    </div>

    <div class="menu-top">
      <router-link to="/" class="menu-item" active-class="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span class="menu-text">主页</span>
      </router-link>
    </div>

    <div class="menu-bottom">
      <router-link to="/settings" class="menu-item" active-class="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
          </path>
        </svg>
        <span class="menu-text">设置</span>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isCollapsed = ref(false);
const titleText = 'M3U8 Electron'.split('');

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};
</script>

<style scoped lang="less">
.sidebar {
  width: 180px;
  background: #ffffff;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.02);
  z-index: 10;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar-header {
  height: 54px;
  padding: 0 22px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-bottom: 1px solid #f0f0f0;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
}

.sidebar-title {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(-50%);
  font-weight: 600;
  color: #333;
  font-size: 15px;
  display: flex;
  white-space: pre;
  pointer-events: none;
}

.sidebar-title span {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 0.1s ease, transform 0.1s ease;
  transition-delay: calc(var(--i) * 0.014s);
}

.sidebar.collapsed .sidebar-title span {
  opacity: 0;
  transform: translateX(-5px);
  transition: opacity 0.1s ease, transform 0.1s ease;
  transition-delay: calc(var(--inv-i) * 0.014s);
}

.toggle-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #555;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  outline: none;
  transition: color 0.2s;
  width: 20px;
  height: 20px;
}

.toggle-btn:hover {
  color: #1890ff;
}

.toggle-btn svg {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.collapsed .toggle-btn svg {
  transform: rotate(180deg);
}

.menu-top {
  flex: 1;
  padding-top: 10px;
}

.menu-bottom {
  margin-top: auto;
  padding-bottom: 20px;
}

.menu-item {
  padding: 12px 22px;
  cursor: pointer;
  color: #555;
  font-size: 15px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  white-space: nowrap;
  height: 48px;
  text-decoration: none;
}

.menu-item svg {
  flex-shrink: 0;
  margin-right: 16px;
  transition: margin 0.3s ease;
}

.sidebar.collapsed .menu-item svg {
  margin-right: 0;
}

.menu-item .menu-text {
  opacity: 1;
  transition: opacity 0.2s ease-in-out;
}

.sidebar.collapsed .menu-item .menu-text {
  opacity: 0;
  pointer-events: none;
}

.menu-item:hover {
  background: #f5f7fa;
  color: #333;
}

.menu-item.active {
  background: #e6f7ff;
  color: #1890ff;
  box-shadow: inset -3px 0 0 #1890ff;
  font-weight: 500;
}
</style>
