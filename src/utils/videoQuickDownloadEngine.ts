export interface VideoQuickDownloadOptions {
  theme?: string;
}

/**
 * 生成在 Webview 页面中执行的可见 Video 悬浮「下载资源」按钮注入与动态感知脚本
 * 采用自定义宿主标签 + Shadow DOM + 宿主内联 !important 重置，彻底隔绝宿主页样式污染
 */
export const getVideoQuickDownloadScript = (options: VideoQuickDownloadOptions = {}): string => {
  const theme = options.theme === 'dark' ? 'dark' : 'light';

  return `
    (function() {
      if (window.__veloraVideoQuickDownloadInjected) {
        return;
      }
      window.__veloraVideoQuickDownloadInjected = true;

      var HOST_TAG = 'velora-video-download-host';
      var HOST_ATTR = 'data-velora-video-download';
      var isDark = ${theme === 'dark'};

      // 清理可能残留的旧版全局样式或非隔离节点
      var legacyStyle = document.getElementById('velora-video-quick-download-style');
      if (legacyStyle) legacyStyle.remove();

      var shadowThemeCss = isDark ? [
        ':host {',
        '  --velora-bg-surface: oklch(18% 0.005 90);',
        '  --velora-bg-surface-hover: oklch(22% 0.005 90);',
        '  --velora-color-accent: oklch(90% 0.01 90);',
        '  --velora-color-accent-hover: oklch(98.5% 0.01 90);',
        '  --velora-border-color: oklch(28% 0.005 90);',
        '}'
      ].join('\\n') : [
        ':host {',
        '  --velora-bg-surface: oklch(100% 0 0);',
        '  --velora-bg-surface-hover: oklch(97.5% 0.008 90);',
        '  --velora-color-accent: oklch(30% 0.01 90);',
        '  --velora-color-accent-hover: oklch(20% 0.01 90);',
        '  --velora-border-color: oklch(93% 0.01 90);',
        '}'
      ].join('\\n');

      var shadowStyles = [
        shadowThemeCss,
        ':host {',
        '  contain: layout style;',
        '}',
        '.velora-video-download-btn {',
        '  all: unset;',
        '  box-sizing: border-box;',
        '  appearance: none;',
        '  -webkit-appearance: none;',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  gap: 5px;',
        '  width: max-content;',
        '  height: auto;',
        '  min-width: 0;',
        '  min-height: 0;',
        '  max-width: none;',
        '  max-height: none;',
        '  margin: 0;',
        '  padding: 4px 10px;',
        '  white-space: nowrap;',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
        '  font-size: 11px;',
        '  font-weight: 500;',
        '  line-height: 1.4;',
        '  letter-spacing: normal;',
        '  text-align: center;',
        '  text-decoration: none;',
        '  color: var(--velora-color-accent);',
        '  background: color-mix(in srgb, var(--velora-bg-surface) 35%, transparent);',
        '  backdrop-filter: blur(8px);',
        '  -webkit-backdrop-filter: blur(8px);',
        '  border: 1px solid color-mix(in srgb, var(--velora-border-color) 40%, transparent);',
        '  border-radius: 9999px;',
        '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);',
        '  user-select: none;',
        '  -webkit-user-select: none;',
        '  pointer-events: none;',
        '  opacity: 0;',
        '  cursor: pointer;',
        '  outline: none;',
        '  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, transform 0.15s ease;',
        '}',
        '.velora-video-download-btn.visible {',
        '  opacity: 1;',
        '  pointer-events: auto;',
        '}',
        '.velora-video-download-btn:hover {',
        '  background: color-mix(in srgb, var(--velora-bg-surface-hover) 55%, transparent);',
        '  color: var(--velora-color-accent-hover);',
        '  transform: scale(1.02);',
        '}',
        '.velora-video-download-btn:active {',
        '  transform: scale(0.97);',
        '}',
        '.velora-video-download-icon {',
        '  display: block;',
        '  width: 13px;',
        '  height: 13px;',
        '  min-width: 13px;',
        '  min-height: 13px;',
        '  max-width: 13px;',
        '  max-height: 13px;',
        '  flex-shrink: 0;',
        '  fill: none;',
        '  stroke: currentColor;',
        '  background: transparent;',
        '  box-sizing: border-box;',
        '}',
        '.velora-video-download-label {',
        '  display: inline;',
        '  width: auto;',
        '  height: auto;',
        '  margin: 0;',
        '  padding: 0;',
        '  white-space: nowrap;',
        '  font: inherit;',
        '  color: inherit;',
        '  line-height: inherit;',
        '}'
      ].join('\\n');

      // 先 all: initial !important 清空宿主页规则，再精确锁定位置与几何尺寸
      function applyHostBaseStyles(host) {
        host.style.setProperty('all', 'initial', 'important');
        host.style.setProperty('position', 'absolute', 'important');
        host.style.setProperty('top', '0px', 'important');
        host.style.setProperty('left', '0px', 'important');
        host.style.setProperty('right', 'auto', 'important');
        host.style.setProperty('bottom', 'auto', 'important');
        host.style.setProperty('width', 'max-content', 'important');
        host.style.setProperty('height', 'auto', 'important');
        host.style.setProperty('min-width', '0', 'important');
        host.style.setProperty('min-height', '0', 'important');
        host.style.setProperty('max-width', 'none', 'important');
        host.style.setProperty('max-height', 'none', 'important');
        host.style.setProperty('margin', '0', 'important');
        host.style.setProperty('padding', '0', 'important');
        host.style.setProperty('border', '0', 'important');
        host.style.setProperty('background', 'transparent', 'important');
        host.style.setProperty('display', 'block', 'important');
        host.style.setProperty('box-sizing', 'border-box', 'important');
        host.style.setProperty('overflow', 'visible', 'important');
        host.style.setProperty('float', 'none', 'important');
        host.style.setProperty('flex', 'none', 'important');
        host.style.setProperty('transform', 'none', 'important');
        host.style.setProperty('z-index', '2147483640', 'important');
        host.style.setProperty('pointer-events', 'none', 'important');
        host.style.setProperty('line-height', 'normal', 'important');
      }

      function lockHostGeometry(host) {
        host.style.setProperty('position', 'absolute', 'important');
        host.style.setProperty('width', 'max-content', 'important');
        host.style.setProperty('height', 'auto', 'important');
        host.style.setProperty('min-width', '0', 'important');
        host.style.setProperty('min-height', '0', 'important');
        host.style.setProperty('max-width', 'none', 'important');
        host.style.setProperty('max-height', 'none', 'important');
        host.style.setProperty('right', 'auto', 'important');
        host.style.setProperty('bottom', 'auto', 'important');
      }

      // 判定视频是否可见
      function isElementVisible(el) {
        if (!el || !el.isConnected) return false;
        try {
          var style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          return true;
        } catch (e) {
          return false;
        }
      }

      // 提取视频直链或播放源
      function getVideoSource(video) {
        if (!video) return '';
        if (video.currentSrc && video.currentSrc.trim()) return video.currentSrc.trim();
        if (video.src && video.src.trim()) return video.src.trim();
        var sourceEl = video.querySelector('source[src]');
        if (sourceEl && sourceEl.src) return sourceEl.src.trim();
        return '';
      }

      // 精准计算宿主元素相对于父容器、贴附在 video 画面右上角的位置
      function updateButtonPosition(video, host, btn, parent) {
        if (!video || !host || !btn || !parent) return;
        try {
          var vRect = video.getBoundingClientRect();
          if (vRect.width < 40 || vRect.height < 40) {
            btn.classList.remove('visible');
            return;
          }

          lockHostGeometry(host);
          var pRect = parent.getBoundingClientRect();
          var btnWidth = Math.ceil(btn.getBoundingClientRect().width) || 78;
          var top = (vRect.top - pRect.top - (parent.clientTop || 0) + (parent.scrollTop || 0)) + 12;
          var left = (vRect.right - pRect.left - (parent.clientLeft || 0) + (parent.scrollLeft || 0)) - btnWidth - 12;

          host.style.setProperty('top', Math.max(4, Math.round(top)) + 'px', 'important');
          host.style.setProperty('left', Math.max(4, Math.round(left)) + 'px', 'important');
        } catch (e) {}
      }

      // 为可见 video 挂载 Shadow DOM 下载按钮并绑定专属 Hover 事件
      function attachButtonToVideo(video) {
        if (!isElementVisible(video)) return;
        var parent = video.parentElement;
        if (!parent) return;

        var existingHost = parent.querySelector(':scope > ' + HOST_TAG + '[' + HOST_ATTR + '="1"]');
        if (existingHost && existingHost.__veloraVideoTarget === video) {
          return;
        }
        if (existingHost) {
          existingHost.remove();
        }
        var legacyBtn = parent.querySelector(':scope > .velora-video-download-btn');
        if (legacyBtn) {
          legacyBtn.remove();
        }

        var parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
          parent.style.setProperty('position', 'relative', 'important');
        }

        var host = document.createElement(HOST_TAG);
        host.setAttribute(HOST_ATTR, '1');
        host.__veloraVideoTarget = video;
        applyHostBaseStyles(host);

        var shadow = host.attachShadow({ mode: 'open' });
        var styleTag = document.createElement('style');
        styleTag.textContent = shadowStyles;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'velora-video-download-btn';
        btn.innerHTML = [
          '<svg class="velora-video-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
          '  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>',
          '  <polyline points="7 10 12 15 17 10"></polyline>',
          '  <line x1="12" y1="15" x2="12" y2="3"></line>',
          '</svg>',
          '<span class="velora-video-download-label">下载资源</span>'
        ].join('');

        shadow.appendChild(styleTag);
        shadow.appendChild(btn);

        var hideTimer = null;
        function showBtn() {
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
          var vRect = video.getBoundingClientRect();
          if (vRect.width < 40 || vRect.height < 40) {
            btn.classList.remove('visible');
            return;
          }
          updateButtonPosition(video, host, btn, parent);
          btn.classList.add('visible');
        }

        function scheduleHideBtn() {
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(function() {
            btn.classList.remove('visible');
          }, 120);
        }

        video.addEventListener('mouseenter', showBtn);
        video.addEventListener('mouseleave', scheduleHideBtn);
        btn.addEventListener('mouseenter', showBtn);
        btn.addEventListener('mouseleave', scheduleHideBtn);

        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          e.preventDefault();
          var src = getVideoSource(video);
          var payload = {
            src: src,
            title: document.title || '',
            pageUrl: window.location.href
          };
          console.log('__velora_video_quick_download__:' + JSON.stringify(payload));
        }, true);

        parent.appendChild(host);
      }

      // 扫描并处理当前页面所有 video，顺便清理失效宿主节点
      function processAllVideos() {
        var existingHosts = document.querySelectorAll(HOST_TAG + '[' + HOST_ATTR + '="1"]');
        for (var i = 0; i < existingHosts.length; i++) {
          var h = existingHosts[i];
          if (!h.__veloraVideoTarget || !h.__veloraVideoTarget.isConnected) {
            h.remove();
          }
        }

        var videos = document.querySelectorAll('video');
        for (var j = 0; j < videos.length; j++) {
          attachButtonToVideo(videos[j]);
        }
      }

      processAllVideos();

      // 挂载 MutationObserver 动态感知 DOM 变化与新 video 注入
      var observerTimer = null;
      var observer = new MutationObserver(function() {
        if (observerTimer) clearTimeout(observerTimer);
        observerTimer = setTimeout(function() {
          processAllVideos();
        }, 200);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'src']
      });

      // 注册全局清理函数
      window.__veloraVideoQuickDownloadCancel = function() {
        if (observer) observer.disconnect();
        if (observerTimer) clearTimeout(observerTimer);
        document.querySelectorAll(HOST_TAG + '[' + HOST_ATTR + '="1"], .velora-video-download-btn').forEach(function(el) {
          el.remove();
        });
        var st = document.getElementById('velora-video-quick-download-style');
        if (st) st.remove();
        window.__veloraVideoQuickDownloadInjected = false;
      };
    })();
  `;
};
