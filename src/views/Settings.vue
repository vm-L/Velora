<template>
  <div class="view settings-view">
    <div class="settings-container">
      <!-- 页面顶部标题与操作栏 -->
      <div class="settings-header">
        <div class="settings-title-area">
          <button class="back-btn" @click="goBack" title="返回">
            <VIcon name="arrow-left" :size="18" />
          </button>
          <div>
            <h1 class="settings-page-title">系统设置</h1>
            <p class="settings-page-subtitle">管理应用程序行为、存储目录、网络服务与自定义规则</p>
          </div>
        </div>
      </div>

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
              {{ isUpdatingAllRules ? '更新中' : '更新' }}
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
            <v-input
              type="number"
              min="1"
              max="10"
              v-model.number="state.maxConcurrentDownloads"
              @change="handleMaxConcurrentChange"
              @blur="handleMaxConcurrentChange"
              class="inline-input"
              style="width: 100px; min-width: 100px;"
            />
          </div>
        </div>

        <!-- 最大内存空间 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>最大内存空间 (MB)</h3>
            <p>设置下载流在内存中的缓冲容量上限，超限时自动批量写盘</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input
              type="number"
              min="64"
              max="8192"
              v-model.number="state.maxMemoryBufferMB"
              @change="handleMaxMemoryChange"
              @blur="handleMaxMemoryChange"
              class="inline-input"
              style="width: 100px; min-width: 100px;"
            />
          </div>
        </div>

        <!-- 图片目录 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>图片目录</h3>
            <p>图片的默认下载目录</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input
              v-model="state.imageDirectory"
              @change="saveImageDirectory(state.imageDirectory)"
              @blur="saveImageDirectory(state.imageDirectory)"
              type="text"
              class="inline-input"
              placeholder="输入或选择目录"
              style="flex: 1; max-width: 300px; margin-right: 8px;"
            />
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
            <v-input
              v-model="state.audioDirectory"
              @change="saveAudioDirectory(state.audioDirectory)"
              @blur="saveAudioDirectory(state.audioDirectory)"
              type="text"
              class="inline-input"
              placeholder="输入或选择目录"
              style="flex: 1; max-width: 300px; margin-right: 8px;"
            />
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
            <v-input
              v-model="state.videoDirectory"
              @change="saveVideoDirectory(state.videoDirectory)"
              @blur="saveVideoDirectory(state.videoDirectory)"
              type="text"
              class="inline-input"
              placeholder="输入或选择目录"
              style="flex: 1; max-width: 300px; margin-right: 8px;"
            />
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
            <v-input
              v-model="state.fileDirectory"
              @change="saveFileDirectory(state.fileDirectory)"
              @blur="saveFileDirectory(state.fileDirectory)"
              type="text"
              class="inline-input"
              placeholder="输入或选择目录"
              style="flex: 1; max-width: 300px; margin-right: 8px;"
            />
            <v-button variant="secondary" class="edit-btn" @click="handleSelectFileDirectory">选择目录</v-button>
          </div>
        </div>

        <!-- 自动匹配目录 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>自动匹配目录</h3>
            <p>下载时自动选择匹配度最高的子目录</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-switch
              :model-value="state.autoMatchDownloadSubdir"
              @change="handleAutoMatchSubdirToggle"
            />
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
            <p>当体积与码率满足条件时自动使用 FFmpeg 进行压缩</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-switch
              :model-value="state.enableVideoCompress"
              @change="handleCompressToggle"
            />
          </div>
        </div>

        <!-- 目标文件大小 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>目标文件大小 (GB)</h3>
            <p>期望压缩后的目标文件大小</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              v-model.number="state.videoCompressTargetGB"
              @change="handleTargetGBChange"
              @blur="handleTargetGBChange"
              class="inline-input"
              style="width: 100px; min-width: 100px;"
            />
          </div>
        </div>

        <!-- 最小码率 -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>最小码率 (kbps)</h3>
            <p>当原视频码率或计算出的压缩码率低于此值时不执行压缩</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-input
              type="number"
              step="100"
              min="100"
              max="50000"
              v-model.number="state.videoCompressMinBitrateKbps"
              @change="handleMinBitrateChange"
              @blur="handleMinBitrateChange"
              class="inline-input"
              style="width: 100px; min-width: 100px;"
            />
          </div>
        </div>
      </div>

      <!-- Local Resources Section (Merged) -->
      <div class="settings-section-title">本地资源</div>
      <div class="settings-card">
        <!-- Mount Directory Row -->
        <div class="settings-row">
          <div class="settings-info">
            <h3>挂载目录</h3>
            <p>已挂载 {{ (state.localResources || []).length }} 个本地资源文件夹</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-button variant="secondary" @click="showMountModal = true">
              <VIcon name="folder" :size="14" style="margin-right: 4px;" />
              挂载目录
            </v-button>
          </div>
        </div>

        <!-- LAN Share Toggle -->
        <div class="settings-row" style="border-top: 1px solid var(--border-light);">
          <div class="settings-info">
            <h3>局域网共享服务</h3>
            <p>允许通过局域网浏览器访问已挂载的本地资源</p>
          </div>
          <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
            <v-switch
              :model-value="state.lanShareEnabled"
              @change="handleToggleLanShare"
            />
          </div>
        </div>

        <!-- Port, Password, Edit Permission, URL -->
        <template v-if="state.lanShareEnabled">
          <!-- Port -->
          <div class="settings-row" style="border-top: 1px solid var(--border-light);">
            <div class="settings-info">
              <h3>服务端口</h3>
              <p>局域网 HTTP 服务监听端口</p>
            </div>
            <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
              <v-input
                v-model="lanPortInput"
                type="number"
                placeholder="8899"
                style="max-width: 140px;"
                @blur="handleApplyLanPort"
                @enter="handleApplyLanPort"
              />
            </div>
          </div>

          <!-- Password -->
          <div class="settings-row" style="border-top: 1px solid var(--border-light);">
            <div class="settings-info">
              <h3>访问密码</h3>
              <p>留空为免密公开访问</p>
            </div>
            <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
              <v-input
                v-model="lanPasswordInput"
                type="text"
                placeholder="留空为免密访问"
                style="max-width: 180px;"
                @blur="handleApplyLanPassword"
                @enter="handleApplyLanPassword"
              />
            </div>
          </div>

          <!-- Allow Edit Toggle -->
          <div class="settings-row" style="border-top: 1px solid var(--border-light);">
            <div class="settings-info">
              <h3>编辑模式</h3>
              <p>允许局域网设备对文件进行编辑</p>
            </div>
            <div class="action-buttons" style="flex: 1; justify-content: flex-end;">
              <v-switch
                :model-value="state.lanShareAllowEdit"
                @change="handleToggleLanAllowEdit"
              />
            </div>
          </div>

          <!-- URL and QR Code Banner -->
          <div class="settings-row">
            <div class="settings-info">
              <h3>服务运行地址</h3>
              <p>{{ lanShareStatus.url }}</p>
            </div>
            <div class="action-buttons" style="flex: 1; justify-content: flex-end; gap: 8px;">
              <v-button variant="secondary" @click="handleCopyLanUrl">
                <VIcon name="copy-text" :size="14" style="margin-right: 4px;" />
                复制链接
              </v-button>
              <v-button variant="primary" @click="showQrModal = true">
                <VIcon name="qrcode" :size="14" style="margin-right: 4px;" />
                手机扫码
              </v-button>
            </div>
          </div>
        </template>
      </div>

      <!-- CMS Resources -->
      <div class="settings-section-title">CMS 资源</div>
      <div class="settings-card">
        <div v-for="(item, index) in state.cmsResources" :key="item.id" class="settings-row"
          @dragover.prevent @dragenter.prevent
          @drop="onDrop($event, 'cms', index)">

          <div class="drag-handle" title="拖动排序" draggable="true" @dragstart="onDragStart($event, 'cms', index)">
            <VIcon name="drag-handle" :size="14" />
          </div>

          <template v-if="editingId === item.id">
            <div class="settings-info edit-mode-info" @focusout="handleEditFocusOut($event, 'cms', index)">
              <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="名称" @enter="saveEdit('cms', index)" />
              <v-input v-model="editTempUrl" type="text" class="inline-input url-input flex-1" placeholder="URL" @blur="editTempUrl = formatUrlPrefix(editTempUrl)" @enter="saveEdit('cms', index)" />
            </div>
            <div class="action-buttons">
              <v-button variant="secondary" class="cancel-btn" @mousedown.prevent @click="cancelEdit">取消</v-button>
              <v-button variant="primary" class="save-btn" @mousedown.prevent @click="saveEdit('cms', index)">保存</v-button>
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
          <v-input v-model="newCmsUrl" type="text" placeholder="https://" class="inline-input url-input flex-1" @blur="newCmsUrl = formatUrlPrefix(newCmsUrl)" @enter="addCmsResource" />
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
            <VIcon name="drag-handle" :size="14" />
          </div>

          <template v-if="editingId === item.id">
            <div class="settings-info edit-mode-info" @focusout="handleEditFocusOut($event, 'ext', index)">
              <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="名称" @enter="saveEdit('ext', index)" />
              <v-input v-model="editTempUrl" type="text" class="inline-input url-input flex-1" placeholder="URL" @blur="editTempUrl = formatUrlPrefix(editTempUrl)" @enter="saveEdit('ext', index)" />
            </div>
            <div class="action-buttons">
              <v-button variant="secondary" class="cancel-btn" @mousedown.prevent @click="cancelEdit">取消</v-button>
              <v-button variant="primary" class="save-btn" @mousedown.prevent @click="saveEdit('ext', index)">保存</v-button>
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
          <v-input v-model="newExtUrl" type="text" placeholder="https://" class="inline-input url-input flex-1" @blur="newExtUrl = formatUrlPrefix(newExtUrl)" @enter="addExternalSite" />
          <v-button variant="primary" class="add-btn" :disabled="!newExtName || !newExtUrl" @click="addExternalSite">添加</v-button>
        </div>
      </div>

      <!-- Resource Backup & Migration -->
      <div class="settings-section-title">资源备份与迁移</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-info" style="min-width: 0; flex: 1;">
            <h3>配置与资源备份 (.json)</h3>
            <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">支持选择导出与导入设置项、网页列表、域名解析规则、脚本与 CMS 资源配置</p>
          </div>
          <div class="action-buttons" style="display: flex; gap: 8px;">
            <v-button variant="secondary" @click="handleImportResources">
              <v-icon name="import" :size="14" />
              <span>导入</span>
            </v-button>
            <v-button variant="secondary" @click="handleExportResources">
              <v-icon name="export" :size="14" />
              <span>导出</span>
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

    <!-- Unified Config & Resources Backup Dialog -->
    <ConfigBackupDialog
      v-model:visible="showBackupDialog"
      :mode="backupDialogMode"
      :backup-data="pendingImportData"
      @confirm-export="handleConfirmExport"
      @confirm-import="handleConfirmImport"
      @cancel="pendingImportData = null"
    />

    <!-- Mount Local Resources Modal -->
    <div v-if="showMountModal" class="modal-overlay" @click.self="showMountModal = false">
      <div class="modal-content" style="max-width: 680px; width: 90vw;">
        <div class="modal-header">
          <h3>挂载本地目录</h3>
          <v-button variant="icon" class="modal-close-btn" @click="showMountModal = false">
            <VIcon name="close" :size="20" />
          </v-button>
        </div>
        <div class="modal-body" style="padding: 16px 20px; max-height: 60vh; overflow-y: auto;">
          <div v-if="!state.localResources || state.localResources.length === 0" class="empty-state" style="padding: 30px 0;">
            暂未挂载任何本地目录
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 8px;">
            <div
              v-for="(item, index) in state.localResources"
              :key="item.id"
              class="settings-row"
              style="border: 1px solid var(--border-light); border-radius: 8px; padding: 10px 14px; background: var(--bg-hover-soft);"
              @dragover.prevent @dragenter.prevent
              @drop="onDrop($event, 'local', index)"
            >
              <div class="drag-handle" title="拖动排序" draggable="true" @dragstart="onDragStart($event, 'local', index)">
                <VIcon name="drag-handle" :size="14" />
              </div>

              <template v-if="editingId === item.id">
                <div class="settings-info edit-mode-info" @focusout="handleEditFocusOut($event, 'local', index)">
                  <v-input v-model="editTempName" type="text" class="inline-input name-input" placeholder="挂载名称" @enter="saveEdit('local', index)" />
                  <div class="dir-input-group flex-1" style="display: flex; gap: 8px; align-items: center;">
                    <v-input v-model="editTempPath" type="text" class="inline-input url-input flex-1" placeholder="本地目录路径" @enter="saveEdit('local', index)" />
                    <v-button variant="secondary" @mousedown.prevent @click="handleSelectEditLocalDir">选择目录</v-button>
                  </div>
                </div>
                <div class="action-buttons">
                  <v-button variant="secondary" class="cancel-btn" @mousedown.prevent @click="cancelEdit">取消</v-button>
                  <v-button variant="primary" class="save-btn" @mousedown.prevent @click="saveEdit('local', index)">保存</v-button>
                </div>
              </template>
              <template v-else>
                <div class="settings-info resource-info">
                  <h3>{{ item.name }}</h3>
                  <p>{{ item.path || item.url }}</p>
                </div>
                <div class="action-buttons">
                  <v-button variant="secondary" class="edit-btn" @click="startEdit(item)">编辑</v-button>
                  <v-button variant="danger-soft" class="delete-btn" @click="removeLocalResource(index)">删除</v-button>
                </div>
              </template>
            </div>
          </div>

          <!-- Add New Local Resource inside Modal -->
          <div class="settings-row add-row" style="margin-top: 14px; border: 1px dashed var(--border-color); border-radius: 8px; padding: 12px;">
            <v-input v-model="newLocalName" type="text" placeholder="挂载名称" class="inline-input name-input" style="max-width: 140px;" />
            <v-input v-model="newLocalPath" type="text" placeholder="本地文件夹路径" class="inline-input url-input flex-1" />
            <v-button variant="secondary" @mousedown.prevent @click="handleSelectNewLocalDir">选择目录</v-button>
            <v-button variant="primary" class="add-btn" :disabled="!newLocalName || !newLocalPath" @click="addLocalResource">添加</v-button>
          </div>
        </div>
        <div class="modal-footer" style="padding: 12px 20px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end;">
          <v-button variant="primary" @click="showMountModal = false">完成</v-button>
        </div>
      </div>
    </div>

    <!-- LAN Share QR Code Modal -->
    <div v-if="showQrModal" class="modal-overlay" @click.self="showQrModal = false">
      <div class="modal-content" style="max-width: 360px; width: 90vw; text-align: center;">
        <div class="modal-header">
          <h3>手机扫码访问</h3>
          <v-button variant="icon" class="modal-close-btn" @click="showQrModal = false">
            <VIcon name="close" :size="20" />
          </v-button>
        </div>
        <div class="modal-body" style="padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
          <div class="qr-box" v-html="lanQrCodeSvg" style="line-height: 0; padding: 10px; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          <p style="font-size: 13px; color: var(--text-secondary); word-break: break-all; margin-top: 4px;">
            {{ lanShareStatus.url }}
          </p>
          <p style="font-size: 12px; color: var(--text-secondary);">
            请确保手机与当前电脑连接在同一局域网 (Wi-Fi)
          </p>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: space-between; padding: 12px 20px; border-top: 1px solid var(--border-light);">
          <v-button variant="secondary" size="small" @click="handleCopyLanUrl">复制链接</v-button>
          <v-button variant="primary" size="small" @click="showQrModal = false">完成</v-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { CustomScript, ParseRule, useSettings } from '../composables/useSettings';
import { useConfirm } from '../composables/useConfirm';
import { useMessage } from '../composables/useMessage';
import { useOpenedResources } from '../composables/useOpenedResources';
import { useOpenedCMS } from '../composables/useOpenedCMS';
import { logger } from '../services/logger';
import { generateQrCodeSvg } from '../utils/qrcode';
import VButton from '../components/base/VButton.vue';
import VIcon from '../components/base/VIcon.vue';

import SettingsScriptEditor from '../components/features/SettingsScriptEditor.vue';
import SettingsStyleEditor from '../components/features/SettingsStyleEditor.vue';
import ParseRuleDialog from '../components/features/ParseRuleDialog.vue';
import AdBlockDialog from '../components/features/AdBlockDialog.vue';
import VInput from '../components/base/VInput.vue';
import VSwitch, { type VSwitchOption } from '../components/base/VSwitch.vue';
import ConfigBackupDialog from '../components/features/ConfigBackupDialog.vue';
import type { ConfigBackupSectionKey } from '../types/backup';

const router = useRouter();

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};

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
  saveAutoMatchDownloadSubdir,
  saveEnableVideoCompress,
  saveVideoCompressTargetGB,
  saveVideoCompressMinBitrateKbps,
  saveLocalResources,
  saveCmsResources, 
  saveExternalSites, 
  saveCustomStyles,
  saveCustomScripts,
  saveCustomParseRules,
  syncAllAdBlockSources,
  exportConfigBackup,
  importConfigBackup,
  saveLanShareEnabled,
  saveLanShareAllowEdit,
  saveLanShareSettings
} = useSettings();
const { confirm } = useConfirm();
const { showMessage } = useMessage();

const handleAutoMatchSubdirToggle = (val: boolean) => {
  saveAutoMatchDownloadSubdir(val);
  showMessage(val ? '已开启下载自动匹配子目录' : '已关闭下载自动匹配子目录', 'info');
};

const handleCompressToggle = (val: boolean) => {
  saveEnableVideoCompress(val);
  showMessage(val ? '已开启下载后智能视频压缩' : '已关闭下载后视频压缩', 'info');
};

// Local Resource Mount Modal State
const showMountModal = ref<boolean>(false);

// LAN Share States & Handlers
const lanPortInput = ref<number>(8899);
const lanPasswordInput = ref<string>('');
const showQrModal = ref<boolean>(false);
const lanShareStatus = ref<{
  running: boolean;
  port: number;
  ip: string;
  url: string;
  hasPassword: boolean;
  allowEdit: boolean;
}>({
  running: false,
  port: 8899,
  ip: '127.0.0.1',
  url: 'http://127.0.0.1:8899',
  hasPassword: false,
  allowEdit: false
});

const refreshLanStatus = async () => {
  if (window.electronAPI && window.electronAPI.getLanShareStatus) {
    try {
      const status = await window.electronAPI.getLanShareStatus();
      if (status) {
        lanShareStatus.value = status;
        lanPortInput.value = status.port || state.lanSharePort || 8899;
        lanPasswordInput.value = state.lanSharePassword || '';
      }
    } catch (err: any) {
      logger.error('Settings', `Failed to get LAN status: ${err?.message}`);
    }
  }
};

onMounted(async () => {
  await refreshLanStatus();
});

const lanQrCodeSvg = computed(() => {
  return generateQrCodeSvg(lanShareStatus.value.url, 200);
});

const handleToggleLanShare = async (val: boolean) => {
  try {
    await saveLanShareEnabled(val);
    await refreshLanStatus();
    showMessage(val ? `局域网共享服务已启动: ${lanShareStatus.value.url}` : '局域网共享服务已停止', val ? 'success' : 'info');
  } catch (err: any) {
    showMessage(`操作失败: ${err?.message}`, 'error');
  }
};

const handleApplyLanPort = async () => {
  const port = parseInt(String(lanPortInput.value), 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    showMessage('请输入 1024~65535 之间的有效端口号', 'warning');
    lanPortInput.value = state.lanSharePort || 8899;
    return;
  }
  if (port === state.lanSharePort && lanShareStatus.value?.port === port) {
    return;
  }
  try {
    const res = await saveLanShareSettings({
      enabled: state.lanShareEnabled,
      port,
      password: state.lanSharePassword,
      allowEdit: state.lanShareAllowEdit
    });
    await refreshLanStatus();
    if (res && res.error) {
      showMessage(`端口应用失败: ${res.error}`, 'error');
    } else {
      showMessage(`已应用新端口: ${port}`, 'success');
    }
  } catch (err: any) {
    showMessage(`端口应用失败: ${err?.message}`, 'error');
  }
};

const handleApplyLanPassword = async () => {
  const pwd = lanPasswordInput.value.trim();
  if (pwd === (state.lanSharePassword || '')) {
    return;
  }
  try {
    await saveLanShareSettings({
      enabled: state.lanShareEnabled,
      port: state.lanSharePort,
      password: pwd,
      allowEdit: state.lanShareAllowEdit
    });
    await refreshLanStatus();
    showMessage(pwd ? '访问密码已保存' : '已清除访问密码 (免密访问)', 'success');
  } catch (err: any) {
    showMessage(`密码保存失败: ${err?.message}`, 'error');
  }
};

const handleToggleLanAllowEdit = async (val: boolean) => {
  try {
    await saveLanShareAllowEdit(val);
    await refreshLanStatus();
    showMessage(val ? '已开启局域网设备编辑权限' : '已设置为只读模式', 'info');
  } catch (err: any) {
    showMessage(`操作失败: ${err?.message}`, 'error');
  }
};

const handleCopyLanUrl = () => {
  if (!lanShareStatus.value.url) return;
  navigator.clipboard.writeText(lanShareStatus.value.url).then(() => {
    showMessage('已复制局域网访问链接到剪贴板', 'success');
  }).catch(() => {
    showMessage('复制链接失败', 'error');
  });
};

const handleTargetGBChange = (val?: any) => {
  const raw = val !== undefined && val !== null
    ? (typeof val === 'object' && 'target' in val ? (val.target as HTMLInputElement)?.value : val)
    : state.videoCompressTargetGB;
  let num = parseFloat(String(raw));
  if (isNaN(num) || num < 0.1) num = 0.1;
  else if (num > 50) num = 50;
  num = Math.round(num * 10) / 10;
  state.videoCompressTargetGB = num;
  saveVideoCompressTargetGB(num);
};

const handleMinBitrateChange = (val?: any) => {
  const raw = val !== undefined && val !== null
    ? (typeof val === 'object' && 'target' in val ? (val.target as HTMLInputElement)?.value : val)
    : state.videoCompressMinBitrateKbps;
  let num = parseInt(String(raw), 10);
  if (isNaN(num) || num < 100) num = 100;
  else if (num > 50000) num = 50000;
  state.videoCompressMinBitrateKbps = num;
  saveVideoCompressMinBitrateKbps(num);
};

const showBackupDialog = ref(false);
const backupDialogMode = ref<'export' | 'import'>('export');
const pendingImportData = ref<any>(null);

const handleExportResources = () => {
  backupDialogMode.value = 'export';
  showBackupDialog.value = true;
};

const handleConfirmExport = async (selectedKeys: ConfigBackupSectionKey[]) => {
  try {
    const res = await exportConfigBackup(selectedKeys);
    if (res.success && res.filePath) {
      showMessage(`配置备份已导出至: ${res.filePath}`, 'success');
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
    backupDialogMode.value = 'import';
    showBackupDialog.value = true;
  } catch (err: any) {
    showMessage(`读取导入文件失败: ${err.message}`, 'error');
  }
};

const handleConfirmImport = async (payload: { selectedKeys: ConfigBackupSectionKey[]; mode: 'merge' | 'overwrite' }) => {
  if (!pendingImportData.value) return;
  try {
    await importConfigBackup(pendingImportData.value, payload.selectedKeys, payload.mode);
    const modeText = payload.mode === 'overwrite' ? '覆盖重置' : '增量合并';
    showMessage(`所选配置项已成功以【${modeText}】模式完成导入！`, 'success');
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
  const msgId = showMessage('正在同步更新所有启用的广告过滤规则', 'loading', 0);

  try {
    await syncAllAdBlockSources();
    showMessage(`规则同步完成，当前已生效 ${totalActiveRulesCount.value.toLocaleString()} 条过滤规则`, 'success', 2500, undefined, msgId);
  } catch (err: any) {
    showMessage(`更新失败: ${err.message}`, 'error', 3000, undefined, msgId);
  } finally {
    isUpdatingAllRules.value = false;
  }
};

const newLocalName = ref('');
const newLocalPath = ref('');

const newCmsName = ref('');
const newCmsUrl = ref('https://');

const newExtName = ref('');
const newExtUrl = ref('https://');

const editingId = ref<string | null>(null);
const editTempName = ref('');
const editTempUrl = ref('');
const editTempPath = ref('');

const isSelectingDirectory = ref(false);

const formatUrlPrefix = (val: string): string => {
  const trimmed = (val || '').trim();
  if (!trimmed || trimmed === 'https://' || trimmed === 'http://') return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  return `https://${trimmed}`;
};

const updateBehavior = (behavior: string) => {
  setCloseBehavior(behavior);
};

const handleSelectDirectory = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      state.imageDirectory = dir;
      saveImageDirectory(dir);
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleSelectAudioDirectory = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      state.audioDirectory = dir;
      saveAudioDirectory(dir);
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleSelectVideoDirectory = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      state.videoDirectory = dir;
      saveVideoDirectory(dir);
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleSelectFileDirectory = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      state.fileDirectory = dir;
      saveFileDirectory(dir);
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleSelectNewLocalDir = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      newLocalPath.value = dir;
      if (!newLocalName.value) {
        // 提取最后一级目录名作为默认资源名称
        const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
        newLocalName.value = parts[parts.length - 1] || '本地目录';
      }
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleSelectEditLocalDir = async () => {
  isSelectingDirectory.value = true;
  try {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      editTempPath.value = dir;
    }
  } finally {
    setTimeout(() => {
      isSelectingDirectory.value = false;
    }, 300);
  }
};

const handleMaxConcurrentChange = (val?: any) => {
  const raw = val !== undefined && val !== null
    ? (typeof val === 'object' && 'target' in val ? (val.target as HTMLInputElement)?.value : val)
    : state.maxConcurrentDownloads;
  let num = parseInt(String(raw), 10);
  if (isNaN(num) || num < 1) num = 1;
  else if (num > 10) num = 10;
  state.maxConcurrentDownloads = num;
  saveMaxConcurrentDownloads(num);
};

const handleMaxMemoryChange = (val?: any) => {
  const raw = val !== undefined && val !== null
    ? (typeof val === 'object' && 'target' in val ? (val.target as HTMLInputElement)?.value : val)
    : state.maxMemoryBufferMB;
  let num = parseInt(String(raw), 10);
  if (isNaN(num) || num < 64) num = 64;
  else if (num > 8192) num = 8192;
  state.maxMemoryBufferMB = num;
  saveMaxMemoryBufferMB(num);
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const addLocalResource = () => {
  if (!newLocalName.value || !newLocalPath.value) return;
  const resources = [...(state.localResources || [])];
  resources.push({
    id: generateId(),
    name: newLocalName.value,
    path: newLocalPath.value,
    url: newLocalPath.value
  });
  saveLocalResources(resources);
  newLocalName.value = '';
  newLocalPath.value = '';
  showMessage('本地资源挂载成功', 'success');
};

const removeLocalResource = async (index: number) => {
  const resource = state.localResources[index];
  const confirmed = await confirm({
    title: '移除本地资源',
    message: `确定要移除本地挂载目录 "${resource.name}" 吗？（不会删除本地实际文件）`,
    confirmText: '移除',
    cancelText: '取消',
    type: 'danger'
  });
  if (!confirmed) return;

  const resources = [...state.localResources];
  resources.splice(index, 1);
  saveLocalResources(resources);
};

const addCmsResource = () => {
  const formattedUrl = formatUrlPrefix(newCmsUrl.value);
  const trimmedName = newCmsName.value.trim();
  if (!trimmedName || !formattedUrl) return;
  const resources = [...state.cmsResources];
  resources.push({
    id: generateId(),
    name: trimmedName,
    url: formattedUrl
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
  const formattedUrl = formatUrlPrefix(newExtUrl.value);
  const trimmedName = newExtName.value.trim();
  if (!trimmedName || !formattedUrl) return;
  const sites = [...state.externalSites];
  sites.push({
    id: generateId(),
    name: trimmedName,
    url: formattedUrl
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
  editTempUrl.value = item.url || '';
  editTempPath.value = item.path || item.url || '';
};

const cancelEdit = () => {
  editingId.value = null;
  editTempName.value = '';
  editTempUrl.value = '';
  editTempPath.value = '';
};

const { updateResourceUrl } = useOpenedResources();
const { updateCMSUrl } = useOpenedCMS();

const handleEditFocusOut = (e: FocusEvent, type: 'local' | 'cms' | 'ext', index: number) => {
  if (isSelectingDirectory.value) {
    return;
  }
  const currentTarget = e.currentTarget as HTMLElement;
  const relatedTarget = e.relatedTarget as HTMLElement;
  const parentRow = currentTarget.closest('.settings-row');
  if (parentRow && relatedTarget && parentRow.contains(relatedTarget)) {
    return;
  }
  if (editingId.value) {
    saveEdit(type, index);
  }
};

const saveEdit = (type: 'local' | 'cms' | 'ext', index: number) => {
  if (!editingId.value) return;
  const trimmedName = editTempName.value.trim();
  if (type === 'local') {
    const trimmedPath = editTempPath.value.trim();
    if (trimmedName && trimmedPath) {
      const resources = [...state.localResources];
      if (resources[index]) {
        resources[index] = {
          ...resources[index],
          name: trimmedName,
          path: trimmedPath,
          url: trimmedPath
        };
        saveLocalResources(resources);
      }
    }
  } else if (type === 'cms') {
    const formattedUrl = formatUrlPrefix(editTempUrl.value);
    if (trimmedName && formattedUrl) {
      const resources = [...state.cmsResources];
      if (resources[index]) {
        resources[index] = { ...resources[index], name: trimmedName, url: formattedUrl };
        saveCmsResources(resources);
        updateCMSUrl(resources[index].id, formattedUrl);
      }
    }
  } else {
    const formattedUrl = formatUrlPrefix(editTempUrl.value);
    if (trimmedName && formattedUrl) {
      const sites = [...state.externalSites];
      if (sites[index]) {
        sites[index] = { ...sites[index], name: trimmedName, url: formattedUrl };
        saveExternalSites(sites);
        updateResourceUrl(sites[index].id, formattedUrl);
      }
    }
  }
  cancelEdit();
};

// Drag and drop sorting
const onDragStart = (e: DragEvent, type: 'local' | 'cms' | 'ext', index: number) => {
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

const onDrop = (e: DragEvent, targetType: 'local' | 'cms' | 'ext', targetIndex: number) => {
  if (!e.dataTransfer) return;
  const dataString = e.dataTransfer.getData('text/plain');
  if (!dataString) return;

  try {
    const data = JSON.parse(dataString);
    if (data.type !== targetType) return; // Prevent dragging between different groups

    const sourceIndex = data.index;
    if (sourceIndex === targetIndex) return;

    if (targetType === 'local') {
      const items = [...state.localResources];
      const [movedItem] = items.splice(sourceIndex, 1);
      items.splice(targetIndex, 0, movedItem);
      saveLocalResources(items);
    } else if (targetType === 'cms') {
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
    message: `确定要删除匹配域名 "${rule.domain}" (${rule.actionType === 'download' ? '下载' : '复制'}) 吗？`,
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
  if (!managingScriptsFor.value) return;
  const resId = managingScriptsFor.value.id;
  const allScripts = { ...state.customScripts };
  if (!allScripts[resId]) {
    allScripts[resId] = [];
  }
  const targetArray = [...allScripts[resId]];
  const trimmedDomain = (updatedScript.domain || '').trim();
  const scriptId = updatedScript.id || editingOriginalId.value;
  updatedScript.id = scriptId;
  updatedScript.domain = trimmedDomain;

  // 检查是否修改了匹配域名
  const isDomainChanged = editingOriginalDomain.value.trim() !== '' && trimmedDomain !== editingOriginalDomain.value.trim();

  // 1. 只有当修改了匹配域名时，才检查新域名是否与其他已有脚本冲突
  if (isDomainChanged) {
    const duplicateScript = targetArray.find(s => s.id !== scriptId && (s.domain || '').trim() === trimmedDomain);

    if (duplicateScript) {
      const isConfirmed = await confirm({
        title: '匹配域名重复',
        message: `已存在相同匹配域名的脚本 "${duplicateScript.name || duplicateScript.domain}"，是否合并脚本内容？`,
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

.settings-header {
  margin-bottom: 24px;
}

.settings-title-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: var(--bg-surface-hover);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  &:active {
    transform: scale(0.95);
  }
}

.settings-page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.settings-page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
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
