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
const existingModalsBody = rawModalsBody.replace(
  /<!-- Dedicated Fullscreen Video Trimmer Modal -->[\s\S]*?(?=<!-- Video Merge Modal -->)/,
  ''
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
 * 共享的「远程下载控制台」视图面板 HTML（桌面端与移动端各自通过布局 CSS 定制排布）
 */
export const lanWebDownloadsPanelMarkup = `
      <section class="lan-panel-section" data-panel="downloads" id="panel-downloads">
        <div id="remote-dl-readonly" class="panel-readonly-banner" style="display:none;">
          当前为只读模式，仅可查看桌面端下载进度。如需新建或控制任务，请在桌面端设置开启「允许局域网编辑」。
        </div>

        <div id="remote-dl-form-card" class="panel-card">
          <div class="panel-card-header">
            <h3 class="panel-card-title">新建远程下载</h3>
          </div>
          <div class="remote-form-grid">
            <div class="remote-form-field full-span">
              <label for="dl-url-input">直链或 M3U8 地址</label>
              <input type="url" id="dl-url-input" class="v-input" placeholder="粘贴 HTTP / HTTPS 下载链接或 M3U8 地址">
            </div>
            <div class="remote-form-field full-span">
              <label for="dl-name-input">自定义文件名（选填）</label>
              <input type="text" id="dl-name-input" class="v-input" placeholder="留空则自动识别文件名，默认保存至桌面端设置的下载目录">
            </div>
          </div>
          <div class="remote-form-actions">
            <button id="dl-submit-btn" class="v-btn v-btn-primary" onclick="submitRemoteDownload()">开始下载</button>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-card-header">
            <h3 class="panel-card-title">桌面端下载队列</h3>
          </div>
          <div id="remote-dl-list" class="remote-dl-list">
            <div class="empty-state" style="padding:36px 16px;">暂无下载任务</div>
          </div>
        </div>
      </section>
`;

/**
 * 共享的「网盘分享口令解析」视图面板 HTML
 */
export const lanWebPanPanelMarkup = `
      <section class="lan-panel-section" data-panel="pan" id="panel-pan">
        <div id="remote-pan-readonly" class="panel-readonly-banner" style="display:none;">
          当前为只读模式。如需远程解析网盘口令、转存或下发下载，请在桌面端设置开启「允许局域网编辑」。
        </div>

        <div id="remote-pan-form-card" class="panel-card">
          <div class="panel-card-header">
            <h3 class="panel-card-title">网盘分享链接解析</h3>
          </div>
          <div class="remote-form-grid">
            <div class="remote-form-field full-span">
              <label for="pan-url-input">分享链接或口令</label>
              <input type="text" id="pan-url-input" class="v-input" placeholder="粘贴夸克 / 百度 / 123 / 迅雷 / 115 / UC / 蓝奏等分享口令">
            </div>
            <div class="remote-form-field full-span">
              <label for="pan-pwd-input">提取码（选填，口令含提取码时自动识别）</label>
              <input type="text" id="pan-pwd-input" class="v-input" placeholder="选填，下载时默认保存至桌面端设置的下载目录">
            </div>
          </div>
          <div class="remote-form-actions">
            <button id="pan-parse-btn" class="v-btn v-btn-secondary" onclick="submitLanPanParse()">解析链接</button>
          </div>
        </div>

        <div id="remote-pan-results" class="panel-card" style="display:none;">
          <div class="panel-card-header">
            <h3 class="panel-card-title">解析结果</h3>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="v-btn v-btn-secondary" style="height:28px; padding:0 10px; font-size:12px;" onclick="selectAllPanFiles(true)">全选</button>
              <button class="v-btn v-btn-secondary" style="height:28px; padding:0 10px; font-size:12px;" onclick="selectAllPanFiles(false)">清空</button>
            </div>
          </div>
          <div id="remote-pan-file-list" class="pan-parse-list"></div>
          <div class="panel-card-header">
            <span id="remote-pan-summary" style="font-size:12.5px; color:var(--text-secondary);"></span>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button id="pan-save-drive-btn" class="v-btn v-btn-secondary" onclick="openLanPanSavePicker()">转存到网盘</button>
              <button id="pan-download-btn" class="v-btn v-btn-primary" onclick="submitLanPanDownload()">下载到电脑</button>
            </div>
          </div>
        </div>
      </section>
`;
