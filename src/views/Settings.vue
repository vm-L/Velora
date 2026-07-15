<template>
  <div class="view settings-view">
    <div class="settings-container">
      <!-- General Settings -->
      <div class="settings-section-title">常规</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-info">
            <h3>关闭窗口行为</h3>
            <p>指定点击主窗口右上角关闭按钮时的默认系统行为。</p>
          </div>
          <div class="segmented-control" :class="{ 'state-quit': state.closeBehavior === 'quit' }">
            <label>
              <input type="radio" name="close-action" value="tray" :checked="state.closeBehavior === 'tray'" @change="updateBehavior('tray')">
              <span>隐藏到托盘</span>
            </label>
            <label>
              <input type="radio" name="close-action" value="quit" :checked="state.closeBehavior === 'quit'" @change="updateBehavior('quit')">
              <span>直接退出</span>
            </label>
            <div class="selection-pill"></div>
          </div>
        </div>
        
        <div class="settings-row" style="border-top: 1px solid #f1f5f9;">
          <div class="settings-info">
            <h3>默认图片保存目录</h3>
            <p>设置使用“保存到本地”时的默认保存位置。</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <input v-model="state.imageDirectory" @change="saveImageDirectory(state.imageDirectory)" type="text" class="inline-input" placeholder="输入或选择目录..." style="flex: 1; max-width: 300px; margin-right: 8px;" />
            <button class="action-btn edit-btn" @click="handleSelectDirectory">选择目录</button>
          </div>
        </div>
      </div>

      <!-- CMS Resources -->
      <div class="settings-section-title">CMS 资源</div>
      <div class="settings-card">
        <div v-for="(item, index) in state.cmsResources" :key="item.id" class="settings-row"
             draggable="true"
             @dragstart="onDragStart($event, 'cms', index)"
             @dragover.prevent
             @dragenter.prevent
             @drop="onDrop($event, 'cms', index)">
          
          <div class="drag-handle" title="拖动排序">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </div>
          
          <template v-if="editingId === item.id">
            <div class="settings-info edit-mode-info">
              <input v-model="editTempName" type="text" class="inline-input" placeholder="名称" />
              <input v-model="editTempUrl" type="text" class="inline-input flex-1" placeholder="URL" />
            </div>
            <div class="action-buttons">
              <button class="action-btn cancel-btn" @click="cancelEdit">取消</button>
              <button class="action-btn save-btn" @click="saveEdit('cms', index)">保存</button>
            </div>
          </template>
          <template v-else>
            <div class="settings-info resource-info">
              <h3>{{ item.name }}</h3>
              <p>{{ item.url }}</p>
            </div>
            <div class="action-buttons">
              <button class="action-btn edit-btn" @click="startEdit(item)">编辑</button>
              <button class="action-btn delete-btn" @click="removeCmsResource(index)">删除</button>
            </div>
          </template>
        </div>
        
        <!-- Add New CMS Resource -->
        <div class="settings-row add-row">
          <input v-model="newCmsName" type="text" placeholder="资源名称" class="inline-input" />
          <input v-model="newCmsUrl" type="text" placeholder="https://" class="inline-input flex-1" />
          <button class="action-btn add-btn" :disabled="!newCmsName || !newCmsUrl" @click="addCmsResource">添加</button>
        </div>
      </div>

      <!-- Website Resources (Formerly External Sites) -->
      <div class="settings-section-title">网站资源</div>
      <div class="settings-card">
        <div v-for="(item, index) in state.externalSites" :key="item.id" class="settings-row"
             draggable="true"
             @dragstart="onDragStart($event, 'ext', index)"
             @dragover.prevent
             @dragenter.prevent
             @drop="onDrop($event, 'ext', index)">
             
          <div class="drag-handle" title="拖动排序">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </div>
          
          <template v-if="editingId === item.id">
            <div class="settings-info edit-mode-info">
              <input v-model="editTempName" type="text" class="inline-input" placeholder="名称" />
              <input v-model="editTempUrl" type="text" class="inline-input flex-1" placeholder="URL" />
            </div>
            <div class="action-buttons">
              <button class="action-btn cancel-btn" @click="cancelEdit">取消</button>
              <button class="action-btn save-btn" @click="saveEdit('ext', index)">保存</button>
            </div>
          </template>
          <template v-else>
            <div class="settings-info resource-info">
              <h3>{{ item.name }}</h3>
              <p>{{ item.url }}</p>
            </div>
            <div class="action-buttons">
              <button class="action-btn edit-btn" @click="openStyleManager(item)">管理样式</button>
              <button class="action-btn edit-btn" @click="startEdit(item)">编辑</button>
              <button class="action-btn delete-btn" @click="removeExternalSite(index)">删除</button>
            </div>
          </template>
        </div>
        
        <!-- Add New External Site -->
        <div class="settings-row add-row">
          <input v-model="newExtName" type="text" placeholder="网站名称" class="inline-input" />
          <input v-model="newExtUrl" type="text" placeholder="https://" class="inline-input flex-1" />
          <button class="action-btn add-btn" :disabled="!newExtName || !newExtUrl" @click="addExternalSite">添加</button>
        </div>
      </div>

    </div>

    <!-- Style Management Modal -->
    <div v-if="managingStylesFor" class="modal-overlay" @click.self="closeStyleManager">
      <div class="modal-content">
        <div class="modal-header">
          <h3>管理样式 - {{ managingStylesFor.name }}</h3>
          <button class="modal-close-btn" @click="closeStyleManager">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div v-if="!currentStyles || Object.keys(currentStyles).length === 0" class="empty-state">
            暂无已保存的样式规则。
          </div>
          <div v-else class="domain-list">
            <div v-for="(rules, domain) in currentStyles" :key="domain" class="domain-group">
              <div class="domain-title">{{ domain }}</div>
              <div v-if="rules.length === 0" class="empty-rule">无规则</div>
              <div v-for="(rule, idx) in rules" :key="idx" class="rule-item">
                <div class="rule-content">
                  <div class="rule-selector">{{ rule.selector }}</div>
                  <div class="rule-css">{{ rule.css }}</div>
                </div>
                <button class="action-btn delete-btn shrink-0" @click="deleteRule(domain as string, rule.selector)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useConfirm } from '../composables/useConfirm'

const { state, setCloseBehavior, saveImageDirectory, saveCmsResources, saveExternalSites, saveCustomStyles } = useSettings()
const { confirm } = useConfirm()

const newCmsName = ref('')
const newCmsUrl = ref('https://')

const newExtName = ref('')
const newExtUrl = ref('https://')

const editingId = ref<string | null>(null)
const editTempName = ref('')
const editTempUrl = ref('')

const updateBehavior = (behavior: string) => {
  setCloseBehavior(behavior)
}

const handleSelectDirectory = async () => {
  const dir = await window.electronAPI.selectDirectory()
  if (dir) {
    saveImageDirectory(dir)
  }
}

const generateId = () => Math.random().toString(36).substr(2, 9)

const addCmsResource = () => {
  if (!newCmsName.value || !newCmsUrl.value) return
  const resources = [...state.cmsResources]
  resources.push({
    id: generateId(),
    name: newCmsName.value,
    url: newCmsUrl.value
  })
  saveCmsResources(resources)
  newCmsName.value = ''
  newCmsUrl.value = 'https://'
}

const removeCmsResource = (index: number) => {
  const resources = [...state.cmsResources]
  resources.splice(index, 1)
  saveCmsResources(resources)
}

const addExternalSite = () => {
  if (!newExtName.value || !newExtUrl.value) return
  const sites = [...state.externalSites]
  sites.push({
    id: generateId(),
    name: newExtName.value,
    url: newExtUrl.value
  })
  saveExternalSites(sites)
  newExtName.value = ''
  newExtUrl.value = 'https://'
}

const removeExternalSite = (index: number) => {
  const sites = [...state.externalSites]
  sites.splice(index, 1)
  saveExternalSites(sites)
}

const startEdit = (item: any) => {
  editingId.value = item.id
  editTempName.value = item.name
  editTempUrl.value = item.url
}

const cancelEdit = () => {
  editingId.value = null
  editTempName.value = ''
  editTempUrl.value = ''
}

const saveEdit = (type: 'cms' | 'ext', index: number) => {
  if (type === 'cms') {
    const resources = [...state.cmsResources]
    resources[index] = { ...resources[index], name: editTempName.value, url: editTempUrl.value }
    saveCmsResources(resources)
  } else {
    const sites = [...state.externalSites]
    sites[index] = { ...sites[index], name: editTempName.value, url: editTempUrl.value }
    saveExternalSites(sites)
  }
  cancelEdit()
}

// Drag and drop sorting
const onDragStart = (e: DragEvent, type: 'cms' | 'ext', index: number) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, index }))
  }
}

const onDrop = (e: DragEvent, targetType: 'cms' | 'ext', targetIndex: number) => {
  if (!e.dataTransfer) return
  const dataString = e.dataTransfer.getData('text/plain')
  if (!dataString) return
  
  try {
    const data = JSON.parse(dataString)
    if (data.type !== targetType) return // Prevent dragging between different groups
    
    const sourceIndex = data.index
    if (sourceIndex === targetIndex) return
    
    if (targetType === 'cms') {
      const items = [...state.cmsResources]
      const [movedItem] = items.splice(sourceIndex, 1)
      items.splice(targetIndex, 0, movedItem)
      saveCmsResources(items)
    } else {
      const items = [...state.externalSites]
      const [movedItem] = items.splice(sourceIndex, 1)
      items.splice(targetIndex, 0, movedItem)
      saveExternalSites(items)
    }
  } catch (err) {
    console.error('Drag and drop error', err)
  }
}

// Style Management
const managingStylesFor = ref<any>(null)

const openStyleManager = (item: any) => {
  managingStylesFor.value = item
}

const closeStyleManager = () => {
  managingStylesFor.value = null
}

const currentStyles = computed(() => {
  if (!managingStylesFor.value) return null
  return state.customStyles[managingStylesFor.value.id] || {}
})

const deleteRule = async (domain: string, selector: string) => {
  if (!managingStylesFor.value) return
  const isOk = await confirm({
    title: '删除规则',
    message: '是否确认删除此规则',
    type: 'danger',
    confirmText: '删除'
  })
  if (!isOk) return
  
  const resourceId = managingStylesFor.value.id
  const newStyles = { ...state.customStyles }
  if (newStyles[resourceId] && newStyles[resourceId][domain]) {
    newStyles[resourceId][domain] = newStyles[resourceId][domain].filter((r: any) => r.selector !== selector)
    if (newStyles[resourceId][domain].length === 0) {
      delete newStyles[resourceId][domain]
    }
    await saveCustomStyles(newStyles)
  }
}
</script>

<style scoped lang="less">
.settings-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
  box-sizing: border-box;
  overflow-y: auto;
}

.settings-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  padding-bottom: var(--view-padding);
}

.settings-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 12px;
  margin-top: 24px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.settings-section-title:first-of-type {
  margin-top: 0;
}

.settings-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--row-padding-v) var(--row-padding-h);
  transition: background-color 0.2s ease;
  border-bottom: 1px solid #f1f5f9;
}
.settings-row:last-child {
  border-bottom: none;
}

.settings-row:hover {
  background-color: #f8fafc;
}

.settings-row[draggable="true"] {
  cursor: grab;
}
.settings-row[draggable="true"]:active {
  cursor: grabbing;
}

.drag-handle {
  cursor: inherit;
  margin-right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drag-handle svg {
  display: block;
}

.settings-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.settings-info h3 {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.settings-info p {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  max-width: 400px;
  line-height: 1.5;
}

.resource-info h3 {
  font-size: 15px;
}
.resource-info p {
  font-size: 13px;
  color: #94a3b8;
}

.edit-mode-info {
  flex-direction: row;
  gap: 12px;
  align-items: center;
  margin-right: 20px;
}

/* Inline form for adding */
.add-row {
  background-color: #f8fafc;
  gap: 12px;
}
.add-row .inline-input {
  background: white;
}
.inline-input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  min-width: 180px;
}
.inline-input:focus {
  border-color: #3b82f6;
}
.flex-1 {
  flex: 1;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.add-btn, .save-btn {
  background: #3b82f6;
  color: white;
}
.add-btn:hover:not(:disabled), .save-btn:hover {
  background: #2563eb;
}
.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.edit-btn {
  background: #f1f5f9;
  color: #475569;
}
.edit-btn:hover {
  background: #e2e8f0;
}
.cancel-btn {
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
}
.cancel-btn:hover {
  background: #f1f5f9;
}
.delete-btn {
  background: #fee2e2;
  color: #ef4444;
}
.delete-btn:hover {
  background: #fecaca;
}

.segmented-control {
  display: flex;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
  position: relative;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.segmented-control input[type="radio"] {
  display: none;
}

.segmented-control label {
  position: relative;
  z-index: 2;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: color 0.2s ease;
  user-select: none;
  width: 106px;
  text-align: center;
}

.segmented-control input[type="radio"]:checked + span {
  color: #0f172a;
}

.selection-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: 106px;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  z-index: 1;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.segmented-control.state-quit .selection-pill {
  transform: translateX(106px);
}

/* Modal */
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
  z-index: 9999;
}

.modal-content {
  background: #ffffff;
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close-btn svg {
  display: block;
}

.modal-close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.empty-state {
  text-align: center;
  color: #94a3b8;
  padding: 40px 0;
  font-size: 14px;
}

.domain-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.domain-group {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.domain-title {
  background: #f8fafc;
  padding: 10px 16px;
  font-weight: 600;
  font-size: 13px;
  color: #334155;
  border-bottom: 1px solid #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.empty-rule {
  padding: 12px 16px;
  font-size: 13px;
  color: #94a3b8;
}

.rule-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.rule-item:last-child {
  border-bottom: none;
}

.rule-content {
  flex: 1;
  min-width: 0;
  margin-right: 16px;
}

.rule-selector {
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 4px;
  word-break: break-all;
}

.rule-css {
  font-size: 12px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.shrink-0 {
  flex-shrink: 0;
}
</style>
