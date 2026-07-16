<template>
  <div v-if="modelValue" class="inspector-dialog" :style="{ top: position.y + 'px', left: position.x + 'px' }">
    <div class="inspector-header" @mousedown="startDrag">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
          </path>
        </svg>
        样式注入器
      </div>
      <div class="header-actions">
        <button class="action-btn close-btn" @click="close" title="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="inspector-content">
      <div class="inspector-content-inner">
        <div class="inspector-body">
          <div class="info-row domain-info" style="align-items: center;">
            <span class="label">匹配规则</span>
            <div style="display: flex; flex: 1; align-items: center; margin-left: 12px; position: relative;">
              <input v-model="domain" class="mono-input value-input" spellcheck="false" style="flex: 1; font-size: 11px; padding: 4px 6px;" />
              <div class="dropdown" v-click-outside="closeDropdown" style="margin-left: 8px;">
                <button class="text-btn" @click="dropdownOpen = !dropdownOpen">历史规则 ▼</button>
                <div v-if="dropdownOpen" class="dropdown-menu">
                  <div v-if="!domainRules || Object.keys(domainRules).length === 0" class="dropdown-empty">暂无保存的样式</div>
                  <div v-for="(cssString, ruleDomain) in domainRules" :key="ruleDomain" class="dropdown-item">
                    <span class="dropdown-text" @click="loadRule(ruleDomain as string, cssString as string)">{{ ruleDomain }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: column; flex: 1;">
            <div class="label-row" style="margin-bottom: 8px;">
              <label>自定义 CSS 样式</label>
            </div>
            <div class="editor-wrapper" ref="editorContainer" style="flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #fff; min-height: 280px; display: flex; flex-direction: column;">
              <!-- CodeMirror will attach here -->
            </div>
          </div>
        </div>

        <div class="inspector-footer">
          <button class="btn btn-secondary" @click="close">取消</button>
          <button class="btn btn-primary" @click="save">保存规则</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { css } from '@codemirror/lang-css';
import { EditorState, EditorSelection } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';

const props = defineProps<{
  modelValue: boolean;
  url?: string;
  domainRules?: Record<string, string>;
}>();

const emit = defineEmits(['update:modelValue', 'applyPreview', 'save', 'interaction-start', 'interaction-end']);

const dropdownOpen = ref(false);
const domain = ref('');
const position = ref({ x: 100, y: 100 });
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

const editorContainer = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;
let currentCss = '';

const closeDropdown = () => { dropdownOpen.value = false; };

const vClickOutside = {
  mounted(el: any, binding: any) {
    el.clickOutsideEvent = function (event: Event) {
      if (!(el == event.target || el.contains(event.target))) {
        binding.value(event, el);
      }
    };
    document.body.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el: any) {
    document.body.removeEventListener('click', el.clickOutsideEvent);
  }
};

const updatePreview = () => {
  emit('applyPreview', currentCss);
};

const autoImportantExtension = keymap.of([
  {
    key: ";",
    run: (view) => {
      const { state } = view;
      let handled = false;
      const changes = state.changeByRange(range => {
        if (!range.empty) return { range };
        let node = syntaxTree(state).resolveInner(range.head, -1);
        let isProp = false;
        while (node) {
          if (node.name === 'Declaration' || node.name === 'PropertyValue') { isProp = true; break; }
          if (node.name === 'Block') break;
          node = node.parent;
        }
        if (isProp) {
          const line = state.doc.lineAt(range.head);
          const textBefore = line.text.slice(0, range.head - line.from);
          if (!/!important\s*$/.test(textBefore)) {
            handled = true;
            return {
              changes: { from: range.head, insert: " !important;" },
              range: EditorSelection.cursor(range.head + 12)
            };
          }
        }
        return { range };
      });
      if (handled) {
        view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
        return true;
      }
      return false;
    }
  },
  {
    key: "Enter",
    run: (view) => {
      const { state } = view;
      let handled = false;
      const changes = state.changeByRange(range => {
        if (!range.empty) return { range };
        let node = syntaxTree(state).resolveInner(range.head, -1);
        let isProp = false;
        while (node) {
          if (node.name === 'Declaration' || node.name === 'PropertyValue') { isProp = true; break; }
          if (node.name === 'Block') break;
          node = node.parent;
        }
        if (isProp) {
          const line = state.doc.lineAt(range.head);
          const textBefore = line.text.slice(0, range.head - line.from);
          if (!/!important\s*;?\s*$/.test(textBefore)) {
            handled = true;
            return {
              changes: { from: range.head, insert: " !important;" },
              range: EditorSelection.cursor(range.head + 12)
            };
          }
        }
        return { range };
      });
      if (handled) {
        view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
        insertNewlineAndIndent(view);
        return true;
      }
      return false;
    }
  }
]);

const initEditor = (initialContent: string) => {
  if (editorView) {
    editorView.destroy();
  }
  if (!editorContainer.value) return;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      currentCss = update.state.doc.toString();
      updatePreview();
    }
  });

  editorView = new EditorView({
    state: EditorState.create({
      doc: initialContent,
      extensions: [
        basicSetup,
        css(),
        keymap.of([indentWithTab, ...defaultKeymap]),
        autoImportantExtension,
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
    let initialDomain = '*://*/*';
    try {
      if (props.url) {
        const urlObj = new URL(props.url);
        const host = urlObj.hostname.replace(/^www\./, '');
        initialDomain = `*://*.${host}${urlObj.pathname}`;
      }
    } catch (e) {}

    domain.value = initialDomain;
    dropdownOpen.value = false;
    currentCss = '';

    if (props.domainRules && props.domainRules[domain.value]) {
      currentCss = props.domainRules[domain.value];
    }

    const dialogW = 420;
    const dialogH = 480;
    const sidebarW = 220;
    const titlebarH = 32;
    position.value = {
      x: sidebarW + (window.innerWidth - sidebarW - dialogW) / 2,
      y: titlebarH + (window.innerHeight - titlebarH - dialogH) / 2
    };

    await nextTick();
    initEditor(currentCss);
    updatePreview();
  } else {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
  }
});

const loadRule = (ruleDomain: string, cssString: string) => {
  domain.value = ruleDomain;
  currentCss = cssString;
  dropdownOpen.value = false;
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: cssString }
    });
  }
};

const save = () => {
  emit('save', domain.value, currentCss);
  emit('update:modelValue', false);
};

const close = () => {
  emit('applyPreview', '');
  emit('update:modelValue', false);
};

const startDrag = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.action-btn')) return;
  isDragging = true;
  dragOffset.x = e.clientX - position.value.x;
  dragOffset.y = e.clientY - position.value.y;
  emit('interaction-start');
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging) return;
  let newX = e.clientX - dragOffset.x;
  let newY = e.clientY - dragOffset.y;
  const dialogW = 420;
  const dialogH = 480;
  if (newX < 0) newX = 0;
  if (newY < 0) newY = 0;
  if (newX + dialogW > window.innerWidth) newX = window.innerWidth - dialogW;
  if (newY + dialogH > window.innerHeight) newY = window.innerHeight - dialogH;
  position.value = { x: newX, y: newY };
};

const stopDrag = () => {
  isDragging = false;
  emit('interaction-end');
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};
</script>

<style scoped>
.inspector-dialog {
  position: fixed;
  width: 420px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
}

.inspector-header {
  height: 36px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
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
  color: #334155;
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
  color: #64748b;
  cursor: pointer;
}

.action-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.action-btn.close-btn:hover {
  background: #fee2e2;
  color: #ef4444;
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
  color: #64748b;
  width: 55px;
  flex-shrink: 0;
}

.value-input {
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  outline: none;
  color: #334155;
}

.value-input:focus {
  border-color: #3b82f6;
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
  color: #334155;
}

.text-btn {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.text-btn:hover {
  background: #eff6ff;
}

.inspector-footer {
  padding: 12px 16px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-secondary {
  background: transparent;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.btn-secondary:hover {
  background: #f1f5f9;
}

.btn-primary {
  background: #3b82f6;
  color: #ffffff;
}

.btn-primary:hover {
  background: #2563eb;
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  min-width: 150px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
}

.dropdown-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
}

.dropdown-item:hover {
  background: #f8fafc;
}

.dropdown-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
