<template>
  <div class="view settings-view">
    <div class="settings-container">
      <!-- General Settings -->
      <div class="settings-section-title">常规</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-info">
            <h3>关闭窗口行为</h3>
            <p>指定点击主窗口右上角关闭按钮时的默认系统行为</p>
          </div>
          <v-switch
            :model-value="state.closeBehavior"
            :options="closeBehaviorOptions"
            @change="updateBehavior"
          />
        </div>

        <!-- 广告过滤规则 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>广告过滤规则</h3>
            <p>已启用 {{ totalActiveRulesCount.toLocaleString() }} 条过滤规则</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end; gap: 8px;">
            <v-button variant="secondary" :disabled="isUpdatingAllRules" @click="handleUpdateAllRules">
              {{ isUpdatingAllRules ? '更新中...' : '更新' }}
            </v-button>
            <v-button variant="secondary" @click="showAdBlockModal = true">
              编辑
            </v-button>
          </div>
        </div>
      </div>

      <!-- Download Settings -->
      <div class="settings-section-title">下载</div>
      <div class="settings-card">
        <!-- 同时下载任务数 -->
        <div class="settings-row">
          <div class="settings-info">
            <h3>同时下载任务数</h3>
            <p>设置最大同时进行的下载任务数量 (支持范围 1-10)</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input type="number" min="1" max="10" :value="state.maxConcurrentDownloads" @change="handleMaxConcurrentChange" class="inline-input" style="width: 100px; min-width: 100px;" />
          </div>
        </div>

        <!-- 最大内存空间 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>最大内存空间 (MB)</h3>
            <p>设置下载流在内存中的缓冲容量上限，超限时自动批量写盘</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input type="number" min="64" max="8192" :value="state.maxMemoryBufferMB" @change="handleMaxMemoryChange" class="inline-input" style="width: 100px; min-width: 100px;" />
          </div>
        </div>

        <!-- 图片目录 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>图片目录</h3>
            <p>图片的默认下载目录</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input v-model="state.imageDirectory" @change="saveImageDirectory(state.imageDirectory)" type="text"
              class="inline-input" placeholder="输入或选择目录..." style="flex: 1; max-width: 300px; margin-right: 8px;" />
            <v-button variant="secondary" class="edit-btn" @click="handleSelectDirectory">选择目录</v-button>
          </div>
        </div>

        <!-- 音频目录 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>音频目录</h3>
            <p>音频的默认下载目录</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input v-model="state.audioDirectory" @change="saveAudioDirectory(state.audioDirectory)" type="text"
              class="inline-input" placeholder="输入或选择目录..." style="flex: 1; max-width: 300px; margin-right: 8px;" />
            <v-button variant="secondary" class="edit-btn" @click="handleSelectAudioDirectory">选择目录</v-button>
          </div>
        </div>

        <!-- 视频目录 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>视频目录</h3>
            <p>视频的默认下载目录</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input v-model="state.videoDirectory" @change="saveVideoDirectory(state.videoDirectory)" type="text"
              class="inline-input" placeholder="输入或选择目录..." style="flex: 1; max-width: 300px; margin-right: 8px;" />
            <v-button variant="secondary" class="edit-btn" @click="handleSelectVideoDirectory">选择目录</v-button>
          </div>
        </div>

        <!-- 文件目录 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>文件目录</h3>
            <p>其他类型文件的默认下载目录</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input v-model="state.fileDirectory" @change="saveFileDirectory(state.fileDirectory)" type="text"
              class="inline-input" placeholder="输入或选择目录..." style="flex: 1; max-width: 300px; margin-right: 8px;" />
            <v-button variant="secondary" class="edit-btn" @click="handleSelectFileDirectory">选择目录</v-button>
          </div>
        </div>
      </div>

      <!-- Compression Settings -->
      <div class="settings-section-title">压缩</div>
      <div class="settings-card">
        <!-- 下载后压缩视频开关 -->
        <div class="settings-row">
          <div class="settings-info">
            <h3>下载后压缩视频</h3>
            <p>视频下载完成后，当体积与码率达到阈值时使用 FFmpeg (优先 GPU 硬件加速) 进行智能压缩</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-switch
              :model-value="state.enableVideoCompress"
              @change="handleCompressToggle"
            />
          </div>
        </div>

        <!-- 触发压缩的文件大小阈值 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>触发压缩阈值 (GB)</h3>
            <p>当视频文件体积大于或等于此阈值时触发压缩</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              :value="state.videoCompressThresholdGB"
              @change="handleThresholdChange"
              class="inline-input"
              style="width: 100px; min-width: 100px;"
            />
          </div>
        </div>

        <!-- 目标基准码率 (只读) -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>目标基准码率 (只读)</h3>
            <p>以 2 小时标准时长计算，视频文件达到阈值大小时的码率</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input
              type="text"
              readonly
              :model-value="calculatedTargetBitrateText"
              class="inline-input"
              style="width: 170px; min-width: 170px; text-align: right; background: var(--bg-hover);"
            />
          </div>
        </div>
      </div>

      <!-- CMS Resources -->
      <div class="settings-section-title">CMS 资源</div>
      <div class="settings-card">
        <div v-for="(item, index) in state.cmsResources" :key="item.id" class="settings-row"
          @dragover.prevent @dragenter.prevent
          @drop="onDrop($event, 'cms', index)">

          <div class="drag-handle" title="拖动排序" draggable="true" @dragstart="onDragStart($event, 'cms', index)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="5" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="5" r="1.2" fill="currentColor"></circle>
              <circle cx="9" cy="12" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="12" r="1.2" fill="currentColor"></circle>
              <circle cx="9" cy="19" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="19" r="1.2" fill="currentColor"></circle>
            </svg>
          </div>

          <template v-if="editingId === item.id">
            <div class="settings-info edit-mode-info">
              <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="名称" />
              <v-input v-model="editTempUrl" type="text" class="inline-input url-input flex-1" placeholder="URL" />
            </div>
            <div class="action-buttons">
              <v-button variant="secondary" class="cancel-btn" @click="cancelEdit">取消</v-button>
              <v-button variant="primary" class="save-btn" @click="saveEdit('cms', index)">保存</v-button>
            </div>
          </template>
          <template v-else>
            <div class="settings-info resource-info">
              <h3>{{ item.name }}</h3>
              <p>{{ item.url }}</p>
            </div>
            <div class="action-buttons">
              <v-button variant="secondary" class="edit-btn" @click="startEdit(item)">编辑</v-button>
              <v-button variant="danger-soft" class="delete-btn" @click="removeCmsResource(index)">删除</v-button>
            </div>
          </template>
        </div>

        <!-- Add New CMS Resource -->
        <div class="settings-row add-row">
          <v-input v-model="newCmsName" type="text" placeholder="资源名称" class="inline-input name-input" />
          <v-input v-model="newCmsUrl" type="text" placeholder="https://" class="inline-input url-input flex-1" />
          <v-button variant="primary" class="add-btn" :disabled="!newCmsName || !newCmsUrl" @click="addCmsResource">添加</v-button>
        </div>
      </div>

      <!-- Website Resources (Formerly External Sites) -->
      <div class="settings-section-title">网站资源</div>
      <div class="settings-card">
        <div v-for="(item, index) in state.externalSites" :key="item.id" class="settings-row"
          @dragover.prevent @dragenter.prevent
          @drop="onDrop($event, 'ext', index)">

          <div class="drag-handle" title="拖动排序" draggable="true" @dragstart="onDragStart($event, 'ext', index)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="5" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="5" r="1.2" fill="currentColor"></circle>
              <circle cx="9" cy="12" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="12" r="1.2" fill="currentColor"></circle>
              <circle cx="9" cy="19" r="1.2" fill="currentColor"></circle>
              <circle cx="15" cy="19" r="1.2" fill="currentColor"></circle>
            </svg>
          </div>

          <template v-if="editingId === item.id">
            <div class="settings-info edit-mode-info">
              <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="名称" />
              <v-input v-model="editTempUrl" type="text" class="inline-input url-input flex-1" placeholder="URL" />
            </div>
            <div class="action-buttons">
              <v-button variant="secondary" class="cancel-btn" @click="cancelEdit">取消</v-button>
              <v-button variant="primary" class="save-btn" @click="saveEdit('ext', index)">保存</v-button>
            </div>
          </template>
          <template v-else>
            <div class="settings-info resource-info">
              <h3>{{ item.name }}</h3>
              <p>{{ item.url }}</p>
            </div>
            <div class="action-buttons">
              <v-button variant="secondary" class="edit-btn" @click="openParseManager(item)">管理解析</v-button>
              <v-button variant="secondary" class="edit-btn" @click="openScriptManager(item)">管理脚本</v-button>
              <v-button variant="secondary" class="edit-btn" @click="openStyleManager(item)">管理样式</v-button>
              <v-button variant="secondary" class="edit-btn" @click="startEdit(item)">编辑</v-button>
              <v-button variant="danger-soft" class="delete-btn" @click="removeExternalSite(index)">删除</v-button>
            </div>
          </template>
        </div>

        <!-- Add New External Site -->
        <div class="settings-row add-row">
          <v-input v-model="newExtName" type="text" placeholder="网站名称" class="inline-input name-input" />
          <v-input v-model="newExtUrl" type="text" placeholder="https://" class="inline-input url-input flex-1" />
          <v-button variant="primary" class="add-btn" :disabled="!newExtName || !newExtUrl" @click="addExternalSite">添加</v-button>
        </div>
      </div>

      <!-- Resource Backup & Migration -->
      <div class="settings-section-title">资源备份与迁移</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-info" style="min-width: 0; flex: 1;">
            <h3>资源配置备份 (.json)</h3>
            <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">包含网页列表、域名解析规则、注入脚本与 CMS 资源站配置</p>
          </div>
          <div class="action-buttons" style="display: flex; gap: 8px;">
            <v-button variant="secondary" @click="handleImportResources">
              导入
            </v-button>
            <v-button variant="secondary" @click="handleExportResources">
              导出
            </v-button>
          </div>
        </div>
      </div>

    </div>

    <!-- Parse Rule Management Modal -->
    <div v-if="managingParseFor" class="modal-overlay" @click.self="closeParseManager">
      <div class="modal-content" style="max-width: 600px; width: 90vw;">
        <div class="modal-header">
          <h3>管理解析规则 - {{ managingParseFor.name }}</h3>
          <v-button variant="icon" class="modal-close-btn" @click="closeParseManager">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
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
                  <v-button variant="secondary" class="edit-btn shrink-0" @click="openParseEditor(rule)">编辑</v-button>
                  <v-button variant="danger-soft" class="delete-btn shrink-0" @click="deleteParseRule(rule)">删除</v-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    
    <!-- Script Management Modal -->
    <div v-if="managingScriptsFor" class="modal-overlay" @click.self="closeScriptManager">
      <div class="modal-content" style="max-width: 600px; width: 90vw;">
        <div class="modal-header">
          <h3>管理 JS 脚本 - {{ managingScriptsFor.name }}</h3>
          <v-button variant="icon" class="modal-close-btn" @click="closeScriptManager">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
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
                  <v-button variant="secondary" class="edit-btn shrink-0" @click="openScriptEditor(script)">编辑</v-button>
                  <v-button variant="danger-soft" class="delete-btn shrink-0" @click="deleteScript(script)">删除</v-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Style Management Modal -->
    <div v-if="managingStylesFor" class="modal-overlay" @click.self="closeStyleManager">
      <div class="modal-content">
        <div class="modal-header">
          <h3>管理样式 - {{ managingStylesFor.name }}</h3>
          <v-button variant="icon" class="modal-close-btn" @click="closeStyleManager">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
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
                  <v-button variant="secondary" class="edit-btn shrink-0" @click="openStyleEditor(domain as string, cssString as string)">编辑</v-button>
                  <v-button variant="danger-soft" class="delete-btn shrink-0" @click="deleteDomainStyle(domain as string)">删除</v-button>
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
      :resource-id="managingParseFor?.id || ''"
      :editing-rule="editingParseRule"
    />
    <AdBlockDialog v-model:visible="showAdBlockModal" />

    <!-- Resource Import Strategy Modal -->
    <div v-if="pendingImportData" class="modal-overlay" @click.self="pendingImportData = null">
      <div class="modal-content" style="max-width: 480px; width: 90vw;">
        <div class="modal-header">
          <h3>导入资源配置 - 选择冲突策略</h3>
          <v-button variant="icon" class="modal-close-btn" @click="pendingImportData = null">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </v-button>
        </div>
        <div class="modal-body" style="padding: 20px 24px;">
          <p style="font-size: 14px; color: var(--text-primary); margin-bottom: 12px; line-height: 1.5;">
            已成功读取备份数据：<strong>{{ importSummaryText }}</strong>。
          </p>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            当遇到与当前系统中已存在的重复资源或规则时，请选择恢复策略：
          </p>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div 
              class="strategy-option"
              :class="{ active: importMode === 'merge' }"
              @click="importMode = 'merge'"
            >
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--text-primary);">增量合并（推荐）</div>
              <div style="font-size: 12px; color: var(--text-secondary);">保持现有配置不变，仅追加备份中不存在的新资源与域名解析规则</div>
            </div>
            <div 
              class="strategy-option"
              :class="{ active: importMode === 'overwrite' }"
              @click="importMode = 'overwrite'"
            >
              <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--color-error, #ef4444);">覆盖重置</div>
              <div style="font-size: 12px; color: var(--text-secondary);">使用备份文件全面替换当前系统的所有网站、解析规则与 CMS 配置</div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--border-light);">
          <v-button variant="secondary" @click="pendingImportData = null">取消</v-button>
          <v-button variant="primary" @click="confirmImportResources">确认导入</v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { CustomScript, ParseRule, useSettings } from '../composables/useSettings';
import { useConfirm } from '../composables/useConfirm';
import { useMessage } from '../composables/useMessage';
import { useOpenedResources } from '../composables/useOpenedResources';
import { useOpenedCMS } from '../composables/useOpenedCMS';
import { logger } from '../services/logger';
import VButton from '../components/base/VButton.vue';

import SettingsScriptEditor from '../components/features/SettingsScriptEditor.vue';
import SettingsStyleEditor from '../components/features/SettingsStyleEditor.vue';
import ParseRuleDialog from '../components/features/ParseRuleDialog.vue';
import AdBlockDialog from '../components/features/AdBlockDialog.vue';
import VInput from '../components/base/VInput.vue';
import VSwitch, { type VSwitchOption } from '../components/base/VSwitch.vue';

const closeBehaviorOptions: VSwitchOption[] = [
  { label: '隐藏到托盘', value: 'tray' },
  { label: '直接退出', value: 'quit' }
];

const { 
  state, 
  setCloseBehavior, 
  saveImageDirectory, 
  saveAudioDirectory,
  saveVideoDirectory,
  saveFileDirectory,
  saveMaxConcurrentDownloads,
  saveMaxMemoryBufferMB,
  saveEnableVideoCompress,
  saveVideoCompressThresholdGB,
  saveCmsResources, 
  saveExternalSites, 
  saveCustomStyles,
  saveCustomScripts,
  saveCustomParseRules,
  syncAllAdBlockSources,
  exportResourceBackup,
  importResourceBackup
} = useSettings();
const { confirm } = useConfirm();
const { showMessage } = useMessage();

const calculatedTargetBitrateText = computed(() => {
  const gb = typeof state.videoCompressThresholdGB === 'number' ? state.videoCompressThresholdGB : 1.5;
  // 2 hours = 7200 seconds. 
  // Formula: (GB * 1024 * 1024 * 1024 * 8 bits) / 7200 s
  const bps = (gb * 1024 * 1024 * 1024 * 8) / 7200;
  const kbps = Math.round(bps / 1000);
  const mbps = (bps / 1000000).toFixed(2);
  return `${kbps.toLocaleString()} kbps (~${mbps} Mbps)`;
});

const handleCompressToggle = (val: boolean) => {
  saveEnableVideoCompress(val);
  showMessage(val ? '已开启下载后智能视频压缩' : '已关闭下载后视频压缩', 'info');
};

const handleThresholdChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  let val = parseFloat(target.value);
  if (isNaN(val) || val < 0.1) val = 0.1;
  else if (val > 50) val = 50;
  val = Math.round(val * 10) / 10;
  saveVideoCompressThresholdGB(val);
};

const pendingImportData = ref<any>(null);
const importMode = ref<'merge' | 'overwrite'>('merge');

const importSummaryText = computed(() => {
  if (!pendingImportData.value?.data) return '';
  const d = pendingImportData.value.data;
  const webCount = (d.webResources || []).length;
  const cmsCount = (d.cmsResources || []).length;
  const ruleCount = Object.values(d.customParseRules || {}).reduce((acc: number, cur: any) => acc + (cur?.length || 0), 0);
  const scriptCount = Object.values(d.customScripts || {}).reduce((acc: number, cur: any) => acc + (cur?.length || 0), 0);
  return `${webCount} 个网站资源、${cmsCount} 个 CMS 资源站点、${ruleCount} 条解析规则与 ${scriptCount} 条注入脚本`;
});

const handleExportResources = async () => {
  try {
    const res = await exportResourceBackup();
    if (res.success && res.filePath) {
      showMessage(`资源配置已导出至: ${res.filePath}`, 'success');
    } else if (res.error) {
      showMessage(`导出失败: ${res.error}`, 'error');
    }
  } catch (err: any) {
    showMessage(`导出失败: ${err.message}`, 'error');
  }
};

const handleImportResources = async () => {
  try {
    const res = await window.electronAPI.importResourcesJson();
    if (res.cancelled) return;
    if (!res.success || !res.data) {
      showMessage(res.error || '导入备份文件无效', 'error');
      return;
    }
    pendingImportData.value = res.data;
    importMode.value = 'merge';
  } catch (err: any) {
    showMessage(`读取导入文件失败: ${err.message}`, 'error');
  }
};

const confirmImportResources = async () => {
  if (!pendingImportData.value) return;
  try {
    await importResourceBackup(pendingImportData.value, importMode.value);
    const modeText = importMode.value === 'overwrite' ? '覆盖重置' : '增量合并';
    showMessage(`资源与规则已成功以【${modeText}】模式完成导入！`, 'success');
  } catch (err: any) {
    showMessage(`导入失败: ${err.message}`, 'error');
  } finally {
    pendingImportData.value = null;
  }
};

const showAdBlockModal = ref(false);
const isUpdatingAllRules = ref(false);

const totalActiveRulesCount = computed(() => {
  return state.adBlockSources
    .filter(s => s.enabled)
    .reduce((acc, s) => acc + (s.ruleCount || 0), 0);
});

const handleUpdateAllRules = async () => {
  if (isUpdatingAllRules.value) return;
  isUpdatingAllRules.value = true;
  showMessage('正在同步更新所有启用的广告过滤规则...', 'info');

  try {
    await syncAllAdBlockSources();
    showMessage(`规则同步完成，当前已生效 ${totalActiveRulesCount.value.toLocaleString()} 条过滤规则`, 'success');
  } catch (err: any) {
    showMessage(`更新失败: ${err.message}`, 'error');
  } finally {
    isUpdatingAllRules.value = false;
  }
};

const newCmsName = ref('');
const newCmsUrl = ref('https://');

const newExtName = ref('');
const newExtUrl = ref('https://');

const editingId = ref<string | null>(null);
const editTempName = ref('');
const editTempUrl = ref('');

const updateBehavior = (behavior: string) => {
  setCloseBehavior(behavior);
};

const handleSelectDirectory = async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    saveImageDirectory(dir);
  }
};

const handleSelectAudioDirectory = async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    saveAudioDirectory(dir);
  }
};

const handleSelectVideoDirectory = async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    saveVideoDirectory(dir);
  }
};

const handleSelectFileDirectory = async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    saveFileDirectory(dir);
  }
};

const handleMaxConcurrentChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  let val = parseInt(target.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  else if (val > 10) val = 10;
  saveMaxConcurrentDownloads(val);
};

const handleMaxMemoryChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  let val = parseInt(target.value, 10);
  if (isNaN(val) || val < 64) val = 64;
  else if (val > 8192) val = 8192;
  saveMaxMemoryBufferMB(val);
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const addCmsResource = () => {
  if (!newCmsName.value || !newCmsUrl.value) return;
  const resources = [...state.cmsResources];
  resources.push({
    id: generateId(),
    name: newCmsName.value,
    url: newCmsUrl.value
  });
  saveCmsResources(resources);
  newCmsName.value = '';
  newCmsUrl.value = 'https://';
};

const removeCmsResource = async (index: number) => {
  const resource = state.cmsResources[index];
  const confirmed = await confirm({
    title: '删除资源',
    message: `确定要删除 CMS 资源 "${resource.name}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const resources = [...state.cmsResources];
  resources.splice(index, 1);
  saveCmsResources(resources);
};

const addExternalSite = () => {
  if (!newExtName.value || !newExtUrl.value) return;
  const sites = [...state.externalSites];
  sites.push({
    id: generateId(),
    name: newExtName.value,
    url: newExtUrl.value
  });
  saveExternalSites(sites);
  newExtName.value = '';
  newExtUrl.value = 'https://';
};

const removeExternalSite = async (index: number) => {
  const site = state.externalSites[index];
  const confirmed = await confirm({
    title: '删除站点',
    message: `确定要删除外部站点 "${site.name}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const sites = [...state.externalSites];
  sites.splice(index, 1);
  saveExternalSites(sites);
};

const startEdit = (item: any) => {
  editingId.value = item.id;
  editTempName.value = item.name;
  editTempUrl.value = item.url;
};

const cancelEdit = () => {
  editingId.value = null;
  editTempName.value = '';
  editTempUrl.value = '';
};

const { updateResourceUrl } = useOpenedResources();
const { updateCMSUrl } = useOpenedCMS();

const saveEdit = (type: 'cms' | 'ext', index: number) => {
  if (type === 'cms') {
    const resources = [...state.cmsResources];
    resources[index] = { ...resources[index], name: editTempName.value, url: editTempUrl.value };
    saveCmsResources(resources);
    updateCMSUrl(resources[index].id, editTempUrl.value);
  } else {
    const sites = [...state.externalSites];
    sites[index] = { ...sites[index], name: editTempName.value, url: editTempUrl.value };
    saveExternalSites(sites);
    updateResourceUrl(sites[index].id, editTempUrl.value);
  }
  cancelEdit();
};

// Drag and drop sorting
const onDragStart = (e: DragEvent, type: 'cms' | 'ext', index: number) => {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type, index }));
    const target = e.target as HTMLElement;
    if (target && target.closest) {
      const row = target.closest('.settings-row');
      if (row) {
        e.dataTransfer.setDragImage(row, 20, 20);
      }
    }
  }
};

const onDrop = (e: DragEvent, targetType: 'cms' | 'ext', targetIndex: number) => {
  if (!e.dataTransfer) return;
  const dataString = e.dataTransfer.getData('text/plain');
  if (!dataString) return;

  try {
    const data = JSON.parse(dataString);
    if (data.type !== targetType) return; // Prevent dragging between different groups

    const sourceIndex = data.index;
    if (sourceIndex === targetIndex) return;

    if (targetType === 'cms') {
      const items = [...state.cmsResources];
      const [movedItem] = items.splice(sourceIndex, 1);
      items.splice(targetIndex, 0, movedItem);
      saveCmsResources(items);
    } else {
      const items = [...state.externalSites];
      const [movedItem] = items.splice(sourceIndex, 1);
      items.splice(targetIndex, 0, movedItem);
      saveExternalSites(items);
    }
  } catch (err) {
    logger.error('Settings', 'Drag and drop error: ' + err);
  }
};


const managingScriptsFor = ref<any>(null);

const managingParseFor = ref<any>(null);
const parseRuleDialogVisible = ref(false);
const editingParseRule = ref<ParseRule | null>(null);

const currentParseRules = computed(() => {
  if (!managingParseFor.value) return [];
  return state.customParseRules[managingParseFor.value.id] || [];
});

const openParseManager = (item: any) => {
  managingParseFor.value = item;
};

const closeParseManager = () => {
  managingParseFor.value = null;
};

const openParseEditor = (rule: ParseRule) => {
  editingParseRule.value = rule;
  parseRuleDialogVisible.value = true;
};

const deleteParseRule = async (rule: ParseRule) => {
  if (!managingParseFor.value) return;
  const confirmed = await confirm({
    title: '删除解析规则',
    message: `确定要删除匹配规则 "${rule.domain}" (${rule.actionType === 'download' ? '下载' : '复制'}) 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const resId = managingParseFor.value.id;
  const rules = (state.customParseRules[resId] || []).filter(r => r.id !== rule.id);
  const updatedAll = {
    ...state.customParseRules,
    [resId]: rules
  };
  await saveCustomParseRules(updatedAll);
  showMessage({ text: '解析规则删除成功', type: 'success' });
};
const currentScripts = computed(() => {
  if (!managingScriptsFor.value) return [];
  return state.customScripts[managingScriptsFor.value.id] || [];
});

const openScriptManager = (item: any) => {
  managingScriptsFor.value = item;
};

const closeScriptManager = () => {
  managingScriptsFor.value = null;
};


const scriptEditorVisible = ref(false);
const editingScript = ref<CustomScript | undefined>(undefined);

const openScriptEditor = (script: CustomScript) => {
  editingScript.value = script;
  scriptEditorVisible.value = true;
};

const onSaveScript = (updatedScript: CustomScript) => {
  const allScripts = { ...state.customScripts };
  
  if (editingScript.value) {
    const oldDomain = editingScript.value.domain;
    if (allScripts[oldDomain]) {
      allScripts[oldDomain] = allScripts[oldDomain].filter(s => s.id !== updatedScript.id);
      if (allScripts[oldDomain].length === 0) {
        delete allScripts[oldDomain];
      }
    }
  }

  if (!allScripts[updatedScript.domain]) {
    allScripts[updatedScript.domain] = [];
  }
  
  const existingIdx = allScripts[updatedScript.domain].findIndex(s => s.id === updatedScript.id);
  if (existingIdx !== -1) {
    allScripts[updatedScript.domain][existingIdx] = updatedScript;
  } else {
    allScripts[updatedScript.domain].push(updatedScript);
  }

  saveCustomScripts(allScripts);
  
};

const styleEditorVisible = ref(false);
const editingStyleDomain = ref('');
const editingStyleCode = ref('');

const openStyleEditor = (domain: string, code: string) => {
  editingStyleDomain.value = domain;
  editingStyleCode.value = code;
  styleEditorVisible.value = true;
};

const onSaveStyle = ({ oldDomain, newDomain, code }: { oldDomain?: string, newDomain: string, code: string }) => {
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
  
};

const deleteScript = async (script: any) => {
  if (!managingScriptsFor.value) return;
  const isOk = await confirm({
    title: '删除脚本',
    message: `确认删除脚本 "${script.name}" 吗？`,
    type: 'danger',
    confirmText: '删除'
  });
  
  if (isOk) {
    const scriptsObj = { ...state.customScripts };
    const arr = scriptsObj[managingScriptsFor.value.id] || [];
    const idx = arr.findIndex((s: any) => s.id === script.id);
    if (idx !== -1) {
      arr.splice(idx, 1);
      scriptsObj[managingScriptsFor.value.id] = arr;
      await saveCustomScripts(scriptsObj);
    }
  }
};

const managingStylesFor = ref<any>(null);

const openStyleManager = (item: any) => {
  managingStylesFor.value = item;
};

const closeStyleManager = () => {
  managingStylesFor.value = null;
};

const currentStyles = computed(() => {
  if (!managingStylesFor.value) return null;
  return state.customStyles[managingStylesFor.value.id] || {};
});

const deleteDomainStyle = async (domain: string) => {
  if (!managingStylesFor.value) return;
  const isOk = await confirm({
    title: '删除规则',
    message: `确认删除 ${domain} 的所有自定义样式吗？`,
    type: 'danger',
    confirmText: '删除'
  });
  
  if (isOk) {
    const resourceId = managingStylesFor.value.id;
    const newStyles = { ...state.customStyles };
    if (newStyles[resourceId] && newStyles[resourceId][domain]) {
      delete newStyles[resourceId][domain];
      await saveCustomStyles(newStyles);
    }
  }
};
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
  color: var(--text-secondary);
  margin-bottom: 12px;
  margin-top: 24px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.settings-section-title:first-of-type {
  margin-top: 0;
}

.settings-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-soft);
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
  border-bottom: 1px solid var(--border-light);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-row:hover {
  background-color: var(--bg-surface-hover);
}

.settings-row[draggable="true"] {
  cursor: grab;
}

.settings-row[draggable="true"]:active {
  cursor: grabbing;
}

.drag-handle {
  cursor: grab;
  margin-right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.drag-handle:hover {
  background: var(--bg-surface-active);
  color: var(--text-primary);
  transform: scale(1.05);
}

.drag-handle:active {
  cursor: grabbing;
  transform: scale(0.95);
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
  color: var(--text-primary);
}

.settings-info p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 400px;
  line-height: 1.5;
}

.resource-info h3 {
  font-size: 15px;
}

.resource-info p {
  font-size: 13px;
  color: var(--text-secondary);
}

.edit-mode-info {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: center;
  margin-right: 20px;
}

/* Inline form for adding */
.add-row {
  display: flex;
  align-items: center;
  background-color: var(--bg-surface-hover);
  gap: 12px;
}

.inline-input {
  min-width: 180px;
}

.inline-input.name-input {
  flex: 0 0 140px;
  min-width: 120px;
}

.inline-input.url-input {
  flex: 1;
  min-width: 200px;
}

.inline-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  background-color: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s;
  min-width: 120px;
}

.inline-select:focus {
  border-color: var(--color-accent);
}

.flex-1 {
  flex: 1;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

/* Buttons styled by VButton component */

.segmented-control {
  display: flex;
  background: var(--border-light);
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
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;
  user-select: none;
  width: 106px;
  text-align: center;
}

.segmented-control input[type="radio"]:checked+span {
  color: var(--text-primary);
}

.selection-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: 106px;
  background: var(--bg-surface);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
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
  background: var(--bg-surface);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-soft);
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
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
  background: var(--border-light);
  color: var(--text-primary);
}


.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 0;
  font-size: 14px;
}

.domain-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.domain-group {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.domain-title {
  background: var(--bg-surface-hover);
  padding: 10px 16px;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.empty-rule {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.rule-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
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
  color: var(--text-primary);
  margin-bottom: 4px;
  word-break: break-all;
}

.rule-css {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.shrink-0 {
  flex-shrink: 0;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.strategy-option {
  border: 1.5px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-surface);
}

.strategy-option:hover {
  border-color: var(--color-accent);
  background: var(--bg-surface-hover);
}

.strategy-option.active {
  border-color: var(--color-accent);
  background: var(--bg-surface-active);
  box-shadow: 0 0 0 1px var(--color-accent);
}
</style>
