import type { DuplicateMarkRule } from '@/composables/useSettings';

export interface DuplicateMarkEngineOptions {
  rules: DuplicateMarkRule[];
  fileIndex: Record<string, string[]>;
  theme?: string;
}

/**
 * 生成在 Webview 页面中执行的文件去重标记与动态监听脚本
 */
export const getDuplicateMarkScript = (options: DuplicateMarkEngineOptions): string => {
  const rulesJson = JSON.stringify(options.rules || []);
  const fileIndexJson = JSON.stringify(options.fileIndex || {});
  const theme = options.theme === 'dark' ? 'dark' : 'light';

  return `
    (function() {
      if (window.__veloraDupMarkCancel) {
        window.__veloraDupMarkCancel();
      }

      window.__veloraDupMarkActive = true;

      const rules = ${rulesJson};
      const fileIndex = ${fileIndexJson};
      const fileKeys = Object.keys(fileIndex);

      if (!rules || rules.length === 0 || fileKeys.length === 0) {
        return;
      }

      // 1. 注入标记胶囊与 Popover 样式（采用项目 Pristine Elegance 标准主题变量）
      let styleEl = document.getElementById('velora-dup-mark-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'velora-dup-mark-style';
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
        '  --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);',
        '  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.2);',
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
        '  --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.02);',
        '  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.02);',
        '}'
      ].join('\\n');

      styleEl.textContent = [
        cssThemeVars,
        '.velora-dup-badge {',
        '  position: absolute !important;',
        '  z-index: 999 !important;',
        '  display: inline-flex !important;',
        '  align-items: center !important;',
        '  justify-content: center !important;',
        '  gap: 5px !important;',
        '  padding: 2px 8px !important;',
        '  font-size: 11px !important;',
        '  font-weight: 500 !important;',
        '  line-height: 1.4 !important;',
        '  color: var(--color-accent) !important;',
        '  background: color-mix(in srgb, var(--bg-surface) 25%, transparent) !important;',
        '  backdrop-filter: blur(8px) !important;',
        '  -webkit-backdrop-filter: blur(8px) !important;',
        '  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent) !important;',
        '  border-radius: 9999px !important;',
        '  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;',
        '  user-select: none !important;',
        '  pointer-events: none !important;',
        '  box-sizing: border-box !important;',
        '  transition: background-color 0.15s ease !important;',
        '}',
        '*:hover > .velora-dup-badge {',
        '  background: color-mix(in srgb, var(--bg-surface-hover) 40%, transparent) !important;',
        '}',
        '.velora-dup-badge-dot {',
        '  width: 5px !important;',
        '  height: 5px !important;',
        '  border-radius: 50% !important;',
        '  background: var(--color-accent) !important;',
        '  flex-shrink: 0 !important;',
        '}',
        '#velora-dup-global-popover {',
        '  position: fixed !important;',
        '  z-index: 2147483647 !important;',
        '  min-width: 220px !important;',
        '  max-width: 480px !important;',
        '  background: color-mix(in srgb, var(--bg-surface) 35%, transparent) !important;',
        '  backdrop-filter: blur(16px) saturate(180%) !important;',
        '  -webkit-backdrop-filter: blur(16px) saturate(180%) !important;',
        '  border: 1px solid color-mix(in srgb, var(--border-color) 40%, transparent) !important;',
        '  border-radius: 8px !important;',
        '  padding: 10px 12px !important;',
        '  color: var(--text-primary) !important;',
        '  font-size: 12px !important;',
        '  font-family: inherit !important;',
        '  line-height: 1.5 !important;',
        '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;',
        '  pointer-events: none !important;',
        '  opacity: 0 !important;',
        '  visibility: hidden !important;',
        '  transition: opacity 0.15s ease, visibility 0.15s ease, transform 0.15s ease !important;',
        '  transform: translateY(4px) !important;',
        '  word-break: break-all !important;',
        '  box-sizing: border-box !important;',
        '}',
        '#velora-dup-global-popover.visible {',
        '  opacity: 1 !important;',
        '  visibility: visible !important;',
        '  transform: translateY(0) !important;',
        '}',
        '#velora-dup-global-popover .popover-header {',
        '  font-weight: 600 !important;',
        '  color: var(--color-accent) !important;',
        '  margin-bottom: 4px !important;',
        '  display: flex !important;',
        '  align-items: center !important;',
        '  gap: 6px !important;',
        '}',
        '#velora-dup-global-popover .popover-sub {',
        '  font-size: 11px !important;',
        '  color: var(--text-secondary) !important;',
        '  margin-bottom: 6px !important;',
        '  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 30%, transparent) !important;',
        '  padding-bottom: 4px !important;',
        '}',
        '#velora-dup-global-popover .popover-path-list {',
        '  display: flex !important;',
        '  flex-direction: column !important;',
        '  gap: 4px !important;',
        '  max-height: 180px !important;',
        '  overflow-y: auto !important;',
        '}',
        '#velora-dup-global-popover .popover-path-item {',
        '  padding: 4px 8px !important;',
        '  color: var(--text-primary) !important;',
        '  background: color-mix(in srgb, var(--bg-surface-hover) 40%, transparent) !important;',
        '  border: 1px solid color-mix(in srgb, var(--border-color) 25%, transparent) !important;',
        '  border-radius: 4px !important;',
        '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;',
        '  font-size: 11px !important;',
        '}'
      ].join('\\n');
      if (!styleEl.parentNode) {
        document.head.appendChild(styleEl);
      }

      // 2. 挂载全局单例 Popover 浮层
      let popover = document.getElementById('velora-dup-global-popover');
      if (!popover) {
        popover = document.createElement('div');
        popover.id = 'velora-dup-global-popover';
        document.body.appendChild(popover);
      }

      // 3. 算法函数：有效字符提取与相似度计算
      function extractEffectiveChars(str) {
        if (!str) return [];
        var s = String(str).trim();
        s = s.replace(/\\.(m3u8|ts|mp4|mkv|avi|mov|wmv|flv|webm|mp3|flac|wav|aac|ogg|jpg|png|webp)$/i, '');
        s = s.replace(/[\\(\\[\\{【（]?(?:19|20)\\d{2}[\\)\\]\\}】）]?/g, '');
        s = s.replace(/\\b(?:1080p|720p|2160p|4k|bluray|web-?dl|hdrip|h264|x264|h265|x265|aac)\\b/gi, '');
        var lower = s.toLowerCase();
        var chars = Array.from(lower);
        return chars.filter(function(ch) { return /[\\p{L}\\p{N}]/u.test(ch); });
      }

      function calculateLCSAndConsecutive(candidateChars, targetChars) {
        var m = candidateChars.length;
        var n = targetChars.length;
        if (m === 0 || n === 0) return { lcsLength: 0, maxConsecutive: 0 };
        
        var dp = Array.from({ length: m + 1 }, function() { return new Array(n + 1).fill(0); });
        for (var i = 1; i <= m; i++) {
          var cChar = candidateChars[i - 1];
          for (var j = 1; j <= n; j++) {
            if (cChar === targetChars[j - 1]) {
              dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
              dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
          }
        }
        var lcsLength = dp[m][n];
        
        var maxConsecutive = 0;
        var matchDp = Array.from({ length: m + 1 }, function() { return new Array(n + 1).fill(0); });
        for (var i = 1; i <= m; i++) {
          var cChar = candidateChars[i - 1];
          for (var j = 1; j <= n; j++) {
            if (cChar === targetChars[j - 1]) {
              matchDp[i][j] = matchDp[i - 1][j - 1] + 1;
              if (matchDp[i][j] > maxConsecutive) {
                maxConsecutive = matchDp[i][j];
              }
            } else {
              matchDp[i][j] = 0;
            }
          }
        }
        return { lcsLength: lcsLength, maxConsecutive: maxConsecutive };
      }

      function calculateSimilarity(candidate, target) {
        var candidateChars = extractEffectiveChars(candidate);
        var targetChars = extractEffectiveChars(target);
        if (candidateChars.length === 0 || targetChars.length === 0) {
          return { score: 0, charOverlap: 0, lcsLength: 0, maxConsecutive: 0, coverage: 0 };
        }
        var targetCountMap = new Map();
        for (var i = 0; i < targetChars.length; i++) {
          var ch = targetChars[i];
          targetCountMap.set(ch, (targetCountMap.get(ch) || 0) + 1);
        }
        var charOverlap = 0;
        for (var i = 0; i < candidateChars.length; i++) {
          var ch = candidateChars[i];
          var rem = targetCountMap.get(ch) || 0;
          if (rem > 0) {
            charOverlap++;
            targetCountMap.set(ch, rem - 1);
          }
        }
        var lcsRes = calculateLCSAndConsecutive(candidateChars, targetChars);
        var lcsLength = lcsRes.lcsLength;
        var maxConsecutive = lcsRes.maxConsecutive;
        var coverage = candidateChars.length > 0 ? lcsLength / candidateChars.length : 0;
        var consecutiveBonus = maxConsecutive >= 2 ? maxConsecutive * 1.5 : 0;
        var score = charOverlap * 1.0 + lcsLength * 2.0 + consecutiveBonus;
        return { score: score, charOverlap: charOverlap, lcsLength: lcsLength, maxConsecutive: maxConsecutive, coverage: coverage };
      }

      function isSimilarExistingFile(existingFileName, newFileName) {
        if (!existingFileName || !newFileName) return false;

        // 1. 提取有效字符
        var existingChars = extractEffectiveChars(existingFileName);
        var newChars = extractEffectiveChars(newFileName);
        if (existingChars.length === 0 || newChars.length === 0) return false;

        var str1 = existingChars.join('');
        var str2 = newChars.join('');
        if (str1 === str2) return true;

        var len1 = existingChars.length;
        var len2 = newChars.length;
        var minLen = Math.min(len1, len2);
        var maxLen = Math.max(len1, len2);
        if (minLen < 3) return false;

        // 2. 纯拉丁字母单词重叠校验（避免单字散落误判）
        var isLatin1 = /^[a-z0-9\\s_-]+$/i.test(existingFileName.replace(/\\.[^.]+$/, ''));
        var isLatin2 = /^[a-z0-9\\s_-]+$/i.test(newFileName.replace(/\\.[^.]+$/, ''));
        if (isLatin1 && isLatin2) {
          var words1 = existingFileName.toLowerCase().replace(/\\.[^.]+$/, '').split(/[^a-z0-9]+/i).filter(function(w) { return w.length >= 2; });
          var words2 = newFileName.toLowerCase().replace(/\\.[^.]+$/, '').split(/[^a-z0-9]+/i).filter(function(w) { return w.length >= 2; });
          var set2 = new Set(words2);
          var hasCommon = false;
          for (var wi = 0; wi < words1.length; wi++) {
            if (set2.has(words1[wi])) {
              hasCommon = true;
              break;
            }
          }
          if (!hasCommon) {
            return false;
          }
        }

        // 3. LCS 与双向 Dice 相似度
        var lcsRes = calculateLCSAndConsecutive(existingChars, newChars);
        var lcsLength = lcsRes.lcsLength;
        var maxConsecutive = lcsRes.maxConsecutive;
        var dice = (2 * lcsLength) / (len1 + len2);
        var consecutiveRatio = maxConsecutive / minLen;

        if (dice >= 0.75 && maxConsecutive >= 3) {
          return true;
        }

        if (consecutiveRatio >= 0.95 && (minLen / maxLen) >= 0.5 && maxConsecutive >= 3) {
          return true;
        }

        return false;
      }

      function isUrlMatch(pattern, url) {
        if (!pattern || !url) return false;
        pattern = pattern.trim();
        url = url.trim();
        if (pattern === '*' || pattern === '*://*/*' || pattern === '*://*' || pattern === '*/*') return true;
        var urlObj;
        try { urlObj = new URL(url); } catch (e) { return false; }
        var hostname = urlObj.hostname;

        var normalizedPattern = pattern;
        if (!normalizedPattern.includes('://')) {
          normalizedPattern = '*://' + normalizedPattern;
        }

        if (normalizedPattern.startsWith('*://') && normalizedPattern.endsWith('/*') && !normalizedPattern.slice(4, -2).includes('/')) {
          var domainMatch = normalizedPattern.slice(4, -2).replace(/^\\*\\./, '');
          return hostname === domainMatch || hostname.endsWith('.' + domainMatch);
        }

        var regexPattern = normalizedPattern
          .replace(/[.+?^\\$\{}|[\\]\\\\]/g, '\\\\$&')
          .replace(/\\*/g, '.*')
          .replace(/^(?:\\.\\*|\\(\\?:https\\?\\|ftp\\))?:\\/\\//, '(?:https?|ftp|file)://');

        try {
          var regex = new RegExp('^' + regexPattern + '$', 'i');
          var originPath = urlObj.origin + urlObj.pathname;
          return regex.test(url) || regex.test(originPath);
        } catch(e) { return false; }
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function extractByRegex(patternStr, targetStr) {
        if (!patternStr || !targetStr) return null;
        try {
          var re = new RegExp(patternStr, 'i');
          var m = String(targetStr).match(re);
          if (!m || !m[0]) return null;
          var trimmed = String(m[0]).trim().toLowerCase();
          return trimmed.length > 0 ? trimmed : null;
        } catch (e) {
          return null;
        }
      }

      // 4. 判重检索与结果缓存
      var checkCache = new Map();
      function checkDuplicate(targetTitle, regexPattern) {
        if (!targetTitle) return null;
        var clean = targetTitle.trim();
        if (!clean) return null;
        
        var customRegex = (regexPattern || '').trim();
        var cacheKey = clean + '###' + customRegex;
        if (checkCache.has(cacheKey)) return checkCache.get(cacheKey);

        // 1. 若配置了自定义正则表达式，纯粹按双方正则提取结果是否相同比对
        if (customRegex) {
          var targetExtracted = extractByRegex(customRegex, clean);
          if (!targetExtracted) {
            checkCache.set(cacheKey, null);
            return null;
          }

          for (var i = 0; i < fileKeys.length; i++) {
            var existingKey = fileKeys[i];
            var existingExtracted = extractByRegex(customRegex, existingKey);
            if (existingExtracted && existingExtracted === targetExtracted) {
              var paths = fileIndex[existingKey] || [];
              if (paths.length > 0) {
                var res = { name: existingKey, paths: paths };
                checkCache.set(cacheKey, res);
                return res;
              }
            }
          }

          checkCache.set(cacheKey, null);
          return null;
        }
        
        // 2. 留空时使用默认流程：
        // 2.1 精确同名匹配
        if (fileIndex[clean] && fileIndex[clean].length > 0) {
          var res = { name: clean, paths: fileIndex[clean] };
          checkCache.set(cacheKey, res);
          return res;
        }
        
        // 2.2 相似度匹配
        for (var i = 0; i < fileKeys.length; i++) {
          var existingKey = fileKeys[i];
          if (isSimilarExistingFile(existingKey, clean)) {
            var paths = fileIndex[existingKey] || [];
            if (paths.length > 0) {
              var res = { name: existingKey, paths: paths };
              checkCache.set(cacheKey, res);
              return res;
            }
          }
        }
        
        checkCache.set(cacheKey, null);
        return null;
      }

      // 5. Popover 交互事件处理
      function onMountElMouseEnter(e) {
        var mountEl = e.currentTarget;
        var badge = mountEl.querySelector(':scope > .velora-dup-badge');
        if (!badge) return;
        var paths = badge.__veloraPaths || [];
        if (!paths.length) return;
        
        var pop = document.getElementById('velora-dup-global-popover');
        if (!pop) return;
        
        var matchedNameHtml = badge.__veloraMatchedName
          ? '<div class="popover-sub">匹配文件: ' + escapeHtml(badge.__veloraMatchedName) + '</div>'
          : '';
        
        var pathsHtml = paths.map(function(p) {
          return '<div class="popover-path-item" title="' + escapeHtml(p) + '">' + escapeHtml(p) + '</div>';
        }).join('');

        pop.innerHTML = [
          '<div class="popover-header">',
          '  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
          '  <span>本地已下载文件 (' + paths.length + ')</span>',
          '</div>',
          matchedNameHtml,
          '<div class="popover-path-list">',
          pathsHtml,
          '</div>'
        ].join('');
        
        var rect = badge.getBoundingClientRect();
        var top = rect.bottom + 6;
        var left = rect.left;
        
        pop.style.display = 'block';
        pop.classList.add('visible');
        
        var popRect = pop.getBoundingClientRect();
        if (left + popRect.width > window.innerWidth - 12) {
          left = Math.max(12, window.innerWidth - popRect.width - 12);
        }
        if (top + popRect.height > window.innerHeight - 12) {
          top = Math.max(12, rect.top - popRect.height - 6);
        }
        
        pop.style.top = top + 'px';
        pop.style.left = left + 'px';
      }

      function onMountElMouseLeave() {
        var pop = document.getElementById('velora-dup-global-popover');
        if (pop) {
          pop.classList.remove('visible');
          pop.style.display = 'none';
        }
      }

      // 6. 扫描并注入胶囊
      function processElements() {
        var currentUrl = window.location.href;
        var matchedRules = rules.filter(function(r) { return isUrlMatch(r.domain, currentUrl); });
        if (matchedRules.length === 0) return;
        
        matchedRules.forEach(function(rule) {
          if (!rule.mountSelector) return;
          var mountNodes;
          try {
            mountNodes = document.querySelectorAll(rule.mountSelector);
          } catch (e) {
            return;
          }
          if (!mountNodes || mountNodes.length === 0) return;

          var titleSelector = (rule.titleSelector || '').trim();
          var titleAttr = (rule.titleAttribute || 'innerText').trim() || 'innerText';

          mountNodes.forEach(function(mountEl) {
            var existingBadge = mountEl.querySelector(':scope > .velora-dup-badge');
            
            var targetEl = mountEl;
            if (titleSelector) {
              try {
                if (mountEl.matches && mountEl.matches(titleSelector)) {
                  targetEl = mountEl;
                } else {
                  targetEl = mountEl.querySelector(titleSelector);
                }
              } catch (e) {
                targetEl = null;
              }
            }

            if (!targetEl) {
              if (existingBadge) existingBadge.remove();
              return;
            }

            var rawVal = targetEl[titleAttr];
            if (rawVal === undefined || rawVal === null) {
              if (typeof targetEl.getAttribute === 'function') {
                rawVal = targetEl.getAttribute(titleAttr);
              }
            }

            var text = (rawVal != null) ? String(rawVal).trim() : '';
            if (!text) {
              if (existingBadge) existingBadge.remove();
              return;
            }
            
            var match = checkDuplicate(text, rule.regexPattern);
            if (!match || !match.paths || match.paths.length === 0) {
              if (existingBadge) existingBadge.remove();
              return;
            }
            
            // 如果已存在 badge 且匹配的文件相同，直接更新 paths
            if (existingBadge && existingBadge.__veloraMatchedName === match.name) {
              existingBadge.__veloraPaths = match.paths;
              return;
            }

            var computedPos = window.getComputedStyle(mountEl).position;
            if (computedPos === 'static') {
              mountEl.style.setProperty('position', 'relative', 'important');
            }
            
            if (existingBadge) existingBadge.remove();
            
            var badge = document.createElement('div');
            badge.className = 'velora-dup-badge';
            badge.innerHTML = '<span class="velora-dup-badge-dot"></span><span>已下载</span>';
            badge.style.top = (typeof rule.offsetY === 'number' ? rule.offsetY : 8) + 'px';
            badge.style.left = (typeof rule.offsetX === 'number' ? rule.offsetX : 8) + 'px';
            badge.__veloraPaths = match.paths;
            badge.__veloraMatchedName = match.name;
            
            mountEl.removeEventListener('mouseenter', onMountElMouseEnter);
            mountEl.removeEventListener('mouseleave', onMountElMouseLeave);
            mountEl.addEventListener('mouseenter', onMountElMouseEnter);
            mountEl.addEventListener('mouseleave', onMountElMouseLeave);
            
            mountEl.appendChild(badge);
            mountEl.dataset.veloraDupProcessed = 'true';
          });
        });
      }

      // 7. 首次执行处理
      processElements();

      // 8. 挂载 MutationObserver 监听动态内容新增 (150ms 防抖)
      var debounceTimer = null;
      var observer = new MutationObserver(function() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() {
          processElements();
        }, 150);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      // 9. 注册全局清理函数
      window.__veloraDupMarkCancel = function() {
        if (observer) observer.disconnect();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (checkCache) checkCache.clear();
        document.querySelectorAll('.velora-dup-badge').forEach(function(b) { b.remove(); });
        var pop = document.getElementById('velora-dup-global-popover');
        if (pop) pop.remove();
        var st = document.getElementById('velora-dup-mark-style');
        if (st) st.remove();
        document.querySelectorAll('[data-velora-dup-processed]').forEach(function(el) {
          delete el.dataset.veloraDupProcessed;
        });
        window.__veloraDupMarkActive = false;
      };
    })();
  `;
};

/**
 * 清除 Webview 中的标记重复引擎及所有注入的 DOM 节点
 */
export const getDuplicateMarkCleanupScript = (): string => {
  return `if (window.__veloraDupMarkCancel) window.__veloraDupMarkCancel();`;
};
