<template>
  <div v-if="modelValue" class="inspector-dialog" :style="{ top: position.y + 'px', left: position.x + 'px' }">
    <div class="inspector-header" @mousedown="startDrag">
      <div class="header-title">
        <VIcon name="js" :size="14" style="margin-right: 6px;" />
        JS 注入器
      </div>
      <div class="header-actions">
        <v-button variant="secondary" size="small" style="padding: 2px 4px; min-width: unset;" @click="close" title="关闭">
          <VIcon name="close" :size="12" />
        </v-button>
      </div>
    </div>

    <div class="inspector-content">
      <div class="inspector-content-inner">
        <div class="inspector-body">
          <div class="info-row domain-info" style="align-items: center;">
            <span class="label">匹配URL</span>
            <VInputSelect
              v-model="currentScript.domain"
              placeholder="匹配URL，例如: *://*.bilibili.com/*"
              :options="historyScriptOptions"
              class="mono-input value-input flex-1"
              style="margin-left: 12px;"
              @select="onScriptDomainChange"
            />
          </div>
          
          <div class="info-row" style="align-items: center;">
            <span class="label">脚本名称</span>
            <v-input v-model="currentScript.name" class="value-input flex-1" style="margin-left: 12px;" placeholder="例如: 屏蔽广告" />
          </div>
          
          <div class="info-row" style="align-items: center;">
            <span class="label">执行时机</span>
            <VInputSelect
              v-model="currentScript.runAt"
              :options="runAtOptions"
              :allow-input="false"
              class="value-input flex-1"
              style="margin-left: 12px;"
            />
          </div>

          <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: column; flex: 1;">
            <div class="label-row" style="margin-bottom: 8px;">
              <label>自定义 JS 脚本</label>
              <v-button variant="text" class="text-btn" @click="updatePreview">▶ 立刻执行</v-button>
            </div>
            <div class="editor-wrapper" ref="editorContainer" style="flex: 1; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-surface); min-height: 230px; display: flex; flex-direction: column;">
              <!-- CodeMirror will attach here -->
            </div>
          </div>
        </div>

        <div class="inspector-footer">
          <v-button variant="secondary" class="btn" @click="close">取消</v-button>
          <v-button variant="primary" class="btn" @click="save">保存脚本</v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, reactive } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VInput from '@/components/base/VInput.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';

const runAtOptions = [
  { value: 'document-start', label: 'document-start (尽早)' },
  { value: 'dom-ready', label: 'dom-ready (DOM加载完毕)' },
  { value: 'document-end', label: 'document-end (资源加载完毕)' }
];
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import type { CustomScript } from '@/composables/useSettings';
import { useDraggableDialog } from '@/composables/useDraggableDialog';
import { getDefaultUrlPattern } from '@/utils/urlMatcher';

const props = defineProps<{
  modelValue: boolean;
  url?: string;
  scripts?: CustomScript[];
}>();

const emit = defineEmits(['update:modelValue', 'executeScript', 'save', 'interaction-start', 'interaction-end']);

const { position, startDrag } = useDraggableDialog({
  initialX: 100,
  initialY: 100,
  dialogWidth: 420,
  dialogHeight: 480,
  onInteractionStart: () => emit('interaction-start'),
  onInteractionEnd: () => emit('interaction-end')
});

const editorContainer = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;

const currentScript = reactive<CustomScript>({
  id: '',
  name: '',
  domain: '',
  code: '',
  runAt: 'dom-ready'
});

const historyScriptOptions = computed<InputSelectOption[]>(() => {
  if (!props.scripts) return [];
  return props.scripts.map(s => ({
    label: s.name ? `${s.name} (${s.domain})` : s.domain,
    value: s.domain
  }));
});

const onScriptDomainChange = (newDomain: string) => {
  currentScript.domain = newDomain;
  const targetScript = props.scripts?.find(s => s.domain === newDomain);
  if (targetScript) {
    loadScript(targetScript);
  } else {
    currentScript.id = 'script_' + Date.now();
    currentScript.name = '';
    currentScript.code = '';
    currentScript.runAt = 'dom-ready';
    if (editorView) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '' }
      });
    }
  }
};

const updatePreview = () => {
  if (currentScript.code) {
    emit('executeScript', currentScript.code);
  }
};

const initEditor = (initialContent: string) => {
  if (editorView) {
    editorView.destroy();
  }
  if (!editorContainer.value) return;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      currentScript.code = update.state.doc.toString();
    }
  });

  editorView = new EditorView({
    state: EditorState.create({
      doc: initialContent,
      extensions: [
        basicSetup,
        javascript(),
        keymap.of([indentWithTab, ...defaultKeymap]),
        updateListener,
        EditorView.theme({
          "&": { flex: 1, fontSize: "12px", fontFamily: "ui-monospace, monospace" },
          ".cm-scroller": { overflow: "auto" }
        })
      ]
    }),
    parent: editorContainer.value
  });
};

watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    const initialDomain = getDefaultUrlPattern(props.url);
    const existingScript = props.scripts?.find(s => s.domain === initialDomain);

    if (existingScript) {
      currentScript.id = existingScript.id;
      currentScript.domain = existingScript.domain;
      currentScript.name = existingScript.name;
      currentScript.code = existingScript.code;
      currentScript.runAt = existingScript.runAt;
    } else {
      currentScript.id = 'script_' + Date.now();
      currentScript.domain = initialDomain;
      currentScript.name = '';
      currentScript.code = '';
      currentScript.runAt = 'dom-ready';
    }

    const dialogW = 420;
    const dialogH = 480;
    const sidebarW = 220;
    const titlebarH = 32;
    position.value = {
      x: sidebarW + (window.innerWidth - sidebarW - dialogW) / 2 + 30,
      y: titlebarH + (window.innerHeight - titlebarH - dialogH) / 2 + 30
    };

    await nextTick();
    initEditor(currentScript.code);
  } else {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
  }
});

const loadScript = (script: CustomScript) => {
  currentScript.id = script.id;
  currentScript.domain = script.domain;
  currentScript.name = script.name;
  currentScript.code = script.code;
  currentScript.runAt = script.runAt;
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: script.code }
    });
  }
};

const save = () => {
  emit('save', { ...currentScript });
};

const close = () => {
  emit('update:modelValue', false);
};
</script>

<style scoped>
/* Inherit standard styles from InspectorDialog */
.inspector-dialog {
  position: fixed;
  width: 420px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
}

.inspector-header {
  height: 36px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  cursor: move;
  user-select: none;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.action-btn:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.action-btn.close-btn:hover {
  background: var(--color-error, #ef4444);
  color: white;
}

.inspector-content {
  display: flex;
  flex-direction: column;
}

.inspector-content-inner {
  display: flex;
  flex-direction: column;
}

.inspector-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.info-row {
  display: flex;
  margin-bottom: 12px;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  width: 55px;
  flex-shrink: 0;
}

.value-input {
  outline: none;
  color: var(--text-primary);
}

.value-input:focus {
  border-color: var(--color-accent);
}

.mono-input {
  font-family: ui-monospace, monospace;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-row label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.text-btn {
  background: transparent;
  border: none;
  color: var(--color-accent);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.text-btn:hover {
  background: var(--bg-surface-active);
}

.inspector-footer {
  padding: 12px 16px;
  background: var(--bg-surface-hover);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Dropdown */
.dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
  min-width: 150px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
}

.dropdown-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.dropdown-item:hover {
  background: var(--bg-surface-hover);
}

.dropdown-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
