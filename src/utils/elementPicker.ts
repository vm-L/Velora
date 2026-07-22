export type PickerType = 'text' | 'image';

export const getPickerCancelScript = () => {
  return `if (window.__elementPickerCancel) window.__elementPickerCancel();`;
};

export const getPickerScript = (type: PickerType) => {
  return `
    new Promise((resolve) => {
      const type = '${type}';
      if (window.__elementPickerActive) {
        if (window.__elementPickerCancel) window.__elementPickerCancel();
      }
      window.__elementPickerActive = true;

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '2147483647';
      overlay.style.transition = 'all 0.1s ease';
      // Unified styling variables
      const colorAccent = 'var(--color-accent, #3b82f6)';
      const bgOverlay = type === 'image' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.2)';
      overlay.style.backgroundColor = bgOverlay;
      overlay.style.border = '2px solid ' + colorAccent;
      overlay.style.borderRadius = '4px';
      document.body.appendChild(overlay);

      const tooltip = document.createElement('div');
      tooltip.style.position = 'fixed';
      tooltip.style.zIndex = '2147483647';
      tooltip.style.backgroundColor = 'var(--bg-surface, #1f2937)';
      tooltip.style.color = 'var(--text-primary, #ffffff)';
      tooltip.style.border = '1px solid var(--border-color, #374151)';
      tooltip.style.padding = '4px 8px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.fontSize = '12px';
      tooltip.style.fontFamily = 'system-ui, sans-serif';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
      tooltip.style.display = 'none';
      tooltip.style.transition = 'all 0.1s ease';
      document.body.appendChild(tooltip);

      let currentEl = null;
      let selectedEl = null;
      let path = [];
      let pathIndex = 0;
      let childOverlays = [];

      // Only used for image mode
      const cleanUrl = (raw) => {
        if (!raw || raw.startsWith('data:')) return raw;
        try {
          const parsed = new URL(raw, window.location.href);
          let clean = parsed.origin + parsed.pathname;
          const atIdx = clean.indexOf('@');
          if (atIdx !== -1) clean = clean.substring(0, atIdx);
          return clean + parsed.search;
        } catch {
          return raw;
        }
      };

      const collectImages = (root) => {
        const urls = new Set();
        const elements = [root, ...root.querySelectorAll('*')];
        for (const el of elements) {
          if (el.tagName && el.tagName.toLowerCase() === 'img') {
            if (el.src) urls.add(cleanUrl(el.src));
            if (el.srcset) {
              el.srcset.split(',').forEach(part => {
                const u = part.trim().split(/\\s+/)[0];
                if (u) urls.add(cleanUrl(u));
              });
            }
          }
          try {
            const style = window.getComputedStyle(el);
            const bg = style.backgroundImage;
            if (bg && bg !== 'none') {
              const re = /url\\(["']?(.*?)["']?\\)/g;
              let m;
              while ((m = re.exec(bg)) !== null) {
                if (m[1] && !m[1].startsWith('data:')) {
                  urls.add(cleanUrl(m[1]));
                }
              }
            }
          } catch {}
        }
        return [...urls].filter(Boolean);
      };

      const getAffectedImages = (root) => {
        let list = [];
        const walk = (node) => {
          if (!node) return;
          let isImg = node.tagName.toLowerCase() === 'img';
          if (!isImg) {
            try {
              const style = window.getComputedStyle(node);
              const bg = style.backgroundImage;
              if (bg && bg !== 'none' && bg.includes('url')) {
                isImg = true;
              }
            } catch(e) {}
          }
          if (isImg) {
            list.push(node);
          } else {
            for (const child of node.children) {
              walk(child);
            }
          }
        };
        walk(root);
        return list;
      };

      const updateHighlight = (el) => {
        if (!el || el === document.body || el === document.documentElement) {
          overlay.style.display = 'none';
          tooltip.style.display = 'none';
          childOverlays.forEach(o => o.style.display = 'none');
          return;
        }
        const rect = el.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.display = 'block';

        let tagName = el.tagName.toLowerCase();
        let className = el.className && typeof el.className === 'string' ? '.' + [...el.classList].join('.') : '';
        if (className.length > 20) className = className.substring(0, 20) + '...';

        let levelText = pathIndex === 0 ? ' (滚轮切换选择器范围)' : ' (层级 +' + pathIndex + ')';
        
        childOverlays.forEach(o => o.style.display = 'none');

        if (type === 'text') {
          const text = (el.innerText || el.textContent || '').trim();
          tooltip.textContent = tagName + className + levelText + ' - 文本长度: ' + text.length + ' 字';
        } else if (type === 'image') {
          const imgCount = collectImages(el).length;
          tooltip.textContent = tagName + className + levelText + ' - 包含图片: ' + imgCount + ' 张';

          if (pathIndex > 0) {
            const children = getAffectedImages(el);
            children.forEach((child, idx) => {
              let childOverlay = childOverlays[idx];
              if (!childOverlay) {
                childOverlay = document.createElement('div');
                childOverlay.style.position = 'fixed';
                childOverlay.style.pointerEvents = 'none';
                childOverlay.style.zIndex = '2147483646';
                childOverlay.style.border = '1px dashed ' + colorAccent;
                childOverlay.style.backgroundColor = 'transparent';
                childOverlay.style.transition = 'all 0.1s ease';
                document.body.appendChild(childOverlay);
                childOverlays.push(childOverlay);
              }
              const crect = child.getBoundingClientRect();
              childOverlay.style.top = crect.top + 'px';
              childOverlay.style.left = crect.left + 'px';
              childOverlay.style.width = crect.width + 'px';
              childOverlay.style.height = crect.height + 'px';
              childOverlay.style.display = 'block';
            });
          }
        }

        let topPos = rect.top - 28;
        if (topPos < 5) topPos = rect.top + 5;
        let leftPos = Math.min(window.innerWidth - 220, Math.max(10, rect.left + 5));

        tooltip.style.top = topPos + 'px';
        tooltip.style.left = leftPos + 'px';
        tooltip.style.display = 'block';
      };

      const onMouseOver = (e) => {
        e.stopPropagation();
        if (e.target === currentEl) return;
        currentEl = e.target;
        path = [];
        let temp = currentEl;
        while (temp && temp.tagName.toLowerCase() !== 'html') {
          path.push(temp);
          temp = temp.parentElement;
        }
        pathIndex = 0;
        selectedEl = path[pathIndex];
        updateHighlight(selectedEl);
      };

      const onWheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          if (pathIndex < path.length - 1) {
            pathIndex++;
            selectedEl = path[pathIndex];
            updateHighlight(selectedEl);
          }
        } else if (e.deltaY > 0) {
          if (pathIndex > 0) {
            pathIndex--;
            selectedEl = path[pathIndex];
            updateHighlight(selectedEl);
          }
        }
      };

      const cleanup = (result) => {
        window.__elementPickerActive = false;
        window.__elementPickerCancel = null;
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('wheel', onWheel, { capture: true, passive: false });
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('contextmenu', onContextMenu, true);
        try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch(e){}
        try { if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip); } catch(e){}
        childOverlays.forEach(o => {
          try { if (o.parentNode) o.parentNode.removeChild(o); } catch(e){}
        });
        resolve(result);
      };

      const onClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedEl) {
          cleanup(type === 'text' ? '' : []);
          return;
        }
        
        if (type === 'text') {
          const text = (selectedEl.innerText || selectedEl.textContent || '').trim();
          if (text) {
            navigator.clipboard.writeText(text);
          }
          cleanup(text);
        } else if (type === 'image') {
          const urls = collectImages(selectedEl);
          cleanup(urls);
        }
      };

      const onContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup(type === 'text' ? '' : []);
      };

      window.__elementPickerCancel = () => cleanup(type === 'text' ? '' : []);

      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('wheel', onWheel, { capture: true, passive: false });
      document.addEventListener('click', onClick, true);
      document.addEventListener('contextmenu', onContextMenu, true);
    })
  `;
};
