<template>
  <div v-if="modelValue" class="inspector-dialog" :style="{ top: position.y + 'px', left: position.x + 'px' }">
    <div class="inspector-header" @mousedown="startDrag">
      <div class="header-title">
        <VIcon name="css" :size="14" style="margin-right: 6px;" />
        样式注入器
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
            <span class="label">匹配URL<span class="required-star">*</span></span>
            <VInputSelect
              v-model="domain"
              placeholder="匹配URL，例如: www.bilibili.com 或 www.bilibili.com/list"
              :options="historyRuleOptions"
              class="mono-input value-input flex-1"
              style="margin-left: 12px;"
              @select="onRuleDomainChange"
            />
          </div>

          <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: column; flex: 1;">
            <div class="label-row" style="margin-bottom: 8px;">
              <label>自定义 CSS 样式<span class="required-star">*</span></label>
            </div>
            <div class="editor-wrapper" ref="editorContainer" style="flex: 1; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-surface); min-height: 280px; display: flex; flex-direction: column;">
              <!-- CodeMirror will attach here -->
            </div>
          </div>
        </div>

        <div class="inspector-footer">
          <v-button
            v-if="isEditingExisting"
            variant="danger"
            class="btn"
            style="margin-right: auto;"
            @click="deleteCurrentStyle"
          >
            删除
          </v-button>
          <v-button variant="secondary" class="btn" @click="close">取消</v-button>
          <v-button variant="primary" class="btn" @click="save">保存</v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VInputSelect, { type InputSelectOption } from '@/components/base/VInputSelect.vue';
import type { SyntaxNode } from '@lezer/common';
import { EditorView, basicSetup } from 'codemirror';
import { css } from '@codemirror/lang-css';
import { EditorState, EditorSelection } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';

import { useDraggableDialog } from '@/composables/useDraggableDialog';
import { useConfirm } from '@/composables/useConfirm';
import { getDefaultUrlPattern, isUrlMatchPattern } from '@/utils/urlMatcher';

const props = defineProps<{
  modelValue: boolean;
  url?: string;
  domainRules?: Record<string, string>;
}>();

const emit = defineEmits(['update:modelValue', 'applyPreview', 'save', 'delete', 'interaction-start', 'interaction-end']);

const { confirm } = useConfirm();

const domain = ref('');
const { position, startDrag, resetPosition } = useDraggableDialog({
  dialogWidth: 420,
  dialogHeight: 480,
  onInteractionStart: () => emit('interaction-start'),
  onInteractionEnd: () => emit('interaction-end')
});

const isEditingExisting = computed(() => {
  const d = domain.value.trim();
  return !!(d && props.domainRules && props.domainRules[d] !== undefined);
});

const editorContainer = ref<HTMLElement | null>(null);
let editorView: EditorView | null = null;
let currentCss = '';

const historyRuleOptions = computed<InputSelectOption[]>(() => {
  if (!props.domainRules) return [];
  return Object.keys(props.domainRules).map(ruleDomain => ({
    label: ruleDomain,
    value: ruleDomain
  }));
});

const onRuleDomainChange = (newDomain: string) => {
  domain.value = newDomain;
  if (props.domainRules && props.domainRules[newDomain] !== undefined) {
    loadRule(newDomain, props.domainRules[newDomain]);
  } else {
    currentCss = '';
    if (editorView) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: '' }
      });
    }
    updatePreview();
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
        let node: SyntaxNode | null = syntaxTree(state).resolveInner(range.head, -1);
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
        let node: SyntaxNode | null = syntaxTree(state).resolveInner(range.head, -1);
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

const autoLoadOrNewStyle = (availableDomainRules?: Record<string, string>) => {
  const rulesMap = availableDomainRules !== undefined ? availableDomainRules : (props.domainRules || {});
  const domainKeys = Object.keys(rulesMap);
  if (domainKeys.length > 0 && props.url) {
    const matchedDomain = domainKeys.find(d => isUrlMatchPattern(d, props.url!));
    if (matchedDomain) {
      loadRule(matchedDomain, rulesMap[matchedDomain]);
      updatePreview();
      return;
    }
  }
  domain.value = getDefaultUrlPattern(props.url);
  currentCss = '';
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: '' }
    });
  }
  updatePreview();
};

watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    resetPosition();
    autoLoadOrNewStyle();
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
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: cssString }
    });
  }
};

const deleteCurrentStyle = async () => {
  const d = domain.value.trim();
  if (!d) return;
  const confirmed = await confirm({
    title: '删除样式',
    message: `确定要删除匹配 "${d}" 的自定义样式吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  emit('delete', d);
  const updatedDomainRules = { ...(props.domainRules || {}) };
  delete updatedDomainRules[d];
  autoLoadOrNewStyle(updatedDomainRules);
};

const save = () => {
  emit('save', domain.value, currentCss);
  emit('update:modelValue', false);
};

const close = () => {
  emit('applyPreview', '');
  emit('update:modelValue', false);
};
</script>

<style scoped>
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
  width: 68px;
  min-width: 68px;
  max-width: 68px;
  flex-shrink: 0;
  line-height: 28px;
  white-space: nowrap;
  display: inline-block;
  user-select: none;
}

.required-star {
  color: var(--color-error, #ef4444);
  margin-left: 2px;
  font-weight: bold;
  display: inline-block;
  white-space: nowrap;
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
  white-space: nowrap;
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

/* Styled by custom VButton component */

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
