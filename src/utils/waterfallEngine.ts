/**
 * 瀑布模式 (Waterfall Flow) 运行时引擎
 * 架构：主标签页保持 URL/Title 不变，后台专属隐藏 Webview 负责下一页预渲染与 DOM 提取，触底时实时拼接并驱动循环
 */

export interface WaterfallEngineOptions {
  domain: string;
  nextSelector: string;
  contentSelector: string;
  tabId: string;
}

export interface WaterfallExtractResult {
  contentHtml: string;
  nextUrl: string;
  hasContent: boolean;
}

/**
 * 生成在主标签页中注入的初始化脚本（触底监听、骨架屏、DOM 拼接函数、状态栏、徽标样式）
 */
export const getWaterfallParentInitScript = (options: { contentSelector: string; nextSelector: string; tabId: string }) => {
  return `
    (function() {
      if (window.__veloraWaterfallDestroy) {
        window.__veloraWaterfallDestroy();
      }

      window.__veloraWaterfallActive = true;
      const tabId = ${JSON.stringify(options.tabId)};
      const contentSelector = ${JSON.stringify(options.contentSelector)};

      // 1. 注入分隔线、骨架屏、重试卡片与动画样式
      let styleEl = document.getElementById('velora-waterfall-styles');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'velora-waterfall-styles';
        styleEl.textContent = \`
          @keyframes velora-wf-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes velora-wf-shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }

          .velora-page-separator {
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 28px 0 16px 0;
            width: 100% !important;
            grid-column: 1 / -1 !important;
            user-select: none;
            box-sizing: border-box !important;
          }
          .velora-page-separator::before,
          .velora-page-separator::after {
            content: '';
            flex: 1;
            height: 1px;
            background: linear-gradient(to right, transparent, rgba(140, 140, 140, 0.25), transparent);
          }
          .velora-page-badge {
            padding: 4px 14px;
            font-size: 12px;
            font-weight: 600;
            color: rgba(120, 120, 120, 0.9);
            background: rgba(120, 120, 120, 0.08);
            border-radius: 20px;
            margin: 0 12px;
            letter-spacing: 0.5px;
          }

          /* 骨架屏包装层 */
          .velora-wf-skeleton-wrapper {
            width: 100% !important;
            grid-column: 1 / -1 !important;
            box-sizing: border-box !important;
            padding: 4px 0 20px 0;
          }
          .velora-wf-skeleton-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 13px;
            color: rgba(120, 120, 120, 0.85);
            margin-bottom: 14px;
            user-select: none;
          }
          .velora-wf-skeleton-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid #3b82f6;
            border-top-color: transparent;
            border-radius: 50%;
            animation: velora-wf-spin 0.8s linear infinite;
          }
          .velora-wf-skeleton-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
            width: 100%;
            box-sizing: border-box;
          }
          .velora-wf-skeleton-card {
            background: rgba(150, 150, 150, 0.04);
            border: 1px solid rgba(150, 150, 150, 0.12);
            border-radius: 8px;
            padding: 12px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .velora-wf-shimmer-block {
            background: linear-gradient(90deg, rgba(150, 150, 150, 0.08) 25%, rgba(150, 150, 150, 0.18) 50%, rgba(150, 150, 150, 0.08) 75%);
            background-size: 200% 100%;
            animation: velora-wf-shimmer 1.5s infinite;
            border-radius: 4px;
          }
          .velora-wf-skeleton-thumb {
            width: 100%;
            height: 110px;
          }
          .velora-wf-skeleton-line-title {
            width: 85%;
            height: 14px;
          }
          .velora-wf-skeleton-line-sub {
            width: 55%;
            height: 12px;
          }

          /* 错误重试卡片 */
          .velora-wf-retry-card {
            width: 100% !important;
            grid-column: 1 / -1 !important;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            margin: 10px 0;
            background: rgba(239, 68, 68, 0.04);
            border: 1px dashed rgba(239, 68, 68, 0.28);
            border-radius: 8px;
            gap: 12px;
            color: #ef4444;
            font-size: 13px;
            user-select: none;
            box-sizing: border-box !important;
          }
          .velora-wf-retry-btn {
            padding: 6px 18px;
            background: #3b82f6;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
            transition: opacity 0.2s;
          }
          .velora-wf-retry-btn:hover {
            opacity: 0.9;
          }
        \`;
        document.head.appendChild(styleEl);
      }

      // 2. 创建或更新底部加载状态指示条 (当全部加载完毕或无骨架屏时兜底)
      let indicator = document.getElementById('velora-waterfall-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'velora-waterfall-indicator';
        indicator.style.cssText = \`
          width: 100%;
          padding: 18px 0;
          text-align: center;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          color: rgba(120, 120, 120, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          user-select: none;
          box-sizing: border-box;
        \`;
        document.body.appendChild(indicator);
      }

      // 3. 状态更新方法
      window.__veloraWaterfallSetStatus = function(state, text) {
        if (!indicator) return;
        if (state === 'finished') {
          indicator.innerHTML = '<span style="opacity:0.6;">—— 已加载全部内容 ——</span>';
        } else if (state === 'error') {
          indicator.innerHTML = '<span style="color:#ef4444;">' + (text || '下一页加载失败') + '</span>';
        } else {
          indicator.innerHTML = '';
        }
      };

      // 4. 自动修复图片懒加载属性
      function fixLazyload(container) {
        if (!container) return;
        const images = container.querySelectorAll('img');
        images.forEach(img => {
          const rawSrc = 
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-url') ||
            img.getAttribute('data-actualsrc');

          if (rawSrc && (!img.src || img.src.includes('data:image') || img.src.includes('blank'))) {
            try {
              img.src = new URL(rawSrc, window.location.href).href;
            } catch (e) {
              img.src = rawSrc;
            }
          }
        });
      }

      // 5. 展示第 N 页骨架屏与分隔条
      window.__veloraWaterfallShowSkeleton = function(pageNum) {
        const currentContainer = document.querySelector(contentSelector);
        if (!currentContainer) return false;

        // 如果该页骨架或分隔线已存在则不重复创建
        if (document.querySelector(\`[data-wf-page="\${pageNum}"]\`)) return true;

        const fragment = document.createDocumentFragment();

        // 页码分隔条
        const separator = document.createElement('div');
        separator.className = 'velora-page-separator';
        separator.setAttribute('data-wf-page', String(pageNum));
        separator.innerHTML = '<span class="velora-page-badge">第 ' + pageNum + ' 页</span>';
        fragment.appendChild(separator);

        // 骨架屏主体
        const skeletonWrapper = document.createElement('div');
        skeletonWrapper.className = 'velora-wf-skeleton-wrapper';
        skeletonWrapper.setAttribute('data-wf-page', String(pageNum));
        skeletonWrapper.innerHTML = \`
          <div class="velora-wf-skeleton-header">
            <div class="velora-wf-skeleton-spinner"></div>
            <span>正在准备第 \${pageNum} 页内容</span>
          </div>
          <div class="velora-wf-skeleton-grid">
            <div class="velora-wf-skeleton-card">
              <div class="velora-wf-shimmer-block velora-wf-skeleton-thumb"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-title"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-sub"></div>
            </div>
            <div class="velora-wf-skeleton-card">
              <div class="velora-wf-shimmer-block velora-wf-skeleton-thumb"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-title"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-sub"></div>
            </div>
            <div class="velora-wf-skeleton-card">
              <div class="velora-wf-shimmer-block velora-wf-skeleton-thumb"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-title"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-sub"></div>
            </div>
            <div class="velora-wf-skeleton-card">
              <div class="velora-wf-shimmer-block velora-wf-skeleton-thumb"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-title"></div>
              <div class="velora-wf-shimmer-block velora-wf-skeleton-line-sub"></div>
            </div>
          </div>
        \`;
        fragment.appendChild(skeletonWrapper);
        currentContainer.appendChild(fragment);
        return true;
      };

      // 6. 将骨架屏就地转换为错误重试卡片
      window.__veloraWaterfallSetSkeletonError = function(pageNum, errorText) {
        const skeletonWrapper = document.querySelector(\`.velora-wf-skeleton-wrapper[data-wf-page="\${pageNum}"]\`);
        if (!skeletonWrapper) return false;

        skeletonWrapper.innerHTML = \`
          <div class="velora-wf-retry-card">
            <span>第 \${pageNum} 页准备异常 (\${errorText || '加载失败'})</span>
            <button class="velora-wf-retry-btn" onclick="console.log('__velora_wf_retry__:' + \${JSON.stringify(tabId)})">点击重试</button>
          </div>
        \`;
        return true;
      };

      // 7. 移除第 N 页骨架屏及分隔条（用于没有更多页面时清理）
      window.__veloraWaterfallRemoveSkeleton = function(pageNum) {
        const elements = document.querySelectorAll(\`[data-wf-page="\${pageNum}"]\`);
        elements.forEach(el => el.parentNode && el.parentNode.removeChild(el));
      };

      // 8. DOM 拼接方法（就地替换骨架屏或直接插入）
      window.__veloraWaterfallAppend = function(contentHtml, pageNum) {
        const currentContainer = document.querySelector(contentSelector);
        if (!currentContainer) {
          console.error('[Velora Waterfall] 未找到内容容器:', contentSelector);
          return false;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHtml;
        const newChildren = Array.from(tempDiv.children);
        if (newChildren.length === 0) return false;

        newChildren.forEach(child => fixLazyload(child));

        const skeletonWrapper = document.querySelector(\`.velora-wf-skeleton-wrapper[data-wf-page="\${pageNum}"]\`);
        const separator = document.querySelector(\`.velora-page-separator[data-wf-page="\${pageNum}"]\`);

        if (skeletonWrapper && skeletonWrapper.parentNode) {
          // 已经有骨架屏：在骨架屏位置替换为真实元素
          const parent = skeletonWrapper.parentNode;
          newChildren.forEach(child => {
            parent.insertBefore(child, skeletonWrapper);
          });
          parent.removeChild(skeletonWrapper);
        } else {
          // 未提前显示骨架屏（例如后台已就绪）：直接创建分隔条与真实内容插入末尾
          const fragment = document.createDocumentFragment();
          if (!separator) {
            const sep = document.createElement('div');
            sep.className = 'velora-page-separator';
            sep.setAttribute('data-wf-page', String(pageNum));
            sep.innerHTML = '<span class="velora-page-badge">第 ' + pageNum + ' 页</span>';
            fragment.appendChild(sep);
          }
          newChildren.forEach(child => fragment.appendChild(child));
          currentContainer.appendChild(fragment);
        }

        window.dispatchEvent(new CustomEvent('velora-waterfall-appended', {
          detail: { page: pageNum, count: newChildren.length }
        }));

        return true;
      };

      // 9. 滚动检测与触底信号通知 (距离底部 650px 触发)
      let isThrottled = false;
      function checkScroll() {
        if (isThrottled) return;
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight;

        if (scrollHeight - scrollTop - clientHeight < 650) {
          isThrottled = true;
          console.log('__velora_wf_bottom__:' + tabId);
          setTimeout(() => { isThrottled = false; }, 300);
        }
      }

      window.addEventListener('scroll', checkScroll, { passive: true });
      window.addEventListener('resize', checkScroll, { passive: true });

      // 初始触发一次检查
      setTimeout(checkScroll, 400);

      // 10. 销毁注销
      window.__veloraWaterfallDestroy = function() {
        window.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        window.__veloraWaterfallActive = false;
        window.__veloraWaterfallDestroy = null;
        window.__veloraWaterfallAppend = null;
        window.__veloraWaterfallShowSkeleton = null;
        window.__veloraWaterfallSetSkeletonError = null;
        window.__veloraWaterfallRemoveSkeleton = null;
        window.__veloraWaterfallSetStatus = null;
        if (indicator && indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
        if (styleEl && styleEl.parentNode) {
          styleEl.parentNode.removeChild(styleEl);
        }
        const allWfElements = document.querySelectorAll('.velora-page-separator, .velora-wf-skeleton-wrapper, .velora-wf-retry-card');
        allWfElements.forEach(el => el.parentNode && el.parentNode.removeChild(el));
      };

      console.log('[Velora Waterfall] 主标签页监听器已注入完成');
    })();
  `;
};

/**
 * 生成在后台隐藏 Webview 中执行的 DOM 与下一页提取脚本（支持轮询等待 SPA 渲染）
 */
export const getWaterfallBackgroundExtractScript = (contentSelector: string, nextSelector: string) => {
  return `
    new Promise((resolve) => {
      const contentSel = ${JSON.stringify(contentSelector)};
      const nextSel = ${JSON.stringify(nextSelector)};
      const startTime = Date.now();
      const maxWaitMs = 3500;

      function extract() {
        const container = document.querySelector(contentSel);
        const hasChildren = container && container.children && container.children.length > 0;

        if (hasChildren || (Date.now() - startTime >= maxWaitMs)) {
          let contentHtml = '';
          let nextUrl = '';

          if (container) {
            contentHtml = container.innerHTML;
          }

          if (nextSel) {
            try {
              const nextEl = document.querySelector(nextSel);
              if (nextEl) {
                const href = nextEl.getAttribute('href') || nextEl.getAttribute('xlink:href') || '';
                if (href && !href.startsWith('javascript:') && href !== '#') {
                  nextUrl = new URL(href, window.location.href).href;
                }
              }
            } catch (e) {}
          }

          resolve(JSON.stringify({
            contentHtml: contentHtml,
            nextUrl: nextUrl,
            hasContent: !!container && container.children.length > 0
          }));
        } else {
          setTimeout(extract, 100);
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', extract, { once: true });
      } else {
        extract();
      }
    })
  `;
};

/**
 * 提取当前页面初始下一页 URL 脚本
 */
export const getWaterfallQueryInitialNextUrlScript = (nextSelector: string) => {
  return `
    (function() {
      try {
        const nextEl = document.querySelector(${JSON.stringify(nextSelector)});
        if (!nextEl) return '';
        const href = nextEl.getAttribute('href') || nextEl.getAttribute('xlink:href') || '';
        if (href && !href.startsWith('javascript:') && href !== '#') {
          return new URL(href, window.location.href).href;
        }
      } catch (e) {}
      return '';
    })()
  `;
};

/**
 * 生成取消/关闭主标签页瀑布流的执行脚本
 */
export const getWaterfallDestroyScript = () => {
  return `if (window.__veloraWaterfallDestroy) window.__veloraWaterfallDestroy();`;
};
