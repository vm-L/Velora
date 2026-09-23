<template>
  <div v-if="dialogs.length > 0" class="save-media-container">
    <!-- 拖拽防护遮罩：拖动弹窗时防止 Webview 捕获鼠标事件 -->
    <div v-if="isDraggingAnyDialog" class="save-drag-shield"></div>

    <SaveMediaDialog
      v-for="item in dialogs"
      :key="item.id"
      :id="item.id"
      :url="item.url"
      :default-name="item.defaultName"
      :default-dir="item.defaultDir"
      :type="item.type"
      :name-options="item.nameOptions"
      :url-options="item.urlOptions"
      :page-url="item.pageUrl"
      :initial-x="item.x"
      :initial-y="item.y"
      :z-index="item.zIndex"
      :is-highlighted="item.isHighlighted"
      @close="closeSaveMediaDialog(item.id)"
      @focus="focusDialog(item.id)"
      @update-position="(pos) => updateDialogPosition(item.id, pos.x, pos.y)"
    />
  </div>
</template>

<script setup lang="ts">
import { useSaveMediaDialog } from '@/composables/useSaveMediaDialog';
import SaveMediaDialog from '@/components/features/SaveMediaDialog.vue';

const { dialogs, isDraggingAnyDialog, closeSaveMediaDialog, focusDialog, updateDialogPosition } = useSaveMediaDialog();
</script>

<style scoped>
.save-media-container {
  pointer-events: none;
}

.save-media-container :deep(.save-modal-window) {
  pointer-events: auto;
}

.save-drag-shield {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1999;
  background: transparent;
  cursor: grabbing;
  pointer-events: auto;
}
</style>
