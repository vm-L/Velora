<template>
  <div class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="sidebar-header" @click="toggleSidebar">
      <div class="sidebar-title">
        <AnimatedText text="M3U8 Electron" :isCollapsed="isCollapsed" />
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

      <div class="menu-group" v-if="state.cmsResources.length > 0">
        <div class="group-title">
          <AnimatedText text="CMS 资源" :isCollapsed="isCollapsed" />
        </div>
        <router-link
          v-for="item in state.cmsResources"
          :key="item.id"
          :to="`/resource/cms/${item.id}`"
          class="menu-item sub-item"
          active-class="active"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
          <span class="menu-text">{{ item.name }}</span>
        </router-link>
      </div>

      <div class="menu-group" v-if="state.externalSites.length > 0">
        <div class="group-title">
          <AnimatedText text="网站资源" :isCollapsed="isCollapsed" />
        </div>
        <router-link
          v-for="item in state.externalSites"
          :key="item.id"
          :to="`/resource/ext/${item.id}`"
          class="menu-item sub-item"
          active-class="active"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          <span class="menu-text">{{ item.name }}</span>
        </router-link>
      </div>
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
import { useSettings } from '../composables/useSettings';
import AnimatedText from './AnimatedText.vue';

const isCollapsed = ref(false);
const { state } = useSettings();

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
  pointer-events: none;
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
  overflow-y: auto;
}

.menu-group {
  margin-top: 16px;
}

.group-title {
  padding: 0 22px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  user-select: none;
  height: 18px; /* Maintain height when collapsed */
  overflow: hidden;
}

.sub-item svg {
  margin-left: 2px;
  margin-right: 18px;
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
