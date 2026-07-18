import { DirectiveBinding, ObjectDirective } from 'vue';

interface TooltipElement extends HTMLElement {
  _tooltipNode?: HTMLDivElement;
  _tooltipEnter?: (e: MouseEvent) => void;
  _tooltipLeave?: (e: MouseEvent) => void;
  _tooltipClick?: (e: MouseEvent) => void;
}

const createTooltipNode = (text: string): HTMLDivElement => {
  const node = document.createElement('div');
  node.textContent = text;
  node.style.position = 'fixed';
  node.style.background = 'var(--bg-surface, #FFFFFF)';
  node.style.color = 'var(--text-primary, #3F3D39)';
  node.style.border = '1px solid var(--border-color, #E4E7ED)';
  node.style.padding = '6px 10px';
  node.style.borderRadius = '6px';
  node.style.fontSize = '12px';
  node.style.fontWeight = '500';
  node.style.whiteSpace = 'nowrap';
  node.style.boxShadow = 'var(--shadow-sm)';
  node.style.zIndex = '999999';
  node.style.opacity = '0';
  node.style.transform = 'translateY(4px)';
  node.style.transition = 'opacity 0.2s, transform 0.2s';
  node.style.pointerEvents = 'none';
  return node;
};

export const tooltip: ObjectDirective = {
  mounted(el: TooltipElement, binding: DirectiveBinding) {
    if (!binding.value) return;

    el._tooltipEnter = () => {
      const text = binding.value;
      if (!text) return;

      const node = createTooltipNode(text);
      el._tooltipNode = node;
      document.body.appendChild(node);

      // Need to wait for next tick to get dimensions of the node
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        
        let top = rect.bottom + 8; // Default below
        let left = rect.left + (rect.width / 2) - (nodeRect.width / 2); // Default center

        // Check horizontal overflow
        if (left < 8) {
          left = 8; // Pad from left edge
        } else if (left + nodeRect.width > window.innerWidth - 8) {
          left = window.innerWidth - nodeRect.width - 8; // Pad from right edge
        }

        // Check vertical overflow (if it goes below screen, put it above)
        if (top + nodeRect.height > window.innerHeight - 8) {
          top = rect.top - nodeRect.height - 8;
        }

        node.style.top = `${top}px`;
        node.style.left = `${left}px`;
        
        // Trigger animation
        requestAnimationFrame(() => {
          node.style.opacity = '1';
          node.style.transform = 'translateY(0)';
        });
      });
    };

    el._tooltipLeave = () => {
      if (el._tooltipNode) {
        const node = el._tooltipNode;
        node.style.opacity = '0';
        node.style.transform = 'translateY(4px)';
        setTimeout(() => {
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }, 200);
        el._tooltipNode = undefined;
      }
    };

    el._tooltipClick = () => {
      if (el._tooltipLeave) el._tooltipLeave(new MouseEvent('mouseleave'));
    };

    el.addEventListener('mouseenter', el._tooltipEnter);
    el.addEventListener('mouseleave', el._tooltipLeave);
    el.addEventListener('click', el._tooltipClick);
  },
  
  updated(el: TooltipElement, binding: DirectiveBinding) {
    if (binding.value !== binding.oldValue) {
      if (!binding.value && el._tooltipLeave) {
        el._tooltipLeave(new MouseEvent('mouseleave'));
      } else if (el._tooltipNode) {
        el._tooltipNode.textContent = binding.value;
      }
    }
  },

  unmounted(el: TooltipElement) {
    if (el._tooltipEnter) el.removeEventListener('mouseenter', el._tooltipEnter);
    if (el._tooltipLeave) el.removeEventListener('mouseleave', el._tooltipLeave);
    if (el._tooltipClick) el.removeEventListener('click', el._tooltipClick);
    
    if (el._tooltipNode && el._tooltipNode.parentNode) {
      el._tooltipNode.parentNode.removeChild(el._tooltipNode);
    }
  }
};
