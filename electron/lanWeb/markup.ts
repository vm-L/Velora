export const lanWebMarkup = `<div id="app">
    <!-- Header -->
    <header>
      <a href="/" class="brand-logo">
        <img src="/icon.png" class="brand-logo-img" alt="Velora" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='block';">
        <svg class="brand-logo-svg" style="display:none;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span>Velora</span>
      </a>

      <div class="header-actions">
        <div id="network-indicator" class="network-indicator" title="局域网连接正常">
          <span class="network-dot"></span>
          <span id="network-text">已连接</span>
        </div>
        <button id="theme-btn" class="v-btn v-btn-icon" title="切换主题">
          <svg id="theme-icon-light" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg id="theme-icon-dark" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
        <button id="logout-btn" class="v-btn v-btn-secondary" style="display:none;" title="退出登录">退出</button>
      </div>
    </header>

    <main>
      <!-- Resource Switcher Tabs -->
      <div id="resource-tabs" class="resource-tabs-wrap"></div>

      <!-- Workspace Toolbar -->
      <div class="workspace-toolbar">
        <div class="toolbar-nav-group">
          <button id="nav-back-btn" class="v-btn v-btn-icon nav-back-btn" title="返回上一级" disabled onclick="navigateUp()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div id="breadcrumbs" class="breadcrumb-container"></div>
        </div>

        <div class="toolbar-tools">
          <div class="search-wrap">
            <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="search-input" class="v-input search-input" placeholder="搜索文件或目录">
          </div>
          <select id="sort-select" class="sort-select">
            <option value="mtime-desc">按修改时间 (最新)</option>
            <option value="mtime-asc">按修改时间 (最早)</option>
            <option value="name-asc">按名称 (A-Z)</option>
            <option value="name-desc">按名称 (Z-A)</option>
            <option value="size-desc">按大小 (从大到小)</option>
            <option value="size-asc">按大小 (从小到大)</option>
          </select>
          <button id="new-folder-btn" class="v-btn v-btn-secondary" style="display:none;" title="新建文件夹">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span class="btn-text">新建文件夹</span>
          </button>
          <button id="refresh-btn" class="v-btn v-btn-secondary" title="刷新列表">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span class="btn-text">刷新</span>
          </button>
        </div>
      </div>

      <!-- File Grid -->
      <div id="file-grid" class="file-grid"></div>
    </main>

    <!-- Auth Modal -->
    <div id="auth-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>局域网访问认证</h3>
        </div>
        <div class="modal-body">
          <p style="font-size:13px; color:var(--text-secondary);">该资源库已启用密码保护，请输入访问密码：</p>
          <input type="password" id="auth-password" class="v-input" placeholder="请输入密码" autocomplete="current-password">
        </div>
        <div class="modal-footer">
          <button id="auth-submit-btn" class="v-btn v-btn-primary">验证进入</button>
        </div>
      </div>
    </div>

    <!-- Video Player Modal -->
    <div id="video-modal" class="modal-overlay" style="display:none;">
      <div class="player-modal-content">
        <div class="modal-header" style="background:var(--bg-surface); border-color:var(--border-color);">
          <span id="video-modal-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;"></span>
          <button class="v-btn v-btn-icon" onclick="closeVideoModal()">✕</button>
        </div>
        <div class="player-video-wrap">
          <video id="main-video" controls playsinline></video>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <div id="image-modal" class="modal-overlay" style="display:none;" onclick="closeImageModal()">
      <div class="image-modal-content">
        <img id="main-image" src="" alt="preview">
      </div>
    </div>

    <!-- Action / Edit Modal (New Folder, Rename, Delete) -->
    <div id="action-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="action-modal-title">操作</h3>
          <button class="v-btn v-btn-icon" onclick="closeActionModal()">✕</button>
        </div>
        <div class="modal-body" id="action-modal-body"></div>
        <div class="modal-footer" id="action-modal-footer"></div>
      </div>
    </div>

    <!-- Multi-Select Floating Bar -->
    <div id="multi-select-bar" class="multi-select-bar" style="display:none;">
      <span id="multi-select-count" class="multi-select-count">已选 0 项</span>
      <div class="multi-select-actions">
        <button id="batch-select-all-btn" class="v-btn v-btn-secondary" onclick="toggleSelectAll()">全选</button>
        <button id="batch-merge-btn" class="v-btn v-btn-primary" style="display:none;" onclick="openBatchMergeModal()">
          <span>合并视频</span>
        </button>
        <button id="batch-compress-btn" class="v-btn v-btn-secondary" style="display:none;" onclick="openBatchCompressModal()">
          <span>压缩视频</span>
        </button>
        <button id="batch-move-btn" class="v-btn v-btn-secondary" style="display:none;" onclick="openBatchMoveModal()">
          <span>移动</span>
        </button>
        <button class="v-btn v-btn-secondary" onclick="clearSelection()">取消选择</button>
      </div>
    </div>

    <!-- Dedicated Fullscreen Video Trimmer Modal -->
    <div id="video-edit-modal" class="modal-overlay" style="display:none;">
      <div class="video-edit-modal-content">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
            <span id="video-edit-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:15px; font-weight:600;">视频剪辑</span>
          </div>
          <button class="v-btn v-btn-icon" onclick="closeVideoEditModal()">✕</button>
        </div>
        <div class="trimmer-video-wrap">
          <video id="trimmer-video" playsinline muted onclick="toggleTrimmerPlay()"></video>
        </div>
        <div class="trimmer-controls">
          <div id="trimmer-time-display" class="time-display" title="点击或左右滑动调节进度">
            <div id="trimmer-time-progress" class="time-display-progress"></div>
            <span id="trimmer-time-text" class="time-display-text">00:00.0 / 00:00.0</span>
          </div>

          <div class="time-steppers" id="trim-steppers" oncontextmenu="return false;">
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(-10, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(-10, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">-10s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(-1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(-1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">-1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(-0.1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(-0.1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">-0.1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(0.1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(0.1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">+0.1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(1, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(1, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">+1s</button>
            <button class="v-btn v-btn-secondary" onmousedown="startSeek(10, event)" onmouseup="stopSeek()" onmouseleave="stopSeek()" ontouchstart="startSeek(10, event)" ontouchend="stopSeek()" ontouchcancel="stopSeek()">+10s</button>
          </div>

          <div class="trimmer-action-row" oncontextmenu="return false;">
            <button id="trim-mute-btn" class="v-btn v-btn-secondary" onclick="toggleTrimmerMute()">解除静音</button>
            <button id="trim-speed-btn" class="v-btn v-btn-secondary" onclick="toggleTrimmerSpeed()">倍速: 1x</button>
            <button id="trim-step-mode-btn" class="v-btn v-btn-secondary" onclick="toggleTrimmerStepMode()">跨度: 秒 (s)</button>
          </div>

          <div class="trim-points-row">
            <button class="v-btn v-btn-secondary" onclick="markTrimStart()">设为起点</button>
            <button id="trimmer-add-segment-btn" class="v-btn v-btn-primary" onclick="addNewSegment()">+ 新增片段</button>
            <button class="v-btn v-btn-secondary" onclick="markTrimEnd()">设为终点</button>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <div style="font-size:12px; font-weight:600; color:var(--text-secondary);">已选片段清单：</div>
            <div style="display:flex; align-items:center; gap:6px;">
              <button id="trim-move-prev-btn" class="v-btn v-btn-secondary" style="padding:2px 8px; font-size:11px; height:24px;" onclick="moveSelectedSegment(-1)">◀ 前移</button>
              <button id="trim-move-next-btn" class="v-btn v-btn-secondary" style="padding:2px 8px; font-size:11px; height:24px;" onclick="moveSelectedSegment(1)">后移 ▶</button>
            </div>
          </div>
          <div id="trimmer-segments-list" class="segment-chips-container">
            <span style="font-size:12px; color:var(--text-muted);">暂未添加多片段，默认全时长</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
            <label style="font-size:12px; color:var(--text-secondary);">保存模式</label>
            <div class="segmented-control" id="trim-save-segmented">
              <div class="segmented-option active" data-value="replace" onclick="setTrimSaveMode('replace')">覆盖保存</div>
              <div class="segmented-option" data-value="saveAs" onclick="setTrimSaveMode('saveAs')">另存为</div>
            </div>
            <input type="hidden" id="trim-save-mode" value="replace">
          </div>
          <div id="trim-filename-wrap" style="display:none; flex-direction:column; gap:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">导出文件名</label>
            <input type="text" id="trim-filename-input" class="v-input" placeholder="输入输出文件名" style="width:100%;">
          </div>
        </div>
        <div class="modal-footer">
          <div id="trimmer-summary-display" style="font-size:12px; font-weight:500; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">总时长: 00:00.0 (-00:00.0)</div>
          <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
            <button class="v-btn v-btn-secondary" onclick="closeVideoEditModal()">取消</button>
            <button class="v-btn v-btn-primary" onclick="submitVideoCut()">确认</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Video Merge Modal -->
    <div id="video-merge-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content" style="max-width:560px;">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path><path d="M4 18V4a2 2 0 0 1 2-2h14"></path></svg>
            <h3>合并视频</h3>
          </div>
          <button class="v-btn v-btn-icon" onclick="closeVideoMergeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px; color:var(--text-secondary); margin:0;">系统将按从上到下的顺序拼接视频，可点击上下箭头调整拼接次序：</p>
          <div id="merge-video-items" class="merge-list"></div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:6px;">
            <label style="font-size:12px; color:var(--text-secondary);">合并产物文件名</label>
            <input type="text" id="merge-filename-input" class="v-input" placeholder="输入合并文件名" style="width:100%;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="v-btn v-btn-secondary" onclick="closeVideoMergeModal()">取消</button>
          <button class="v-btn v-btn-primary" id="start-merge-btn" onclick="submitVideoMerge()">开始合并</button>
        </div>
      </div>
    </div>

    <!-- Video Compress Modal -->
    <div id="video-compress-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content">
        <div class="modal-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            <h3 id="compress-modal-title">压缩视频</h3>
          </div>
          <button class="v-btn v-btn-icon" onclick="closeVideoCompressModal()">✕</button>
        </div>
        <div class="modal-body">
          <label style="font-size:12px; color:var(--text-secondary);">目标码率档位：</label>
          <div class="compress-presets">
            <button class="preset-btn" id="preset-1000" onclick="selectCompressPreset(1000)">流畅 (1000k)</button>
            <button class="preset-btn active" id="preset-2000" onclick="selectCompressPreset(2000)">标准 (2000k)</button>
            <button class="preset-btn" id="preset-3500" onclick="selectCompressPreset(3500)">高清 (3500k)</button>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">自定义码率 (kbps)</label>
            <input type="number" id="compress-bitrate-input" class="v-input" value="2000" min="300" max="20000" style="width:100%;">
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">保存模式</label>
            <div class="segmented-control" id="compress-save-segmented">
              <div class="segmented-option" data-value="replace" onclick="setCompressSaveMode('replace')">覆盖保存</div>
              <div class="segmented-option active" data-value="saveAs" onclick="setCompressSaveMode('saveAs')">另存为</div>
            </div>
            <input type="hidden" id="compress-mode-select" value="saveAs">
          </div>
          <div id="compress-filename-wrap" style="display:flex; flex-direction:column; gap:4px;">
            <label style="font-size:12px; color:var(--text-secondary);">导出文件名</label>
            <input type="text" id="compress-filename-input" class="v-input" placeholder="输入输出文件名" style="width:100%;">
          </div>
        </div>
        <div class="modal-footer">
          <button class="v-btn v-btn-secondary" onclick="closeVideoCompressModal()">取消</button>
          <button class="v-btn v-btn-primary" onclick="submitVideoCompress()">开始压缩</button>
        </div>
      </div>
    </div>

    <!-- Task Progress Modal -->
    <div id="task-progress-modal" class="modal-overlay" style="display:none;">
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-header">
          <h3 id="task-progress-title">正在处理</h3>
          <button class="v-btn v-btn-icon" onclick="minimizeTaskProgress()" title="转入后台处理">✕</button>
        </div>
        <div class="modal-body">
          <div class="progress-header">
            <span id="task-progress-status" style="color:var(--text-secondary);">正在初始化</span>
            <strong id="task-progress-percent" style="font-family:monospace;">0%</strong>
          </div>
          <div class="progress-bar-bg">
            <div id="task-progress-fill" class="progress-bar-fill"></div>
          </div>
          <!-- 排队等待列表 -->
          <div id="task-queue-preview" style="display:none; margin-top:14px; border-top:1px dashed var(--border-light); padding-top:10px;">
            <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
              等待排队处理 (<span id="task-queue-count">0</span>)
            </div>
            <div id="task-queue-items" style="max-height:100px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;"></div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="v-btn v-btn-secondary" onclick="minimizeTaskProgress()" title="缩小到右下角，继续进行其他操作">后台处理</button>
          <button id="task-cancel-btn" class="v-btn v-btn-danger-soft" onclick="cancelCurrentTask()">取消任务</button>
        </div>
      </div>
    </div>

    <!-- Task Floating Capsule Widget (Mobile & Desktop) -->
    <div id="task-floating-capsule" class="task-floating-capsule" style="display:none;" onclick="expandTaskProgress(event)">
      <div class="capsule-inner">
        <div class="capsule-progress-ring">
          <svg class="ring-svg" viewBox="0 0 24 24">
            <circle class="ring-bg" cx="12" cy="12" r="9" />
            <circle id="capsule-ring-bar" class="ring-bar" cx="12" cy="12" r="9" />
          </svg>
          <span id="capsule-percent-text" class="ring-text">0</span>
        </div>
        <div class="capsule-info">
          <span id="capsule-title-text" class="capsule-title">正在处理</span>
        </div>
        <div id="capsule-queue-badge" class="capsule-badge" style="display:none;">+1</div>
        <button class="capsule-cancel-btn" title="取消当前任务" onclick="cancelCurrentTaskFromCapsule(event)">✕</button>
      </div>
    </div>

    <!-- Custom Dialog Modal (Alert / Confirm / Prompt) -->
    <div id="custom-dialog-modal" class="modal-overlay" style="display:none; z-index:1100;">
      <div class="modal-content" style="max-width:400px; width:100%;">
        <div class="modal-header">
          <h3 id="custom-dialog-title">提示</h3>
          <button class="v-btn v-btn-icon" onclick="closeCustomDialog(null)">✕</button>
        </div>
        <div class="modal-body" style="padding:18px 20px;">
          <p id="custom-dialog-message" style="margin:0; font-size:14px; line-height:1.5; color:var(--text-primary);"></p>
          <input type="text" id="custom-dialog-input" class="v-input" style="width:100%; margin-top:10px; display:none;">
        </div>
        <div class="modal-footer">
          <button id="custom-dialog-cancel-btn" class="v-btn v-btn-secondary" onclick="closeCustomDialog(false)">取消</button>
          <button id="custom-dialog-confirm-btn" class="v-btn v-btn-primary" onclick="confirmCustomDialog()">确认</button>
        </div>
      </div>
    </div>

    <!-- Toast Notification Container (Top Staggered) -->
    <div id="toast-container" class="toast-container"></div>
  </div>`;
