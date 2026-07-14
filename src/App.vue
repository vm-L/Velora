<template>
  <TitleBar />
  <div class="content">
    <Sidebar />
    <div class="main-panel">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
</script>

<style lang="less">
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: "Segoe UI", Arial, sans-serif;
  background: #f5f7fa;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.content {
  flex: 1;
  display: flex;
  height: calc(100vh - 32px);
}

.main-panel {
  flex: 1;
  padding: 30px;
  background: #f5f7fa;
  container-type: size;
  display: flex;
  flex-direction: column;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
