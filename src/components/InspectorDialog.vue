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
        <button class="action-btn" @click="isCollapsed = !isCollapsed" :title="isCollapsed ? '展开' : '收起'">
          <svg v-if="isCollapsed" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="action-btn close-btn" @click="close" title="取消">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>

    <div class="inspector-content" :class="{ 'is-collapsed': isCollapsed }">
      <div class="inspector-content-inner">
        <div class="inspector-body">
          <div class="info-row domain-info" style="align-items: center;">
            <span class="label">匹配规则</span>
            <input v-model="domain" class="mono-input value-input" spellcheck="false" style="flex: 1; margin-left: 12px; font-size: 11px; padding: 4px 6px;" />
          </div>

          <div class="form-group">
            <div class="label-row">
              <label>CSS 选择器</label>
              <button class="text-btn" @click="handleRepick">重新选择</button>
            </div>
            <input type="text" v-model="localSelector" class="mono-input" @input="updatePreviewImmediate"
              @wheel="handleSelectorWheel"
              placeholder=".class-name, #id" />
            <div class="help-text" style="margin-top: 4px;">输入框滚动滚轮切换选择器范围</div>
          </div>

          <div class="form-group" style="margin-top: 12px;">
            <div class="label-row">
              <label>自定义 CSS 样式规则</label>
              <div class="dropdown" v-click-outside="closeDropdown">
                <button class="text-btn" @click="dropdownOpen = !dropdownOpen">沿用样式 ▼</button>
                <div v-if="dropdownOpen" class="dropdown-menu">
                  <div v-if="!domainRules || domainRules.length === 0" class="dropdown-empty">暂无保存的样式</div>
                  <div v-for="(rule, idx) in domainRules" :key="idx" class="dropdown-item">
                    <span class="dropdown-text" @click="applyRule(rule)" :title="rule.css">{{ rule.selector }}</span>
                    <button class="del-btn" @click.stop="confirmDelete(rule)" title="删除">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="textarea-wrapper" style="position: relative;">
              <textarea
                v-model="localCss"
                class="mono-input css-textarea"
                @input="onTextareaInput"
                @keydown="handleTextareaKeydown"
                @blur="onTextareaBlur"
                placeholder="例如：display: none; color: red;"
                style="width: 100%; box-sizing: border-box;"
              ></textarea>
              
              <!-- Suggestions Dropdown -->
              <div v-if="showSuggestions && suggestions.length > 0" class="autocomplete-dropdown">
                <div
                  v-for="(item, idx) in suggestions"
                  :key="idx"
                  class="autocomplete-item"
                  :class="{ active: idx === activeSuggestionIndex }"
                  @mousedown.prevent="selectSuggestion(item)"
                >
                  <span class="ac-label">{{ item }}</span>
                  <span class="ac-desc">{{ activeQuery?.type === 'property' ? '属性' : '推荐值' }}</span>
                </div>
              </div>
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
import { ref, watch, onUnmounted } from 'vue';
import { useConfirm } from '../composables/useConfirm';

const { confirm } = useConfirm();

const props = defineProps<{
  modelValue: boolean;
  selector: string;
  url: string;
  domainRules?: { selector: string, css: string; }[];
}>();

const emit = defineEmits(['update:modelValue', 'applyPreview', 'save', 'repick', 'deleteRule', 'interaction-start', 'interaction-end', 'traverseSelector']);

const isCollapsed = ref(false);
const dropdownOpen = ref(false);

const localSelector = ref('');
const localCss = ref('');
const domain = ref('');

const position = ref({ x: 100, y: 100 });
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// CSS Autocomplete & Visual Designer states
const cssDict: Record<string, string[]> = {
  'display': ['none', 'block', 'inline-block', 'flex', 'grid', 'inline'],
  'pointer-events': ['none', 'auto', 'initial', 'inherit'],
  'opacity': ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1'],
  'position': ['relative', 'absolute', 'fixed', 'sticky', 'static'],
  'z-index': ['-1', '0', '1', '10', '100', '9999', '2147483647'],
  'visibility': ['hidden', 'visible', 'collapse'],
  'color': ['transparent', 'red', 'blue', 'green', 'white', 'black'],
  'background-color': ['transparent', '#ffffff', '#000000', '#f3f4f6'],
  'width': ['auto', '0', '100%', '50%', '100vw'],
  'height': ['auto', '0', '100%', '50%', '100vh'],
  'overflow': ['hidden', 'auto', 'scroll', 'visible'],
  'filter': ['blur(4px)', 'blur(8px)', 'grayscale(100%)', 'none']
}

const showSuggestions = ref(false)
const suggestions = ref<string[]>([])
const activeSuggestionIndex = ref(0)
const activeQuery = ref<any>(null)

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

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    localSelector.value = props.selector;
    try {
      const urlObj = new URL(props.url);
      const host = urlObj.hostname.replace(/^www\./, '');
      domain.value = `*://*.${host}/*`;
    } catch (e) {
      domain.value = '*://*/*';
    }
    localCss.value = '';
    isCollapsed.value = false;
    dropdownOpen.value = false;

    // Position in the center of the content area
    // Approximate: sidebar ~220px wide, titlebar ~32px tall, dialog ~320px wide, ~400px tall
    const dialogW = 320;
    const dialogH = 400;
    const sidebarW = 220;
    const titlebarH = 32;
    position.value = {
      x: sidebarW + (window.innerWidth - sidebarW - dialogW) / 2,
      y: titlebarH + (window.innerHeight - titlebarH - dialogH) / 2
    };

    // Trigger preview immediately when dialog opens
    updatePreviewImmediate();
  }
});

watch(() => props.selector, (newVal) => {
  if (props.modelValue) {
    localSelector.value = newVal;
    updatePreviewImmediate();
  }
});

const handleSelectorWheel = (e: WheelEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const direction = e.deltaY < 0 ? 'up' : 'down';
  emit('traverseSelector', direction);
};

const handleRepick = () => {
  emit('applyPreview', '', '', false);
  emit('update:modelValue', false);
  emit('repick');
};

const applyRule = (rule: { selector: string, css: string; }) => {
  localCss.value = (localCss.value ? localCss.value + '\n' : '') + rule.css;
  dropdownOpen.value = false;
  updatePreview();
};

const confirmDelete = async (rule: { selector: string; }) => {
  const isOk = await confirm({
    title: '删除规则',
    message: '是否确认删除此规则',
    type: 'danger',
    confirmText: '删除'
  });
  if (isOk) {
    if (props.url) {
      const domain = new URL(props.url).hostname;
      emit('deleteRule', domain, rule.selector);
      dropdownOpen.value = false;
    }
  }
};

const deduplicateCss = () => {
  if (!localCss.value) return;

  const rawCss = localCss.value;
  const rules = rawCss.split(';').map(r => r.trim()).filter(Boolean);
  const map = new Map<string, string>();

  for (const rule of rules) {
    const colonIndex = rule.indexOf(':');
    if (colonIndex > 0) {
      const prop = rule.slice(0, colonIndex).trim();
      let val = rule.slice(colonIndex + 1).trim();
      if (!val.includes('!important')) {
        val += ' !important';
      }
      map.set(prop, val);
    }
  }

  let newCss = '';
  for (const [prop, val] of map.entries()) {
    newCss += `${prop}: ${val};\n`;
  }

  if (localCss.value !== newCss) {
    localCss.value = newCss;
    updatePreviewImmediate();
  }
};

const updatePreviewImmediate = () => {
  clearTimeout(previewTimer);
  emit('applyPreview', localSelector.value, localCss.value, true);
};

let previewTimer: any;
const updatePreview = () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    emit('applyPreview', localSelector.value, localCss.value, true);
  }, 200);
};

// CSS Autocomplete & Visual Designer Logics
const getActiveQuery = () => {
  const textarea = document.querySelector('.css-textarea') as HTMLTextAreaElement
  if (!textarea) return null
  
  const text = localCss.value || ''
  const selStart = textarea.selectionStart
  
  const beforeCaret = text.slice(0, selStart)
  const lastSemicolon = beforeCaret.lastIndexOf(';')
  const currentRule = beforeCaret.slice(lastSemicolon + 1)
  
  const colonIdx = currentRule.indexOf(':')
  if (colonIdx === -1) {
    const query = currentRule.trim()
    return { type: 'property', query }
  } else {
    const prop = currentRule.slice(0, colonIdx).trim()
    const query = currentRule.slice(colonIdx + 1).trim()
    return { type: 'value', prop, query }
  }
}

const onTextareaInput = () => {
  updatePreview()
  
  const queryInfo = getActiveQuery()
  activeQuery.value = queryInfo
  
  if (!queryInfo) {
    showSuggestions.value = false
    return
  }
  
  if (queryInfo.type === 'property') {
    const q = queryInfo.query.toLowerCase()
    if (!q) {
      showSuggestions.value = false
      return
    }
    const matches = Object.keys(cssDict).filter(k => k.startsWith(q))
    if (matches.length > 0) {
      suggestions.value = matches
      activeSuggestionIndex.value = 0
      showSuggestions.value = true
    } else {
      showSuggestions.value = false
    }
  } else {
    const prop = (queryInfo.prop || '').toLowerCase()
    const q = queryInfo.query.toLowerCase()
    const values = cssDict[prop]
    if (values) {
      const matches = values.filter(v => v.startsWith(q))
      if (matches.length > 0) {
        suggestions.value = matches
        activeSuggestionIndex.value = 0
        showSuggestions.value = true
      } else {
        showSuggestions.value = false
      }
    } else {
      showSuggestions.value = false
    }
  }
}

const onTextareaBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
  deduplicateCss()
}

const selectSuggestion = (suggestion: string) => {
  const textarea = document.querySelector('.css-textarea') as HTMLTextAreaElement
  if (!textarea) return
  
  const text = localCss.value || ''
  const selStart = textarea.selectionStart
  const beforeCaret = text.slice(0, selStart)
  const afterCaret = text.slice(selStart)
  
  const lastSemicolon = beforeCaret.lastIndexOf(';')
  const newBeforeCaretBase = beforeCaret.slice(0, lastSemicolon + 1)
  
  let newRule = ''
  if (activeQuery.value.type === 'property') {
    newRule = `${suggestion}: `
  } else {
    newRule = ` ${activeQuery.value.prop}: ${suggestion};`
  }
  
  const newBeforeCaret = newBeforeCaretBase + newRule
  localCss.value = newBeforeCaret + afterCaret
  
  updatePreview()
  
  setTimeout(() => {
    textarea.focus()
    const newPos = newBeforeCaret.length
    textarea.setSelectionRange(newPos, newPos)
    showSuggestions.value = false
  }, 10)
}

const handleTextareaKeydown = (e: KeyboardEvent) => {
  if (!showSuggestions.value || suggestions.value.length === 0) return
  
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeSuggestionIndex.value = (activeSuggestionIndex.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    selectSuggestion(suggestions.value[activeSuggestionIndex.value])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}


const save = () => {
  emit('save', domain.value, localSelector.value, localCss.value);
  emit('applyPreview', '', '', false); // clear preview and highlight
  emit('update:modelValue', false);
};

const close = () => {
  emit('update:modelValue', false);
  emit('applyPreview', '', '', false); // clear preview and highlight
};

// Drag Logic
const startDrag = (e: MouseEvent) => {
  isDragging = true;
  emit('interaction-start');
  dragOffset.x = e.clientX - position.value.x;
  dragOffset.y = e.clientY - position.value.y;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging) return;
  position.value.x = e.clientX - dragOffset.x;
  position.value.y = e.clientY - dragOffset.y;
};

const stopDrag = () => {
  isDragging = false;
  emit('interaction-end');
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
});
</script>

<style scoped lang="less">
.inspector-dialog {
  position: fixed;
  width: 300px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.inspector-header {
  height: 32px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  cursor: grab;
}

.inspector-header:active {
  cursor: grabbing;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.header-title svg {
  display: block;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
}

.action-btn svg {
  display: block;
}

.action-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.close-btn:hover {
  color: #ef4444;
}

.inspector-content {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.inspector-content.is-collapsed {
  grid-template-rows: 0fr;
}

.inspector-content-inner {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.inspector-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  user-select: text;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.info-row .label {
  color: #64748b;
}

.info-row .value {
  color: #0f172a;
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: #334155;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.text-btn {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.text-btn:hover {
  text-decoration: underline;
}

.dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  width: 200px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.dropdown-empty {
  padding: 8px 12px;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}

.dropdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  font-size: 11px;
  border-bottom: 1px solid #f1f5f9;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: #f8fafc;
}

.dropdown-text {
  flex: 1;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #334155;
}

.del-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  margin-left: 8px;
  border-radius: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.del-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

.mono-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  transition: border-color 0.2s;
}

.mono-input:focus {
  border-color: #3b82f6;
  background: #ffffff;
}

.css-textarea {
  min-height: 60px;
  resize: vertical;
}

.help-text {
  font-size: 11px;
  color: #94a3b8;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  user-select: none;
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

/* Autocomplete Dropdown */
.autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  max-height: 180px;
  overflow-y: auto;
  z-index: 1000;
  padding: 4px;
}

.autocomplete-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  font-size: 12px;
  color: #334155;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.autocomplete-item.active,
.autocomplete-item:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.ac-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.ac-desc {
  font-size: 10px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
}

</style>
