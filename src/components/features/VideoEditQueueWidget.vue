<template>
  <Teleport to="body">
    <!-- 1. 居中详情弹窗模式 -->
    <div
      v-if="isModalVisible && (activeTask || tasks.length > 0)"
      class="video-edit-queue-mask"
      @mousedown.stop
    >
      <div class="video-edit-queue-card">
        <!-- 弹窗标题栏 -->
        <div class="modal-header">
          <div class="header-left">
            <VIcon
              v-if="activeTask?.status === 'completed'"
              name="success"
              :size="18"
              style="color: var(--color-success, #10b981);"
            />
            <VIcon
              v-else-if="activeTask?.status === 'error'"
              name="error"
              :size="18"
              style="color: var(--color-error, #ef4444);"
            />
            <VIcon
              v-else-if="activeTask?.status === 'processing'"
              name="loading"
              :size="18"
              class="spin-icon"
            />
            <VIcon
              v-else
              name="edit"
              :size="18"
            />
            <h3>
              {{
                activeTask?.status === 'completed'
                  ? '处理完成'
                  : activeTask?.status === 'error'
                  ? '处理失败'
                  : '视频剪辑处理队列'
              }}
            </h3>
          </div>
          <!-- 右上角关闭按钮：平滑进入后台处理并缩小到右下角 -->
          <VButton
            variant="icon"
            class="header-close-btn"
            title="转入后台处理"
            @click="closeModalToBackground"
          >
            <VIcon name="close" :size="14" />
          </VButton>
        </div>

        <!-- 当前主任务处理进度区 -->
        <div class="modal-body">
          <div v-if="activeTask" class="active-task-box">
            <div class="task-title-row">
              <span class="task-name" :title="activeTask.title">{{ activeTask.title }}</span>
              <span
                class="task-badge"
                :class="activeTask.status"
              >
                {{
                  activeTask.status === 'processing'
                    ? '处理中'
                    : activeTask.status === 'completed'
                    ? '已完成'
                    : activeTask.status === 'error'
                    ? '失败'
                    : '排队中'
                }}
              </span>
            </div>

            <!-- 进度条 -->
            <div class="progress-bar-track">
              <div
                class="progress-fill"
                :class="{
                  success: activeTask.status === 'completed',
                  error: activeTask.status === 'error'
                }"
                :style="{ width: (activeTask.status === 'completed' ? 100 : activeTask.percent) + '%' }"
              ></div>
            </div>

            <div class="progress-meta-row">
              <span class="status-text">{{ activeTask.text || '正在处理中' }}</span>
              <span class="status-percent">
                {{ activeTask.status === 'completed' ? 100 : Math.round(activeTask.percent) }}%
              </span>
            </div>

            <!-- 错误提示 -->
            <div v-if="activeTask.error" class="error-banner">
              {{ activeTask.error }}
            </div>
          </div>

          <!-- 排队任务列表 -->
          <div v-if="waitingTasks.length > 0" class="waiting-queue-section">
            <div class="queue-header">
              <span>等待排队处理 ({{ waitingTasks.length }})</span>
            </div>
            <div class="queue-list">
              <div
                v-for="task in waitingTasks"
                :key="task.id"
                class="queue-item"
              >
                <div class="queue-item-info">
                  <VIcon name="loading" :size="12" class="queue-wait-icon" />
                  <span class="queue-item-title" :title="task.title">{{ task.title }}</span>
                </div>
                <button
                  class="queue-remove-btn"
                  title="移除排队任务"
                  @click.stop="cancelTask(task.id)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 弹窗底部操作栏 -->
        <div class="modal-footer">
          <template v-if="hasActiveOrWaitingTasks">
            <VButton
              variant="secondary"
              class="btn-bg-process"
              title="缩小到右下角，继续进行其他操作"
              @click="minimize"
            >
              后台处理
            </VButton>
            <VButton
              variant="secondary"
              class="btn-cancel"
              :disabled="activeTask?.status === 'processing' && activeTask.percent >= 95"
              :title="activeTask?.status === 'processing' && activeTask.percent >= 95 ? '正在完成文件写入，不可取消' : '取消当前任务'"
              @click="cancelCurrentTask"
            >
              取消处理
            </VButton>
          </template>

          <template v-else>
            <VButton
              v-if="activeTask?.finalOutputPath"
              variant="secondary"
              @click="handleOpenDir"
            >
              打开文件目录
            </VButton>
            <VButton
              variant="secondary"
              @click="closeModalToBackground"
            >
              完成
            </VButton>
          </template>
        </div>
      </div>
    </div>

    <!-- 2. 右下角微型胶囊浮岛模式 -->
    <div
      v-if="isMinimized && hasActiveOrWaitingTasks"
      class="video-edit-capsule"
      title="点击展开剪辑任务详情"
      @click="expand"
    >
      <div class="capsule-inner">
        <!-- 环形旋转指示器与紧凑百分比 -->
        <div class="capsule-progress-ring">
          <svg class="ring-svg" viewBox="0 0 24 24">
            <circle class="ring-bg" cx="12" cy="12" r="9" />
            <circle
              class="ring-bar"
              cx="12"
              cy="12"
              r="9"
              :style="{ strokeDashoffset: ringDashoffset }"
            />
          </svg>
          <span class="ring-text">{{ currentPercent }}</span>
        </div>

        <!-- 任务名称单行截断 -->
        <div class="capsule-info">
          <span class="capsule-title">{{ activeTask?.title || '正在剪辑' }}</span>
        </div>

        <!-- 若有排队任务，显示紧凑徽标 -->
        <div
          v-if="waitingTasks.length > 0"
          class="capsule-badge"
          title="排队中任务数"
        >
          +{{ waitingTasks.length }}
        </div>

        <!-- 微型取消按钮 -->
        <button
          class="capsule-cancel-btn"
          title="取消当前剪辑任务"
          :disabled="activeTask?.status === 'processing' && activeTask.percent >= 95"
          @click.stop="cancelCurrentTask"
        >
          ✕
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import { useVideoEditQueue } from '@/composables/useVideoEditQueue';

const {
  tasks,
  activeTask,
  waitingTasks,
  hasActiveOrWaitingTasks,
  isModalVisible,
  isMinimized,
  cancelTask,
  cancelCurrentTask,
  minimize,
  expand,
  closeModalToBackground
} = useVideoEditQueue();

const currentPercent = computed(() => {
  if (!activeTask.value) return 0;
  if (activeTask.value.status === 'completed') return 100;
  return Math.round(activeTask.value.percent || 0);
});

// SVG 环形进度偏移计算 (周长: 2 * PI * 9 ≈ 56.548)
const ringDashoffset = computed(() => {
  const c = 56.548;
  const pct = currentPercent.value / 100;
  return c * (1 - Math.max(0, Math.min(1, pct)));
});

const handleOpenDir = () => {
  if (activeTask.value?.finalOutputPath && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(activeTask.value.finalOutputPath);
  }
};
</script>

<style scoped lang="less">
/* 居中弹窗样式 */
.video-edit-queue-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease-out;
}

.video-edit-queue-card {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  width: 90vw;
  max-width: 440px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-primary, #111827);
  animation: scaleIn 0.15s ease-out;
}

.modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: space-between;

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;

    h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
    }
  }

  .header-close-btn {
    padding: 4px;
    border-radius: 6px;
    color: var(--text-secondary, #6b7280);

    &:hover {
      background: var(--bg-hover, #f3f4f6);
      color: var(--text-primary, #111827);
    }
  }
}

.modal-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.active-task-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  .task-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;

    &.processing {
      background: var(--color-accent-subtle, #e0f2fe);
      color: var(--color-accent, #0284c7);
    }
    &.completed {
      background: #dcfce7;
      color: #16a34a;
    }
    &.error {
      background: #fee2e2;
      color: #dc2626;
    }
    &.waiting {
      background: #f3f4f6;
      color: #6b7280;
    }
  }
}

.progress-bar-track {
  height: 6px;
  border-radius: 3px;
  background: var(--bg-tertiary, #e5e7eb);
  overflow: hidden;

  .progress-fill {
    height: 100%;
    background: var(--color-accent, #3b82f6);
    border-radius: 3px;
    transition: width 0.15s ease-out;

    &.success {
      background: var(--color-success, #10b981);
    }
    &.error {
      background: var(--color-error, #ef4444);
    }
  }
}

.progress-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);

  .status-percent {
    font-family: monospace;
    font-weight: 600;
  }
}

.error-banner {
  font-size: 12px;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fee2e2;
  border-radius: 6px;
  padding: 8px 10px;
}

/* 排队任务列表 */
.waiting-queue-section {
  border-top: 1px dashed var(--border-color, #e5e7eb);
  padding-top: 12px;

  .queue-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary, #6b7280);
    margin-bottom: 8px;
  }

  .queue-list {
    max-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .queue-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: var(--bg-surface-hover, #f9fafb);
    border-radius: 6px;
    font-size: 12px;

    .queue-item-info {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;

      .queue-wait-icon {
        color: var(--text-secondary, #9ca3af);
        animation: spin 1s linear infinite;
        flex-shrink: 0;
      }

      .queue-item-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .queue-remove-btn {
      background: none;
      border: none;
      color: var(--text-secondary, #9ca3af);
      cursor: pointer;
      padding: 2px 4px;
      font-size: 11px;
      border-radius: 4px;

      &:hover {
        color: #ef4444;
        background: #fee2e2;
      }
    }
  }
}

.modal-footer {
  padding: 12px 18px;
  background: var(--bg-hover-soft, #f9fafb);
  border-top: 1px solid var(--border-light, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

/* 2. 右下角微型胶囊浮岛 */
.video-edit-capsule {
  position: fixed;
  right: 20px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 9999;
  cursor: pointer;
  user-select: none;
  animation: slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    .capsule-inner {
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }
  }
}

.capsule-inner {
  height: 36px;
  max-width: 200px;
  padding: 0 8px 0 10px;
  background: var(--bg-surface, #ffffff);
  background: rgba(var(--bg-surface-rgb, 255, 255, 255), 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary, #111827);
}

.capsule-progress-ring {
  position: relative;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  .ring-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);

    .ring-bg {
      fill: none;
      stroke: var(--bg-tertiary, #e5e7eb);
      stroke-width: 2.5;
    }

    .ring-bar {
      fill: none;
      stroke: var(--color-accent, #3b82f6);
      stroke-width: 2.5;
      stroke-dasharray: 56.548;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.15s linear;
    }
  }

  .ring-text {
    font-size: 8px;
    font-weight: 700;
    font-family: monospace;
    color: var(--text-primary, #111827);
  }
}

.capsule-info {
  flex: 1;
  min-width: 0;

  .capsule-title {
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    color: var(--text-primary, #111827);
  }
}

.capsule-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 999px;
  background: var(--color-accent, #3b82f6);
  color: #fff;
  line-height: 1.2;
  flex-shrink: 0;
}

.capsule-cancel-btn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary, #9ca3af);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.12s ease;

  &:hover {
    background: #fee2e2;
    color: #ef4444;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes slideUpFade {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
