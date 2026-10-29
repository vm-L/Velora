export interface VideoQuickDownloadOptions {
  theme?: string;
}

/**
 * 生成在 Webview 页面中执行的可见 Video 悬浮「下载资源」按钮注入与动态感知脚本
 */
export const getVideoQuickDownloadScript = (options: VideoQuickDownloadOptions = {}): string => {
  const theme = options.theme === 'dark' ? 'dark' : 'light';

  return `
    (function() {
      if (window.__veloraVideoQuickDownloadInjected) {
        return;
      }
      window.__veloraVideoQuickDownloadInjected = true;

      // 1. 注入按钮样式（采用 Pristine Elegance 标准主题变量）
      let styleEl = document.getElementById('velora-video-quick-download-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'velora-video-quick-download-style';
      }

      const isDark = ${theme === 'dark'};
      const cssThemeVars = isDark ? [
        ':root {',
        '  --bg-app: oklch(15% 0.005 90);',
        '  --bg-surface: oklch(18% 0.005 90);',
        '  --bg-surface-hover: oklch(22% 0.005 90);',
        '  --bg-surface-active: oklch(26% 0.005 90);',
        '  --text-primary: oklch(95% 0.005 90);',
        '  --text-secondary: oklch(75% 0.005 90);',
        '  --text-tertiary: oklch(60% 0.005 90);',
        '  --color-accent: oklch(90% 0.01 90);',
        '  --color-accent-hover: oklch(98.5% 0.01 90);',
        '  --border-color: oklch(28% 0.005 90);',
        '  --border-light: oklch(24% 0.005 90);',
        '}'
      ].join('\\n') : [
        ':root {',
        '  --bg-app: oklch(98.5% 0.005 90);',
        '  --bg-surface: oklch(100% 0 0);',
        '  --bg-surface-hover: oklch(97.5% 0.008 90);',
        '  --bg-surface-active: oklch(96.5% 0.01 90);',
        '  --text-primary: oklch(38% 0.01 90);',
        '  --text-secondary: oklch(62% 0.01 90);',
        '  --text-tertiary: oklch(76% 0.01 90);',
        '  --color-accent: oklch(30% 0.01 90);',
        '  --color-accent-hover: oklch(20% 0.01 90);',
        '  --border-color: oklch(93% 0.01 90);',
        '  --border-light: oklch(96% 0.006 90);',
        '}'
      ].join('\\n');

      styleEl.textContent = [
        cssThemeVars,
        '.velora-video-download-btn {',
        '  position: absolute !important;',
        '  z-index: 2147483640 !important;',
        '  top: 12px !important;',
        '  right: 12px !important;',
        '  display: inline-flex !important;',
        '  align-items: center !important;',
        '  justify-content: center !important;',
        '  gap: 5px !important;',
        '  padding: 4px 10px !important;',
        '  font-size: 11px !important;',
        '  font-weight: 500 !important;',
        '  line-height: 1.4 !important;',
        '  color: var(--color-accent) !important;',
        '  background: color-mix(in srgb, var(--bg-surface) 35%, transparent) !important;',
        '  backdrop-filter: blur(8px) !important;',
        '  -webkit-backdrop-filter: blur(8px) !important;',
        '  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent) !important;',
        '  border-radius: 9999px !important;',
        '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;',
        '  user-select: none !important;',
        '  pointer-events: none !important;',
        '  opacity: 0 !important;',
        '  cursor: pointer !important;',
        '  box-sizing: border-box !important;',
        '  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, transform 0.15s ease !important;',
        '}',
        '*:hover > .velora-video-download-btn,',
        '.velora-video-download-btn:hover {',
        '  opacity: 1 !important;',
        '  pointer-events: auto !important;',
        '}',
        '.velora-video-download-btn:hover {',
        '  background: color-mix(in srgb, var(--bg-surface-hover) 55%, transparent) !important;',
        '  color: var(--color-accent-hover) !important;',
        '  transform: scale(1.02) !important;',
        '}',
        '.velora-video-download-btn:active {',
        '  transform: scale(0.97) !important;',
        '}',
        '.velora-video-download-icon {',
        '  width: 13px !important;',
        '  height: 13px !important;',
        '  flex-shrink: 0 !important;',
        '}'
      ].join('\\n');

      if (!styleEl.parentNode) {
        document.head.appendChild(styleEl);
      }

      // 2. 判定视频是否可见 (visible & display 可见)
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

      // 3. 提取视频直链或播放源
      function getVideoSource(video) {
        if (!video) return '';
        if (video.currentSrc && video.currentSrc.trim()) return video.currentSrc.trim();
        if (video.src && video.src.trim()) return video.src.trim();
        var sourceEl = video.querySelector('source[src]');
        if (sourceEl && sourceEl.src) return sourceEl.src.trim();
        return '';
      }

      // 4. 为可见 video 挂载下载按钮
      function attachButtonToVideo(video) {
        if (!isElementVisible(video)) return;
        var parent = video.parentElement;
        if (!parent) return;

        var existingBtn = parent.querySelector(':scope > .velora-video-download-btn');
        if (existingBtn && existingBtn.__veloraVideoTarget === video) {
          return;
        }
        if (existingBtn) {
          existingBtn.remove();
        }

        var parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
          parent.style.setProperty('position', 'relative', 'important');
        }

        var btn = document.createElement('div');
        btn.className = 'velora-video-download-btn';
        btn.__veloraVideoTarget = video;
        btn.innerHTML = [
          '<svg class="velora-video-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
          '  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>',
          '  <polyline points="7 10 12 15 17 10"></polyline>',
          '  <line x1="12" y1="15" x2="12" y2="3"></line>',
          '</svg>',
          '<span>下载资源</span>'
        ].join('');

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

        parent.appendChild(btn);
      }

      // 5. 扫描并处理当前页面所有 video
      function processAllVideos() {
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
          attachButtonToVideo(videos[i]);
        }
      }

      processAllVideos();

      // 6. 挂载 MutationObserver 动态感知 DOM 变化与新 video 注入
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

      // 7. 注册全局清理函数
      window.__veloraVideoQuickDownloadCancel = function() {
        if (observer) observer.disconnect();
        if (observerTimer) clearTimeout(observerTimer);
        document.querySelectorAll('.velora-video-download-btn').forEach(function(b) { b.remove(); });
        var st = document.getElementById('velora-video-quick-download-style');
        if (st) st.remove();
        window.__veloraVideoQuickDownloadInjected = false;
      };
    })();
  `;
};
