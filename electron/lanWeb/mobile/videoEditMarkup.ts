export const lanMobileVideoEditMarkup = `
    <!-- Mobile S3 Native Video Edit Workbench -->
    <div id="video-edit-modal" class="modal-overlay mobile-s3-overlay" style="display:none;">
      <div class="video-edit-modal-content mobile-s3-workbench">
        <!-- Top Bar -->
        <div class="mobile-s3-header">
          <button class="v-btn v-btn-icon" type="button" onclick="closeVideoEditModal()" title="关闭">✕</button>
          <span id="video-edit-title" class="mobile-s3-title">视频剪辑</span>
          <button id="trim-mute-btn" class="v-btn v-btn-icon" type="button" onclick="toggleTrimmerMute()" title="静音切换">
            <svg id="trim-icon-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
            <svg id="trim-icon-unmuted" style="display:none;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          </button>
          <button id="trim-speed-btn" class="v-btn v-btn-secondary mobile-s3-speed-btn" type="button" onclick="toggleTrimmerSpeed()">1x</button>
          <button class="v-btn v-btn-secondary mobile-s3-save-btn" type="button" onclick="openMobileTrimExportSheet()">保存</button>
        </div>

        <!-- Video Preview -->
        <div class="trimmer-video-wrap mobile-s3-video-wrap">
          <video id="trimmer-video" playsinline muted onclick="toggleTrimmerPlay()"></video>
        </div>

        <!-- Seamless Control Surface -->
        <div class="mobile-s3-body">
          <!-- Interactive Scrubber with Segment Highlights -->
          <div class="mobile-s3-section">
            <div id="trimmer-time-display" class="time-display mobile-s3-scrubber" title="点击或左右滑动调节进度">
              <div id="trimmer-time-progress" class="time-display-progress"></div>
              <div id="trimmer-segments-overlay" class="trimmer-segments-overlay"></div>
              <div id="trimmer-playhead" class="trimmer-playhead"></div>
              <span id="trimmer-time-text" class="time-display-text">00:00.0 / 00:00.0</span>
            </div>
          </div>

          <!-- 3-Tier VSwitch + 4 Extra-Wide 46px Stepper Buttons -->
          <div class="mobile-s3-section mobile-s3-step-zone" oncontextmenu="return false;">
            <div class="segmented-control mobile-s3-tier-switch" id="trim-tier-switch">
              <div class="segmented-option" data-tier="coarse" onclick="setMobileTrimTier('coarse')">粗略 1/5 m</div>
              <div class="segmented-option active" data-tier="normal" onclick="setMobileTrimTier('normal')">普通 5/10 s</div>
              <div class="segmented-option" data-tier="fine" onclick="setMobileTrimTier('fine')">精细 0.1/1 s</div>
            </div>
            <div class="mobile-s3-steppers" id="trim-steppers"></div>
          </div>

          <!-- Marking Row -->
          <div class="mobile-s3-section">
            <div class="mobile-s3-mark-row">
              <button class="v-btn v-btn-secondary" type="button" onclick="markTrimStart()">设为起点</button>
              <button id="trimmer-add-segment-btn" class="v-btn v-btn-primary" type="button" onclick="addNewSegment()">+ 新增片段</button>
              <button class="v-btn v-btn-secondary" type="button" onclick="markTrimEnd()">设为终点</button>
            </div>
          </div>

          <!-- Multi-Row Structured Segment List -->
          <div class="mobile-s3-segments-section">
            <div class="mobile-s3-seg-header">
              <span id="trimmer-summary-display" class="mobile-s3-summary">保留 00:00.0</span>
            </div>
            <div id="trimmer-segments-list" class="mobile-s3-segments-list"></div>
          </div>
        </div>

        <!-- Bottom Export Sheet (Save Mode + Filename + Confirm) -->
        <div id="trim-export-sheet" class="mobile-s3-sheet-mask" style="display:none;" onclick="if(event.target===this) closeMobileTrimExportSheet()">
          <div class="mobile-s3-sheet-card">
            <div class="mobile-s3-sheet-header">
              <span>保存剪辑</span>
              <button class="v-btn v-btn-icon" type="button" onclick="closeMobileTrimExportSheet()">✕</button>
            </div>
            <div class="mobile-s3-sheet-body">
              <div id="trim-sheet-summary" class="mobile-s3-sheet-summary">保留 00:00.0</div>
              <div class="segmented-control" id="trim-save-segmented">
                <div class="segmented-option active" data-value="replace" onclick="setTrimSaveMode('replace')">覆盖保存</div>
                <div class="segmented-option" data-value="saveAs" onclick="setTrimSaveMode('saveAs')">另存为</div>
              </div>
              <input type="hidden" id="trim-save-mode" value="replace">
              <div id="trim-filename-wrap" style="display:none; flex-direction:column; gap:5px;">
                <label style="font-size:12px; color:var(--text-secondary);">导出文件名</label>
                <input type="text" id="trim-filename-input" class="v-input" placeholder="输入输出文件名" style="width:100%;">
              </div>
            </div>
            <div class="mobile-s3-sheet-footer">
              <button class="v-btn v-btn-secondary" type="button" onclick="closeMobileTrimExportSheet()">取消</button>
              <button class="v-btn v-btn-primary" type="button" onclick="submitVideoCut()">开始剪辑</button>
            </div>
          </div>
        </div>
      </div>
    </div>
`;
