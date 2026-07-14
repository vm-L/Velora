<template>
  <div class="view settings-view">
    <div class="settings-container">
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-info">
            <h3>关闭窗口行为</h3>
            <p>指定点击主窗口右上角关闭按钮时的默认系统行为。</p>
          </div>
          <div class="segmented-control" :class="{ 'state-quit': closeBehavior === 'quit' }">
            <label>
              <input type="radio" name="close-action" value="tray" v-model="closeBehavior" @change="updateBehavior">
              <span>隐藏到托盘</span>
            </label>
            <label>
              <input type="radio" name="close-action" value="quit" v-model="closeBehavior" @change="updateBehavior">
              <span>直接退出</span>
            </label>
            <div class="selection-pill"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const closeBehavior = ref('tray');

onMounted(async () => {
  const behavior = await window.electronAPI.getCloseBehavior();
  if (behavior) {
    closeBehavior.value = behavior;
  }
});

const updateBehavior = () => {
  window.electronAPI.setCloseBehavior(closeBehavior.value);
};
</script>

<style scoped lang="less">
.settings-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 40px;
  box-sizing: border-box;
}

.settings-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.settings-header-text {
  font-size: 32px;
  font-weight: 600;
  color: #333;
  margin-bottom: 24px;
  letter-spacing: -0.5px;
}

.settings-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  transition: background-color 0.2s ease;
}

.settings-row:hover {
  background-color: #f8fafc;
}

.settings-info h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.settings-info p {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  max-width: 400px;
  line-height: 1.5;
}

.segmented-control {
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
  position: relative;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.segmented-control input[type="radio"] {
  display: none;
}

.segmented-control label {
  position: relative;
  z-index: 2;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: color 0.2s ease;
  user-select: none;
  width: 106px;
  text-align: center;
}

.segmented-control input[type="radio"]:checked + span {
  color: #0f172a;
}

.selection-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: 106px;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.segmented-control.state-quit .selection-pill {
  transform: translateX(106px);
}
</style>
