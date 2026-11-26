export const lanDesktopVideoEditMarkup = `
    <!-- Desktop D2 Split-Pane Video Edit Workbench -->
    <div id="video-edit-modal" class="modal-overlay" style="display:none;">
      <div class="video-edit-modal-content desktop-d2-workbench">
        <div class="modal-header desktop-d2-header">
          <div class="desktop-d2-title-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="6" cy="6" r="3"></circle>
              <circle cx="6" cy="18" r="3"></circle>
              <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
              <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
              <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
            </svg>
            <span id="video-edit-title" class="desktop-d2-title">视频剪辑</span>
          </div>
          <div class="desktop-d2-header-actions">
            <div class="trim-help-wrap">
              <button class="v-btn v-btn-icon" type="button" title="快捷键说明" aria-label="快捷键说明">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </button>
              <div class="trim-shortcuts-popover">
                <div class="trim-popover-title">剪辑快捷键</div>
                <div class="trim-shortcut-grid">
                  <span>播放 / 暂停 · 静音</span><span class="trim-keys"><kbd>Space</kbd><kbd>M</kbd></span>
                  <span>微调 ±0.1 秒</span><span class="trim-keys"><kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd></span>
                  <span>常规步进 ±1 秒</span><span class="trim-keys"><kbd>←</kbd><kbd>→</kbd></span>
                  <span>快速步进 ±10 秒</span><span class="trim-keys"><kbd>Ctrl</kbd>+<kbd>←</kbd><kbd>→</kbd></span>
                  <span>大跨步 ±60 秒</span><span class="trim-keys"><kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd></span>
                  <span>设起点 / 设终点 / 新增</span><span class="trim-keys"><kbd>Z</kbd><kbd>C</kbd><kbd>X</kbd></span>
                  <span>跳起点 / 跳终点 / 试播</span><span class="trim-keys"><kbd>A</kbd><kbd>D</kbd><kbd>S</kbd></span>
                  <span>切换片段 / 删除片段</span><span class="trim-keys"><kbd>Q</kbd><kbd>E</kbd><kbd>W</kbd></span>
                </div>
              </div>
            </div>
            <button class="v-btn v-btn-icon" type="button" onclick="closeVideoEditModal()" title="关闭">✕</button>
          </div>
        </div>

        <div class="desktop-d2-body">
          <!-- Left 65%: Monitor + Visual Segment Track + Dynamic Modifier Steppers -->
          <div class="desktop-d2-stage">
            <div class="trimmer-video-wrap desktop-d2-video-wrap">
              <video id="trimmer-video" playsinline muted onclick="toggleTrimmerPlay()"></video>
              <div id="trimmer-active-hud" class="desktop-d2-hud" style="display:none;"></div>
            </div>

            <div class="desktop-d2-controls-card">
              <div id="trimmer-time-display" class="time-display desktop-d2-track" title="点击或拖拽定位播放进度">
                <div id="trimmer-time-progress" class="time-display-progress"></div>
                <div id="trimmer-segments-overlay" class="trimmer-segments-overlay"></div>
                <div id="trimmer-playhead" class="trimmer-playhead"></div>
              </div>

              <div class="desktop-d2-ctrl-row">
                <div class="desktop-d2-ctrl-left" oncontextmenu="return false;">
                  <button id="trim-play-btn" class="v-btn v-btn-secondary desktop-play-btn" type="button" onclick="toggleTrimmerPlay()" title="播放/暂停 (Space)">
                    <svg id="trim-play-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                    <svg id="trim-pause-icon" style="display:none;" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                  </button>
                  <button
                    id="trim-step-prev"
                    class="v-btn v-btn-secondary desktop-step-btn"
                    type="button"
                    onmousedown="startDynamicSeek(-1, event)"
                    onmouseup="stopSeek()"
                    onmouseleave="stopSeek()"
                    title="后退（按住 Alt/Ctrl/Shift 切换步长）"
                  >‹ -1s</button>
                  <button
                    id="trim-step-next"
                    class="v-btn v-btn-secondary desktop-step-btn"
                    type="button"
                    onmousedown="startDynamicSeek(1, event)"
                    onmouseup="stopSeek()"
                    onmouseleave="stopSeek()"
                    title="前进（按住 Alt/Ctrl/Shift 切换步长）"
                  >+1s ›</button>
                  <span id="trim-modifier-badge" class="trim-modifier-badge" style="display:none;"></span>
                </div>

                <div class="desktop-d2-ctrl-right">
                  <span id="trimmer-time-text" class="desktop-d2-timecode">00:00.0 / 00:00.0</span>
                  <button id="trim-speed-btn" class="v-btn v-btn-secondary desktop-speed-btn" type="button" onclick="toggleTrimmerSpeed()" title="切换倍速">1x</button>
                  <button id="trim-mute-btn" class="v-btn v-btn-icon" type="button" onclick="toggleTrimmerMute()" title="静音切换 (M)">
                    <svg id="trim-icon-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                    <svg id="trim-icon-unmuted" style="display:none;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right 35%: Fixed Inspector -->
          <div class="desktop-d2-inspector">
            <div class="desktop-d2-mark-row">
              <button class="v-btn v-btn-secondary" type="button" onclick="markTrimStart()" title="设为起点 (Z)">起点</button>
              <button class="v-btn v-btn-secondary" type="button" onclick="markTrimEnd()" title="设为终点 (C)">终点</button>
              <button id="trimmer-add-segment-btn" class="v-btn v-btn-primary" type="button" onclick="addNewSegment()" title="新增片段 (X)">+ 新增片段</button>
            </div>

            <div class="desktop-d2-list-header">
              <span>片段清单</span>
              <span id="trimmer-segments-count">0 段</span>
            </div>

            <div id="trimmer-segments-list" class="desktop-d2-segments-list"></div>

            <div class="desktop-d2-export-box">
              <div class="segmented-control" id="trim-save-segmented">
                <div class="segmented-option active" data-value="replace" onclick="setTrimSaveMode('replace')">覆盖保存</div>
                <div class="segmented-option" data-value="saveAs" onclick="setTrimSaveMode('saveAs')">另存为</div>
              </div>
              <input type="hidden" id="trim-save-mode" value="replace">
              <div id="trim-filename-wrap" style="display:none;">
                <input type="text" id="trim-filename-input" class="v-input" placeholder="输入输出文件名" style="width:100%;">
              </div>
              <div class="desktop-d2-export-footer">
                <span id="trimmer-summary-display" class="desktop-d2-summary">保留 00:00.0</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <button class="v-btn v-btn-secondary" type="button" onclick="closeVideoEditModal()">取消</button>
                  <button class="v-btn v-btn-primary" type="button" onclick="submitVideoCut()">开始剪辑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
`;
