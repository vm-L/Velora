<template>
  <div class="dropdown-container">
    <button
      class="func-btn"
      :class="{ 'active': isOpen || isActive }"
      v-tooltip="isOpen ? '' : '瀑布模式'"
      @click="toggle"
    >
      <VIcon name="waterfall" :size="16" />
      <div v-if="isActive" class="active-dot" title="瀑布流运行中"></div>
    </button>

    <div v-if="isOpen" class="dropdown-backdrop" @click.stop="close"></div>

    <div v-if="isOpen" class="dropdown-menu waterfall-dropdown-menu">
      <div class="dropdown-header">
        <div class="header-title">
          <VIcon name="waterfall" :size="15" />
          <span>瀑布模式</span>
        </div>
        <span v-if="isActive" class="status-tag active">运行中</span>
        <span v-else class="status-tag idle">未开启</span>
      </div>

      <!-- 第一行: 规则选择与删除 -->
      <div class="dropdown-body">
        <div class="rule-select-row">
          <div v-if="rules.length > 0" class="select-wrapper">
            <VInputSelect
              :model-value="selectedRuleId || ''"
              :options="ruleOptions"
              :allow-input="false"
              placeholder="选择瀑布流规则"
              @update:model-value="onRuleSelect"
            />
          </div>
          <div v-else class="no-rule-text">
            当前URL暂无瀑布流规则
          </div>

          <v-button
            v-if="rules.length > 0"
            variant="icon"
            class="delete-btn"
            title="删除选中规则"
            @click.stop="handleDelete"
          >
            <VIcon name="trash" :size="14" />
          </v-button>
        </div>

        <!-- 第二行: 新建与开启/关闭按钮 -->
        <div class="action-buttons-row">
          <v-button
            variant="secondary"
            class="action-btn flex-1"
            @click.stop="handleStartWizard"
          >
            <VIcon name="plus" :size="13" />
            <span>新建</span>
          </v-button>

          <v-button
            :variant="isActive ? 'secondary' : 'primary'"
            :disabled="rules.length === 0"
            class="action-btn flex-1"
            :class="{ 'stop-btn': isActive }"
            @click.stop="handleToggleActive"
          >
            <span>{{ isActive ? '关闭瀑布流' : '开启' }}</span>
          </v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';
import type { WaterfallRule } from '@/composables/useSettings';

const props = defineProps<{
  rules: WaterfallRule[];
  selectedRuleId?: string;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'start-wizard'): void;
  (e: 'toggle-active'): void;
  (e: 'select-rule', id: string): void;
  (e: 'delete-rule', id: string): void;
}>();

const isOpen = ref(false);

const ruleOptions = computed<InputSelectOption[]>(() => {
  return props.rules.map(r => ({
    label: `${r.domain}${r.name ? ` (${r.name})` : ''}`,
    value: r.id
  }));
});

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const close = () => {
  isOpen.value = false;
};

const onRuleSelect = (val: string) => {
  emit('select-rule', val);
};

const handleStartWizard = () => {
  close();
  emit('start-wizard');
};

const handleToggleActive = () => {
  emit('toggle-active');
};

const handleDelete = () => {
  if (props.selectedRuleId) {
    emit('delete-rule', props.selectedRuleId);
  }
};

defineExpose({
  close
});
</script>

<style scoped lang="less">
.dropdown-container {
  position: relative;
  display: inline-flex;
}

.func-btn {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-surface-hover);
    color: var(--color-accent);
  }

  &.active {
    background: var(--bg-surface-active);
    color: var(--color-accent);
  }
}

.active-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success, #10b981);
  box-shadow: 0 0 0 1.5px var(--bg-surface);
}

.dropdown-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: transparent;
}

.waterfall-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 280px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: var(--shadow-soft);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeInDown 0.15s ease-out;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface-hover);

  .header-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .status-tag {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;

    &.active {
      background: rgba(16, 185, 129, 0.15);
      color: var(--color-success, #10b981);
    }

    &.idle {
      background: var(--border-light);
      color: var(--text-tertiary);
    }
  }
}

.dropdown-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;

  :deep(.v-input) {
    height: 32px;
    font-size: 12px;
  }
}

.no-rule-text {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 0;
}

.delete-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);

  &:hover {
    color: var(--color-error, #ef4444);
    border-color: var(--color-error, #ef4444);
    background: rgba(239, 68, 68, 0.08);
  }
}

.action-buttons-row {
  display: flex;
  align-items: center;
  gap: 8px;

  .action-btn {
    height: 32px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .stop-btn {
    color: var(--color-error, #ef4444);
    &:hover {
      background: rgba(239, 68, 68, 0.1);
    }
  }
}

.flex-1 {
  flex: 1;
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
