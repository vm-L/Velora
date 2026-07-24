<template>
  <div v-if="modelValue" class="editor-overlay" @click.self="close">
    <div class="editor-modal">
      <div class="editor-header">
        <h3>编辑 CSS 样式</h3>
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
            <label>匹配域名</label>
            <v-input v-model="editDomain" placeholder="如 bilibili.com 或 *" />
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
import { css } from '@codemirror/lang-css';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';

const props = defineProps<{
  modelValue: boolean;
  domain?: string;
  code?: string;
}>();

const emit = defineEmits(['update:modelValue', 'save']);

const editorContainer = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;

const editDomain = ref('');
const editCode = ref('');

watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    editDomain.value = props.domain || '';
    editCode.value = props.code || '';
    
    await nextTick();
    if (editorContainer.value) {
      if (editorView) {
        editorView.destroy();
      }
      editorView = new EditorView({
        state: EditorState.create({
          doc: editCode.value,
          extensions: [
            basicSetup,
            keymap.of([indentWithTab, ...defaultKeymap]),
            css(),
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
    editCode.value = editorView.state.doc.toString();
  }
  emit('save', { oldDomain: props.domain, newDomain: editDomain.value, code: editCode.value });
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
