<template>
  <div class="edit-dock-panel" @mousedown.stop>
    <!-- 第一行：打点控制与片段统计 -->
    <div class="dock-header-row">
      <div class="dock-actions-left">
        <VButton variant="secondary" class="dock-btn" @click="emit('set-start')" title="将当前播放时间设为当前片段起点 (快捷键: Z)">
          <VIcon name="segment-start" :size="12" />
          起点
        </VButton>
        <VButton variant="secondary" class="dock-btn" @click="emit('set-end')" title="将当前播放时间设为当前片段终点 (快捷键: C)">
          <VIcon name="segment-end" :size="12" />
          终点
        </VButton>
        <VButton variant="primary" class="dock-btn" @click="emit('add-segment')" title="添加新的剪辑选段 (快捷键: X)">
          <VIcon name="plus" :size="12" />
          添加选段
        </VButton>
      </div>

      <div class="dock-actions-right">
        <span class="summary-text"><strong>{{ segments.length }}</strong> 片段 / <strong>{{ formatPlayerTime(totalEditedDuration) }}</strong></span>
        <VButton variant="icon" class="dock-close-btn" :active="true" @click="emit('exit-edit')" title="退出编辑模式">
          <VIcon name="close" :size="13" />
        </VButton>
      </div>
    </div>

    <!-- 第二行：片段列表 (支持自适应换行与纵向滚动) -->
    <div ref="segmentsListRef" class="dock-segments-list">
      <div
        v-for="(seg, idx) in segments"
        :key="seg.id"
        class="dock-segment-item"
        :class="{ 'is-selected': idx === activeSegmentIndex }"
        @click="emit('select-segment', idx)"
      >
        <span class="seg-badge">#{{ idx + 1 }}</span>
        <div class="seg-time-text">
          <span>{{ formatPlayerTime(seg.start) }}</span>
          <span class="seg-arrow">→</span>
          <span>{{ formatPlayerTime(seg.end) }}</span>
          <span class="seg-dur">({{ formatPlayerTime(Math.max(0, seg.end - seg.start)) }})</span>
        </div>

        <div class="seg-item-actions" @click.stop>
          <VButton
            variant="icon"
            class="seg-icon-btn"
            :active="isSegmentPlaying && idx === activeSegmentIndex"
            @click="emit('toggle-preview-segment', idx)"
            :title="isSegmentPlaying && idx === activeSegmentIndex ? '停止播放 (快捷键: S)' : '播放此片段 (快捷键: S)'"
          >
            <VIcon :name="(isSegmentPlaying && idx === activeSegmentIndex) ? 'pause' : 'play'" :size="10" />
          </VButton>
          <VButton
            v-if="segments.length > 1"
            variant="icon-danger"
            class="seg-icon-btn"
            @click="emit('remove-segment', idx)"
            title="删除此选段 (快捷键: W)"
          >
            <VIcon name="close" :size="10" />
          </VButton>
        </div>
      </div>
    </div>

    <!-- 第三行：保存与另存为操作栏 -->
    <div class="dock-footer-row">
      <div class="footer-save-btns">
        <VButton variant="secondary" @click="emit('save-as')">另存为</VButton>
        <VButton variant="secondary" @click="emit('prompt-overwrite')">覆盖保存</VButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import { formatPlayerTime, type EditSegment } from '@/composables/videoPlayer/types';

const props = defineProps<{
  segments: EditSegment[];
  activeSegmentIndex: number;
  isSegmentPlaying: boolean;
  totalEditedDuration: number;
}>();

const emit = defineEmits<{
  (e: 'set-start'): void;
  (e: 'set-end'): void;
  (e: 'add-segment'): void;
  (e: 'exit-edit'): void;
  (e: 'select-segment', idx: number): void;
  (e: 'toggle-preview-segment', idx: number): void;
  (e: 'remove-segment', idx: number): void;
  (e: 'save-as'): void;
  (e: 'prompt-overwrite'): void;
}>();

const segmentsListRef = ref<HTMLElement | null>(null);

const scrollToActiveSegment = () => {
  nextTick(() => {
    if (!segmentsListRef.value) return;
    const activeEl = segmentsListRef.value.querySelector('.dock-segment-item.is-selected') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  });
};

onMounted(scrollToActiveSegment);
watch(() => [props.activeSegmentIndex, props.segments.length], scrollToActiveSegment);
</script>

<style scoped lang="less">
.edit-dock-panel {
  flex-shrink: 0;
  height: 148px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  z-index: 60;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dock-header-row {
  padding: 6px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
}

.dock-actions-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dock-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dock-close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 4px;
  border-radius: 6px;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-surface-active);
  }
}

.summary-text {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;

  strong {
    color: var(--text-primary);
  }
}

.dock-segments-list {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: center;
  gap: 6px 8px;
  padding: 8px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg-app);
  min-height: 48px;

  &::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--text-secondary);
  }
}

.dock-segment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--text-secondary);
    background: var(--bg-surface-hover);
  }

  &.is-selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
    background: var(--bg-surface-hover);
  }
}

.seg-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  background: var(--border-color);
  border-radius: 3px;
  color: var(--text-primary);
}

.seg-time-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;

  .seg-arrow {
    color: var(--text-secondary);
    font-size: 10px;
  }
  .seg-dur {
    color: var(--text-secondary);
    font-size: 10px;
  }
}

.seg-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.seg-icon-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
    background: var(--bg-surface-active);
  }
}

.dock-footer-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-color);
}

.footer-save-btns {
  display: flex;
  gap: 8px;
}
</style>
