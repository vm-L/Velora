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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSettings } from '../composables/useSettings'

const { state, setCloseBehavior, saveCmsResources, saveExternalSites } = useSettings()

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
</style>
