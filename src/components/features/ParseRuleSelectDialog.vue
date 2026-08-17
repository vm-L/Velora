<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @mousedown.self="close">
      <div class="modal-content" style="max-width: 440px; width: 90vw;">
        <div class="modal-header">
          <h3>选择解析规则</h3>
          <v-button variant="icon" class="modal-close-btn" @click="close">
            <VIcon name="close" size="18" />
          </v-button>
        </div>

        <div class="modal-body">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
            当前页面匹配到多个解析规则，请选择要执行的规则：
          </p>

          <div class="form-row">
            <label style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; display: block;">匹配规则</label>
            <VInputSelect
              v-model="selectedDomain"
              :options="ruleOptions"
              :allow-input="false"
              placeholder="选择规则"
              class="w-full"
            />
          </div>
        </div>

        <div class="modal-footer" style="padding: 12px 16px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 8px; background: var(--bg-surface-hover);">
          <v-button variant="secondary" @click="close">取消</v-button>
          <v-button variant="primary" :disabled="!selectedDomain" @click="confirmSelect">确认执行</v-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import VButton from '../base/VButton.vue';
import VIcon from '../base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '../base/VInputSelect.vue';
import type { ParseRule } from '../../composables/useSettings';

const props = defineProps<{
  visible: boolean;
  rules: ParseRule[];
}>();

const emit = defineEmits(['update:visible', 'select']);

const selectedDomain = ref('');

const ruleOptions = computed<InputSelectOption[]>(() => {
  const set = new Set<string>();
  props.rules.forEach(r => set.add(r.domain));
  return Array.from(set).map(domain => ({
    label: domain,
    value: domain
  }));
});

watch(() => props.visible, (val) => {
  if (val && ruleOptions.value.length > 0) {
    selectedDomain.value = ruleOptions.value[0].value;
  }
});

const close = () => {
  emit('update:visible', false);
};

const confirmSelect = () => {
  if (!selectedDomain.value) return;
  emit('select', selectedDomain.value);
  close();
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2147483647;
}

.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-surface-hover);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  padding: 16px;
  background: var(--bg-surface);
}
</style>
