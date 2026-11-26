import { lanWebMarkup } from '../markup';

/**
 * 复用既有全部模态框、多选栏、任务浮岛、自定义确认弹窗与 Toast 容器，并追加共享的上传进度浮窗与隐藏文件选择器
 */
const modalsStartIdx = lanWebMarkup.indexOf('<!-- Auth Modal -->');
const rawModalsBody =
  modalsStartIdx >= 0
    ? lanWebMarkup.slice(modalsStartIdx).replace(/\s*<\/div>\s*$/, '')
    : '';
// 移除旧版共用 #video-edit-modal，由桌面端 D2 与移动端 S3 各自挂载专属剪辑工作台
var modalsBody = rawModalsBody.replace(
  /<!-- Dedicated Fullscreen Video Trimmer Modal -->[\s\S]*?(?=<!-- Video Merge Modal -->)/,
  ''
);

// 升级 #video-modal 为双端沉浸式预览（保留 #main-video / #video-modal-title ID，新增下载/剪辑快捷动作与手势提示）
modalsBody = modalsBody.replace(
  /<!-- Video Player Modal -->[\s\S]*?(?=<!-- Image Preview Modal -->)/,
  `<!-- Video Player Modal -->
    <div id="video-modal" class="modal-overlay video-preview-overlay" style="display:none;" onclick="if(event.target===this) closeVideoModal()">
      <div class="player-modal-content">
        <div class="modal-header player-preview-header">
          <span id="video-modal-title" class="player-preview-title"></span>
          <div class="player-preview-actions">
            <button id="video-preview-download-btn" class="v-btn v-btn-icon" type="button" onclick="downloadCurrentPreviewVideo()" title="下载">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
            <button id="video-preview-edit-btn" class="v-btn v-btn-icon" type="button" style="display:none;" onclick="editCurrentPreviewVideo()" title="视频剪辑">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>
            </button>
            <button class="v-btn v-btn-icon" type="button" onclick="closeVideoModal()" title="关闭">✕</button>
          </div>
        </div>
        <div id="player-video-wrap" class="player-video-wrap">
          <video id="main-video" controls playsinline></video>
          <div id="player-gesture-badge" class="player-gesture-badge" style="display:none;"></div>
        </div>
      </div>
    </div>

    `
);

// 升级 #image-modal 为双端沉浸式图片灯箱（保留 #image-modal / #main-image ID）
modalsBody = modalsBody.replace(
  /<!-- Image Preview Modal -->[\s\S]*?(?=<!-- Action \/ Edit Modal)/,
  `<!-- Image Preview Modal -->
    <div id="image-modal" class="modal-overlay image-lightbox-overlay" style="display:none;" onclick="handleImageBackdropClick(event)">
      <div id="image-lightbox-topbar" class="image-lightbox-topbar" onclick="event.stopPropagation()">
        <span id="image-lightbox-counter" class="image-lightbox-counter">1 / 1</span>
        <span id="image-lightbox-name" class="image-lightbox-name"></span>
        <div class="image-lightbox-actions">
          <button id="image-zoom-reset-btn" class="v-btn v-btn-icon image-lightbox-btn" type="button" style="display:none;" onclick="resetImageLightboxTransform()" title="还原缩放">1:1</button>
          <button class="v-btn v-btn-icon image-lightbox-btn" type="button" onclick="downloadCurrentPreviewImage()" title="下载">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="v-btn v-btn-icon image-lightbox-btn" type="button" onclick="closeImageModal()" title="关闭">✕</button>
        </div>
      </div>
      <button id="image-prev-btn" class="image-nav-arrow is-prev" type="button" onclick="event.stopPropagation(); stepLightboxImage(-1)" title="上一张">‹</button>
      <div id="image-stage-viewport" class="image-modal-content image-stage-viewport">
        <img id="main-image" src="" alt="preview" draggable="false">
      </div>
      <button id="image-next-btn" class="image-nav-arrow is-next" type="button" onclick="event.stopPropagation(); stepLightboxImage(1)" title="下一张">›</button>
    </div>

    `
);

// 支持 Bottom Sheet 与模态窗点击背景遮罩关闭
modalsBody = modalsBody
  .replace(
    '<div id="action-modal" class="modal-overlay" style="display:none;">',
    '<div id="action-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this) closeActionModal()">'
  )
  .replace(
    '<div id="custom-dialog-modal" class="modal-overlay" style="display:none; z-index:1100;">',
    '<div id="custom-dialog-modal" class="modal-overlay" style="display:none; z-index:1100;" onclick="if(event.target===this) closeCustomDialog(false)">'
  );

// 为桌面端多选栏补充删除按钮（仅写入权限可见）
const existingModalsBody = modalsBody.replace(
  /(<button id="batch-move-btn"[\s\S]*?<\/button>)/,
  '$1\n        <button id="batch-delete-btn" class="v-btn v-btn-danger-soft" style="display:none;" onclick="confirmDeleteSelectedItems()"><span>删除</span></button>'
);

export const lanWebSharedModalsMarkup = `
    ${existingModalsBody}

    <!-- Hidden Multi-File Upload Input -->
    <input type="file" id="lan-upload-input" multiple style="display:none;">

    <!-- Floating Upload Progress -->
    <div id="upload-progress-float" class="upload-progress-float" style="display:none;">
      <div class="upload-progress-header">
        <span id="upload-progress-title">正在上传</span>
        <button class="v-btn v-btn-icon" style="width:24px; height:24px;" onclick="cancelActiveUpload()" title="取消上传">✕</button>
      </div>
      <div id="upload-progress-name" class="upload-progress-name"></div>
      <div class="remote-dl-progress-track">
        <div id="upload-progress-fill" class="remote-dl-progress-fill" style="width:0%;"></div>
      </div>
    </div>
`;

/**
 * 共享的「远程下载控制台」视图面板 HTML（桌面端左右双栏 / 移动端队列置顶 + 底部新建抽屉）
 */
export const lanWebDownloadsPanelMarkup = `
      <section class="lan-panel-section" data-panel="downloads" id="panel-downloads">
        <div id="remote-dl-readonly" class="panel-readonly-banner" style="display:none;">
          当前为只读模式，仅可查看桌面端下载进度。如需新建或控制任务，请在桌面端设置开启「允许局域网编辑」。
        </div>

        <div class="remote-split-grid" id="remote-dl-split">
          <div id="remote-dl-form-card" class="panel-card remote-dl-form-card" onclick="if(event.target===this && typeof closeMobileDownloadSheet==='function') closeMobileDownloadSheet()">
            <div class="remote-sheet-surface">
              <div class="panel-card-header">
                <h3 class="panel-card-title">新建远程下载</h3>
                <button class="v-btn v-btn-icon mobile-sheet-close-btn" type="button" onclick="closeMobileDownloadSheet()" title="关闭">✕</button>
              </div>
              <div class="remote-form-grid">
                <div class="remote-form-field full-span">
                  <div class="remote-label-row">
                    <label for="dl-url-input">直链或 M3U8 地址</label>
                    <button id="dl-paste-btn" class="v-btn v-btn-secondary mobile-inline-paste-btn" type="button" onclick="pasteIntoInput('dl-url-input')">粘贴</button>
                  </div>
                  <input type="url" id="dl-url-input" class="v-input" placeholder="粘贴 HTTP / HTTPS 下载链接或 M3U8 地址" onkeydown="if(event.key==='Enter'){event.preventDefault();submitRemoteDownload();}">
                </div>
                <div class="remote-form-field full-span">
                  <label for="dl-name-input">自定义文件名（选填）</label>
                  <input type="text" id="dl-name-input" class="v-input" placeholder="留空则自动识别文件名，默认保存至桌面端设置的下载目录" onkeydown="if(event.key==='Enter'){event.preventDefault();submitRemoteDownload();}">
                </div>
              </div>
              <div class="remote-form-actions">
                <button class="v-btn v-btn-secondary mobile-sheet-cancel-btn" type="button" onclick="closeMobileDownloadSheet()">取消</button>
                <button id="dl-submit-btn" class="v-btn v-btn-primary" type="button" onclick="submitRemoteDownload()">开始下载</button>
              </div>
            </div>
          </div>

          <div class="panel-card remote-list-card">
            <div class="panel-card-header">
              <h3 class="panel-card-title">桌面端下载队列</h3>
              <button id="mobile-open-dl-sheet-btn" class="v-btn v-btn-secondary mobile-only-dl-trigger" type="button" style="display:none;" onclick="openMobileDownloadSheet()">+ 新建下载</button>
            </div>
            <div id="remote-dl-filter-tabs" class="segmented-control remote-filter-tabs">
              <div class="segmented-option active" data-filter="all" onclick="setRemoteDownloadFilter('all')">全部</div>
              <div class="segmented-option" data-filter="active" onclick="setRemoteDownloadFilter('active')">进行中</div>
              <div class="segmented-option" data-filter="completed" onclick="setRemoteDownloadFilter('completed')">已完成</div>
              <div class="segmented-option" data-filter="error" onclick="setRemoteDownloadFilter('error')">异常</div>
            </div>
            <div id="remote-dl-list" class="remote-dl-list">
              <div class="empty-state" style="padding:36px 16px;">暂无下载任务</div>
            </div>
          </div>
        </div>
      </section>
`;

/**
 * 共享的「网盘分享口令解析」视图面板 HTML（桌面端左右双栏 / 移动端一键粘贴解析 + 吸底操作栏）
 */
export const lanWebPanPanelMarkup = `
      <section class="lan-panel-section" data-panel="pan" id="panel-pan">
        <div id="remote-pan-readonly" class="panel-readonly-banner" style="display:none;">
          当前为只读模式。如需远程解析网盘口令、转存或下发下载，请在桌面端设置开启「允许局域网编辑」。
        </div>

        <div class="remote-split-grid pan-split-grid">
          <div id="remote-pan-form-card" class="panel-card remote-pan-form-card">
            <div class="panel-card-header">
              <h3 class="panel-card-title">网盘分享链接解析</h3>
              <button id="pan-paste-parse-btn" class="v-btn v-btn-secondary mobile-only-pan-paste" type="button" onclick="pasteAndParsePan()">粘贴并解析</button>
            </div>
            <div class="remote-form-grid">
              <div class="remote-form-field full-span">
                <label for="pan-url-input">分享链接或口令</label>
                <input type="text" id="pan-url-input" class="v-input" placeholder="粘贴夸克 / 百度 / 123 / 迅雷 / 115 / UC / 蓝奏等分享口令" onkeydown="if(event.key==='Enter'){event.preventDefault();submitLanPanParse();}">
              </div>
              <div class="remote-form-field full-span">
                <label for="pan-pwd-input">提取码（选填，口令含提取码时自动识别）</label>
                <input type="text" id="pan-pwd-input" class="v-input" placeholder="选填，下载时默认保存至桌面端设置的下载目录" onkeydown="if(event.key==='Enter'){event.preventDefault();submitLanPanParse();}">
              </div>
            </div>
            <div class="remote-form-actions">
              <button id="pan-parse-btn" class="v-btn v-btn-secondary" type="button" onclick="submitLanPanParse()">解析链接</button>
            </div>
          </div>

          <div id="remote-pan-results" class="panel-card remote-pan-results-card" style="display:none;">
            <div class="panel-card-header">
              <h3 class="panel-card-title">解析结果</h3>
              <div style="display:flex; align-items:center; gap:8px;">
                <button class="v-btn v-btn-secondary" style="height:28px; padding:0 10px; font-size:12px;" type="button" onclick="selectAllPanFiles(true)">全选</button>
                <button class="v-btn v-btn-secondary" style="height:28px; padding:0 10px; font-size:12px;" type="button" onclick="selectAllPanFiles(false)">清空</button>
              </div>
            </div>
            <div id="remote-pan-file-list" class="pan-parse-list"></div>
            <div class="panel-card-header pan-results-footer">
              <span id="remote-pan-summary" style="font-size:12.5px; color:var(--text-secondary);"></span>
              <div class="pan-footer-actions">
                <button id="pan-save-drive-btn" class="v-btn v-btn-secondary" type="button" onclick="openLanPanSavePicker()">转存到网盘</button>
                <button id="pan-download-btn" class="v-btn v-btn-primary" type="button" onclick="submitLanPanDownload()">下载到电脑</button>
              </div>
            </div>
          </div>
        </div>
      </section>
`;
