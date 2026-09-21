<template>
  <div class="view help-view">
    <div class="help-container">
      <!-- 页面顶部标题与操作栏 -->
      <div class="help-header">
        <div class="help-title-area">
          <button class="back-btn" @click="goBack" title="返回">
            <VIcon name="arrow-left" :size="18" />
          </button>
          <div>
            <h1 class="help-page-title">帮助与快捷键</h1>
            <p class="help-page-subtitle">了解常用快捷键与功能操作，提升播放与剪辑效率</p>
          </div>
        </div>
      </div>

      <!-- 媒体播放快捷键 -->
      <div class="help-section-title">
        <VIcon name="play" :size="16" />
        <span>媒体播放控制</span>
      </div>
      <div class="help-card">
        <div class="shortcut-grid">
          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Space</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">播放 / 暂停</span>
              <span class="desc-detail">切换音视频播放与暂停状态</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">←</kbd>
              <kbd class="v-kbd">→</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">步进微调 (1 秒)</span>
              <span class="desc-detail">向后后退 1 秒 / 向前快进 1 秒</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Ctrl</kbd>
              <span class="key-plus">+</span>
              <kbd class="v-kbd">←</kbd>
              <kbd class="v-kbd">→</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">常规步进 (10 秒)</span>
              <span class="desc-detail">向后后退 10 秒 / 向前快进 10 秒</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Shift</kbd>
              <span class="key-plus">+</span>
              <kbd class="v-kbd">←</kbd>
              <kbd class="v-kbd">→</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">大步进跨度 (1 分钟)</span>
              <span class="desc-detail">向后跳退 60 秒 / 向前跳进 60 秒</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">↑</kbd>
              <kbd class="v-kbd">↓</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">音量微调</span>
              <span class="desc-detail">增加 1% 音量 / 减少 1% 音量</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">F</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">全屏播放</span>
              <span class="desc-detail">进入或退出全屏播放视窗</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">M</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">声音静音</span>
              <span class="desc-detail">快速开启或关闭声音</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Esc</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">退出全屏</span>
              <span class="desc-detail">退出全屏播放状态</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 视频剪辑与选段快捷键 -->
      <div class="help-section-title">
        <VIcon name="scissors" :size="16" />
        <span>视频编辑模式下</span>
      </div>
      <div class="help-card">
        <div class="shortcut-grid">
          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Z</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">设置起点</span>
              <span class="desc-detail">将当前播放进度设为选段起点</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">C</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">设置终点</span>
              <span class="desc-detail">将当前播放进度设为选段终点</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">X</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">新建选段区间</span>
              <span class="desc-detail">在当前播放位置创建新的剪辑区间</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">A</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">定位到选段起点</span>
              <span class="desc-detail">将视频进度跳转至当前选段的起始时间</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">D</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">定位到选段终点</span>
              <span class="desc-detail">将视频进度跳转至当前选段的结束时间</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">S</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">播放当前选段</span>
              <span class="desc-detail">播放或暂停当前选段区间</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Q</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">上一选段</span>
              <span class="desc-detail">切换并激活上一个剪辑选段区间</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">E</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">下一选段</span>
              <span class="desc-detail">切换并激活下一个剪辑选段区间</span>
            </div>
          </div>

          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd danger-kbd">W</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">删除选段</span>
              <span class="desc-detail">删除当前选中的剪辑区间</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 通用与导航 -->
      <div class="help-section-title">
        <VIcon name="info" :size="16" />
        <span>通用操作与提示</span>
      </div>
      <div class="help-card">
        <div class="shortcut-grid">
          <div class="shortcut-item">
            <div class="shortcut-keys">
              <kbd class="v-kbd">Esc</kbd>
            </div>
            <div class="shortcut-desc">
              <span class="desc-name">关闭弹窗 / 退出</span>
              <span class="desc-detail">关闭当前活动的模态弹窗或退出全屏状态</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import VIcon from '../components/base/VIcon.vue';

const router = useRouter();

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};
</script>

<style scoped lang="less">
.help-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
  box-sizing: border-box;
  overflow-y: auto;
}

.help-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-bottom: var(--view-padding);
}

.help-header {
  margin-bottom: 24px;
}

.help-title-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: var(--bg-surface-hover);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  &:active {
    transform: scale(0.95);
  }
}

.help-page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.help-page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.help-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  margin-top: 24px;
  letter-spacing: 0.5px;

  &:first-of-type {
    margin-top: 0;
  }
}

.help-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1px;
  background: var(--border-light);
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: var(--bg-surface);
  gap: 16px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--bg-surface-hover);
  }
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.v-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-base);
  border: 1px solid var(--border-color);
  border-bottom: 2px solid var(--border-color);
  border-radius: 5px;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05);
  user-select: none;
  line-height: 1;

  &.danger-kbd {
    color: var(--color-danger, #ef4444);
    border-color: rgba(239, 68, 68, 0.3);
  }
}

.key-plus {
  font-size: 12px;
  color: var(--text-tertiary, var(--text-secondary));
  font-weight: 600;
}

.shortcut-desc {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  min-width: 0;
}

.desc-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.desc-detail {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.3;
}

.tip-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  background: var(--bg-surface-active);
  color: var(--color-accent);
  border: 1px solid var(--border-color);
}

@media (max-width: 640px) {
  .shortcut-grid {
    grid-template-columns: 1fr;
  }

  .shortcut-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .shortcut-desc {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
