<template>
  <div v-if="modelValue" class="editor-overlay" @click.self="close">
    <div class="editor-modal">
      <div class="editor-header">
        <h3>编辑 JS 脚本</h3>
        <v-button variant="icon" @click="close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </v-button>
      </div>
      
      <div class="editor-body">
        <div class="config-row">
          <div class="config-item">
            <label>脚本名称</label>
            <v-input v-model="editScript.name" placeholder="例如：去广告脚本" />
          </div>
          <div class="config-item">
            <label>匹配域名</label>
            <v-input v-model="editScript.domain" placeholder="如 bilibili.com 或 *" />
          </div>
          <div class="config-item">
            <label>执行时机</label>
            <select v-model="editScript.runAt" class="run-at-select">
              <option value="document-start">加载最前 (document-start)</option>
              <option value="dom-ready">DOM就绪 (dom-ready)</option>
              <option value="document-end">加载完毕 (document-end)</option>
            </select>
          </div>
        </div>
        
        <div class="editor-container" ref="editorContainer"></div>
      </div>
      
      <div class="editor-footer">
        <v-button variant="secondary" @click="close">取消</v-button>
        <v-button variant="primary" @click="save">保存更改</v-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import VButton from '../base/VButton.vue';
import VInput from '../base/VInput.vue';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import type { CustomScript } from '../../composables/useSettings';

const props = defineProps<{
  modelValue: boolean;
  script?: CustomScript;
}>();

const emit = defineEmits(['update:modelValue', 'save']);

const editorContainer = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;

const editScript = ref<CustomScript>({
  id: '',
  name: '',
  domain: '',
  code: '',
  runAt: 'dom-ready'
});

watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    if (props.script) {
      editScript.value = { ...props.script };
    } else {
      editScript.value = { id: '', name: '', domain: '', code: '', runAt: 'dom-ready' };
    }
    
    await nextTick();
    if (editorContainer.value) {
      if (editorView) {
        editorView.destroy();
      }
      editorView = new EditorView({
        state: EditorState.create({
          doc: editScript.value.code,
          extensions: [
            basicSetup,
            keymap.of([indentWithTab, ...defaultKeymap]),
            javascript(),
            EditorView.theme({
              "&": { height: "100%", fontSize: "13px" },
              ".cm-scroller": { overflow: "auto" }
            })
          ]
        }),
        parent: editorContainer.value
      });
    }
  } else {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
  }
});

onBeforeUnmount(() => {
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
});

const close = () => {
  emit('update:modelValue', false);
};

const save = () => {
  if (editorView) {
    editScript.value.code = editorView.state.doc.toString();
  }
  emit('save', { ...editScript.value });
  close();
};
</script>

<style scoped>
.editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.editor-modal {
  width: 80vw;
  height: 80vh;
  max-width: 900px;
  background: var(--bg-surface);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 32px rgba(0,0,0,0.2);
  border: 1px solid var(--border-color);
  overflow: hidden;
}
.editor-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.editor-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.editor-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  overflow: hidden;
  gap: 16px;
}
.config-row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
}
.config-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.config-item label {
  font-size: 12px;
  color: var(--text-secondary);
}
.run-at-select {
  height: 32px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}
.editor-container {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
@media (prefers-color-scheme: dark) {
  .editor-container {
    background: #1e1e1e;
  }
}
.editor-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--bg-surface-hover);
}
</style>
