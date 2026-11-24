<template>
  <!-- Parse Rule Management Modal -->
  <div v-if="parseTarget" class="modal-overlay" v-overlay-close="closeParseManager">
    <div class="modal-content" style="max-width: 600px; width: 90vw;">
      <div class="modal-header">
        <h3>管理解析规则 - {{ parseTarget.name }}</h3>
        <v-button variant="icon" class="modal-close-btn" @click="closeParseManager">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>

      <div class="modal-body">
        <div v-if="!currentParseRules || currentParseRules.length === 0" class="empty-state">
          暂无已保存的解析规则。
        </div>
        <div v-else class="domain-list">
          <div v-for="rule in currentParseRules" :key="rule.id" class="domain-group">
            <div class="domain-title" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;">
              <span class="domain-name" style="font-size: 13px; font-weight: 500;">
                {{ rule.domain }} <span style="font-size: 12px; color: var(--color-accent); font-weight: normal;">({{ rule.actionType === 'download' ? '下载' : (rule.actionType === 'copy' ? '复制' : rule.actionType) }})</span>
              </span>
              <div style="display: flex; gap: 8px;">
                <v-button variant="secondary" class="shrink-0" @click="openParseEditor(rule)">
                  <VIcon name="edit" :size="14" />
                  <span>编辑</span>
                </v-button>
                <v-button variant="danger-soft" class="shrink-0" @click="deleteParseRule(rule)">
                  <VIcon name="trash" :size="14" />
                  <span>删除</span>
                </v-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Script Management Modal -->
  <div v-if="scriptTarget" class="modal-overlay" v-overlay-close="closeScriptManager">
    <div class="modal-content" style="max-width: 600px; width: 90vw;">
      <div class="modal-header">
        <h3>管理 JS 脚本 - {{ scriptTarget.name }}</h3>
        <v-button variant="icon" class="modal-close-btn" @click="closeScriptManager">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>

      <div class="modal-body">
        <div v-if="!currentScripts || currentScripts.length === 0" class="empty-state">
          暂无已保存的脚本规则。
        </div>
        <div v-else class="domain-list">
          <div v-for="script in currentScripts" :key="script.id" class="domain-group">
            <div class="domain-title" style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;">
              <span class="domain-name" style="text-align: left; opacity: 0.6; font-size: 11px;">匹配: {{ script.domain }}</span>
              <span class="domain-name" style="text-align: center;">{{ script.name }} <span style="font-size: 10px; opacity: 0.5;">({{ script.runAt }})</span></span>
              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <v-button variant="secondary" class="shrink-0" @click="openScriptEditor(script)">
                  <VIcon name="edit" :size="14" />
                  <span>编辑</span>
                </v-button>
                <v-button variant="danger-soft" class="shrink-0" @click="deleteScript(script)">
                  <VIcon name="trash" :size="14" />
                  <span>删除</span>
                </v-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Style Management Modal -->
  <div v-if="styleTarget" class="modal-overlay" v-overlay-close="closeStyleManager">
    <div class="modal-content">
      <div class="modal-header">
        <h3>管理样式 - {{ styleTarget.name }}</h3>
        <v-button variant="icon" class="modal-close-btn" @click="closeStyleManager">
          <VIcon name="close" :size="20" />
        </v-button>
      </div>

      <div class="modal-body">
        <div v-if="!currentStyles || Object.keys(currentStyles).length === 0" class="empty-state">
          暂无已保存的样式规则。
        </div>
        <div v-else class="domain-list">
          <div v-for="(cssString, domain) in currentStyles" :key="domain" class="domain-group">
            <div class="domain-title" style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;">
              <div></div>
              <span class="domain-name" style="text-align: center;">{{ domain }}</span>
              <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <v-button variant="secondary" class="shrink-0" @click="openStyleEditor(domain as string, cssString as string)">
                  <VIcon name="edit" :size="14" />
                  <span>编辑</span>
                </v-button>
                <v-button variant="danger-soft" class="shrink-0" @click="deleteDomainStyle(domain as string)">
                  <VIcon name="trash" :size="14" />
                  <span>删除</span>
                </v-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <SettingsScriptEditor
    v-model="scriptEditorVisible"
    :script="editingScript"
    @save="onSaveScript"
  />
  <SettingsStyleEditor
    v-model="styleEditorVisible"
    :domain="editingStyleDomain"
    :code="editingStyleCode"
    @save="onSaveStyle"
  />
  <ParseRuleDialog
    v-model="parseRuleDialogVisible"
    :resource-id="parseTarget?.id || ''"
    :editing-rule="editingParseRule"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  type CustomScript,
  type ParseRule,
  type ResourceItem,
  useSettings
} from '@/composables/useSettings';
import { useConfirm } from '@/composables/useConfirm';
import { useMessage } from '@/composables/useMessage';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import SettingsScriptEditor from '@/components/features/SettingsScriptEditor.vue';
import SettingsStyleEditor from '@/components/features/SettingsStyleEditor.vue';
import ParseRuleDialog from '@/components/features/ParseRuleDialog.vue';

const props = defineProps<{
  parseTarget: ResourceItem | null;
  scriptTarget: ResourceItem | null;
  styleTarget: ResourceItem | null;
}>();

const emit = defineEmits<{
  (e: 'close-parse'): void;
  (e: 'close-script'): void;
  (e: 'close-style'): void;
}>();

const {
  state,
  saveCustomStyles,
  saveCustomScripts,
  saveCustomParseRules
} = useSettings();
const { confirm } = useConfirm();
const { showMessage } = useMessage();

// Parse Rule Manager
const parseRuleDialogVisible = ref(false);
const editingParseRule = ref<ParseRule | null>(null);

const currentParseRules = computed(() => {
  if (!props.parseTarget) return [];
  return state.customParseRules[props.parseTarget.id] || [];
});

const closeParseManager = () => {
  emit('close-parse');
};

const openParseEditor = (rule: ParseRule) => {
  editingParseRule.value = rule;
  parseRuleDialogVisible.value = true;
};

const deleteParseRule = async (rule: ParseRule) => {
  if (!props.parseTarget) return;
  const confirmed = await confirm({
    title: '删除解析规则',
    message: `确定要删除匹配URL "${rule.domain}" (${rule.actionType === 'download' ? '下载' : '复制'}) 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const resId = props.parseTarget.id;
  const rules = (state.customParseRules[resId] || []).filter(r => r.id !== rule.id);
  const updatedAll = {
    ...state.customParseRules,
    [resId]: rules
  };
  await saveCustomParseRules(updatedAll);
  showMessage({ text: '解析规则删除成功', type: 'success' });
};

// Script Manager
const currentScripts = computed(() => {
  if (!props.scriptTarget) return [];
  return state.customScripts[props.scriptTarget.id] || [];
});

const closeScriptManager = () => {
  emit('close-script');
};

const scriptEditorVisible = ref(false);
const editingScript = ref<CustomScript | undefined>(undefined);
const editingOriginalId = ref('');
const editingOriginalDomain = ref('');

const openScriptEditor = (script: CustomScript) => {
  if (!script.id) {
    script.id = 'script_' + Date.now() + Math.random().toString(36).slice(2, 6);
  }
  editingOriginalId.value = script.id;
  editingOriginalDomain.value = script.domain || '';
  editingScript.value = { ...script };
  scriptEditorVisible.value = true;
};

const onSaveScript = async (updatedScript: CustomScript) => {
  if (!props.scriptTarget) return;
  const resId = props.scriptTarget.id;
  const allScripts = { ...state.customScripts };
  if (!allScripts[resId]) {
    allScripts[resId] = [];
  }
  const targetArray = [...allScripts[resId]];
  const trimmedDomain = (updatedScript.domain || '').trim();
  const scriptId = updatedScript.id || editingOriginalId.value;
  updatedScript.id = scriptId;
  updatedScript.domain = trimmedDomain;

  // 检查是否修改了匹配URL
  const isDomainChanged = editingOriginalDomain.value.trim() !== '' && trimmedDomain !== editingOriginalDomain.value.trim();

  // 1. 只有当修改了匹配URL时，才检查新URL是否与其他已有脚本冲突
  if (isDomainChanged) {
    const duplicateScript = targetArray.find(s => s.id !== scriptId && (s.domain || '').trim() === trimmedDomain);

    if (duplicateScript) {
      const isConfirmed = await confirm({
        title: '匹配URL重复',
        message: `已存在相同匹配URL的脚本 "${duplicateScript.name || duplicateScript.domain}"，是否合并脚本内容？`,
        confirmText: '合并',
        cancelText: '取消',
        type: 'warning'
      });

      if (!isConfirmed) return;

      // 合并脚本内容
      duplicateScript.code = (duplicateScript.code || '').trim() + '\n\n' + (updatedScript.code || '').trim();
      if (updatedScript.name && !duplicateScript.name.includes(updatedScript.name)) {
        duplicateScript.name = duplicateScript.name ? `${duplicateScript.name} & ${updatedScript.name}` : updatedScript.name;
      }
      // 移除原本的脚本项（已合并入 duplicateScript）
      const curIdx = targetArray.findIndex(s => s.id === scriptId);
      if (curIdx !== -1) {
        targetArray.splice(curIdx, 1);
      }

      allScripts[resId] = targetArray;
      await saveCustomScripts(allScripts);
      showMessage('脚本已成功合并保存！', 'success');
      scriptEditorVisible.value = false;
      return;
    }
  }

  // 2. 没有修改域名，或修改后无域名冲突：直接在当前脚本上保存修改
  let existingIdx = targetArray.findIndex(s => s.id === scriptId);
  if (existingIdx === -1 && editingOriginalId.value) {
    existingIdx = targetArray.findIndex(s => s.id === editingOriginalId.value);
  }
  if (existingIdx === -1 && editingOriginalDomain.value) {
    existingIdx = targetArray.findIndex(s => (s.domain || '').trim() === editingOriginalDomain.value.trim());
  }

  if (existingIdx !== -1) {
    targetArray[existingIdx] = { ...updatedScript };
  } else {
    targetArray.push({ ...updatedScript });
  }

  allScripts[resId] = targetArray;
  await saveCustomScripts(allScripts);
  showMessage('脚本保存成功', 'success');
  scriptEditorVisible.value = false;
};

const deleteScript = async (script: any) => {
  if (!props.scriptTarget) return;
  const isOk = await confirm({
    title: '删除脚本',
    message: `确认删除脚本 "${script.name}" 吗？`,
    type: 'danger',
    confirmText: '删除'
  });

  if (isOk) {
    const scriptsObj = { ...state.customScripts };
    const arr = scriptsObj[props.scriptTarget.id] || [];
    const idx = arr.findIndex((s: any) => s.id === script.id);
    if (idx !== -1) {
      arr.splice(idx, 1);
      scriptsObj[props.scriptTarget.id] = arr;
      await saveCustomScripts(scriptsObj);
      showMessage('脚本已删除', 'success');
    }
  }
};

// Style Manager
const styleEditorVisible = ref(false);
const editingStyleDomain = ref('');
const editingStyleCode = ref('');

const closeStyleManager = () => {
  emit('close-style');
};

const currentStyles = computed(() => {
  if (!props.styleTarget) return null;
  return state.customStyles[props.styleTarget.id] || {};
});

const openStyleEditor = (domain: string, code: string) => {
  editingStyleDomain.value = domain;
  editingStyleCode.value = code;
  styleEditorVisible.value = true;
};

const onSaveStyle = ({ oldDomain, newDomain, code }: { oldDomain?: string; newDomain: string; code: string }) => {
  const allStyles = { ...state.customStyles };

  if (oldDomain && oldDomain !== newDomain) {
    delete allStyles[oldDomain];
  }

  if (code.trim()) {
    allStyles[newDomain] = { 'default': code };
  } else {
    delete allStyles[newDomain];
  }

  saveCustomStyles(allStyles);
  showMessage('自定义样式保存成功', 'success');
};

const deleteDomainStyle = async (domain: string) => {
  if (!props.styleTarget) return;
  const isOk = await confirm({
    title: '删除规则',
    message: `确认删除 ${domain} 的所有自定义样式吗？`,
    type: 'danger',
    confirmText: '删除'
  });

  if (isOk) {
    const resourceId = props.styleTarget.id;
    const newStyles = { ...state.customStyles };
    if (newStyles[resourceId] && newStyles[resourceId][domain]) {
      delete newStyles[resourceId][domain];
      await saveCustomStyles(newStyles);
      showMessage('自定义样式已删除', 'success');
    }
  }
};
</script>
