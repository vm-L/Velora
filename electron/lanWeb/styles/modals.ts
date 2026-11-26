export const lanWebModalStyles = `    /* Modal Dialogs - 1:1 with Velora Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }

    .modal-content {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: var(--text-primary);
    }

    .modal-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-light);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      font-size: 15px;
    }

    #action-modal-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .modal-body {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .modal-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--border-light);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* Video Player Modal */
    .player-modal-content {
      max-width: 960px;
      width: 100%;
      background: #000000;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
    }

    .player-preview-header {
      background: var(--bg-surface);
      border-color: var(--border-color);
      padding: 10px 14px;
      gap: 10px;
    }

    .player-preview-title {
      flex: 1;
      min-width: 0;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-preview-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .player-video-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .player-video-wrap video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .player-gesture-badge {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(15, 15, 15, 0.78);
      color: #ffffff;
      font-size: 12.5px;
      font-weight: 600;
      pointer-events: none;
      z-index: 6;
      backdrop-filter: blur(6px);
    }

    /* Image Lightbox Modal */
    .image-lightbox-overlay {
      background: rgba(8, 8, 10, 0.9) !important;
      padding: 0 !important;
      flex-direction: column;
    }

    .image-lightbox-topbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: calc(52px + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 14px 0;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.65) 0%, transparent 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 12;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .image-lightbox-overlay.is-chrome-hidden .image-lightbox-topbar {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-10px);
    }

    .image-lightbox-counter {
      font-size: 12.5px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      background: rgba(255, 255, 255, 0.14);
      padding: 3px 9px;
      border-radius: 999px;
      flex-shrink: 0;
    }

    .image-lightbox-name {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0.92;
    }

    .image-lightbox-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .image-lightbox-btn {
      color: #ffffff !important;
      background: rgba(255, 255, 255, 0.1) !important;
      font-size: 12px;
    }

    .image-lightbox-btn:hover {
      background: rgba(255, 255, 255, 0.22) !important;
    }

    .image-nav-arrow {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      height: 64px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(18, 18, 20, 0.52);
      color: #ffffff;
      font-size: 28px;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 12;
      backdrop-filter: blur(8px);
      transition: background 0.15s ease, transform 0.15s ease;
    }

    .image-nav-arrow:hover {
      background: rgba(18, 18, 20, 0.8);
    }

    .image-nav-arrow.is-prev {
      left: 16px;
    }

    .image-nav-arrow.is-next {
      right: 16px;
    }

    .image-modal-content.image-stage-viewport {
      width: 100vw;
      height: 100vh;
      max-width: 100vw;
      max-height: 100vh;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      touch-action: none;
      user-select: none;
    }

    .image-modal-content.image-stage-viewport.is-zoomed {
      cursor: grab;
    }

    .image-modal-content.image-stage-viewport.is-zoomed:active {
      cursor: grabbing;
    }

    .image-modal-content img {
      max-width: 92vw;
      max-height: 86vh;
      object-fit: contain;
      border-radius: 6px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
      transform-origin: center center;
      transition: transform 0.12s ease, opacity 0.12s ease;
      will-change: transform;
    }

    /* Toast Notification Container & Items (Top Staggered) */
    .toast-container {
      position: fixed;
      top: 20px;
      left: 0;
      right: 0;
      z-index: 12000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      max-height: calc(100vh - 40px);
      overflow: visible;
    }

    .toast {
      position: relative;
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      padding: 10px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: var(--shadow-soft), 0 6px 20px rgba(0, 0, 0, 0.12);
      pointer-events: auto;
      cursor: pointer;
      max-width: min(85vw, 560px);
      min-width: 180px;
      text-align: center;
      word-break: break-word;
      line-height: 1.45;
      animation: toastInTop 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: all 0.25s ease;
      user-select: none;
    }

    .toast:hover {
      box-shadow: var(--shadow-soft), 0 8px 24px rgba(0, 0, 0, 0.18);
    }

    .toast.toast-fadeout {
      opacity: 0;
      transform: translateY(-12px) scale(0.95);
      pointer-events: none;
    }

    @keyframes toastInTop {
      from {
        opacity: 0;
        transform: translateY(-18px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .empty-state {
      grid-column: 1 / -1;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: var(--text-muted);
      gap: 12px;
      text-align: center;
      box-sizing: border-box;
    }

    /* Move Dialog Tree Styles - 1:1 with MoveLocalFileDialog.vue */
    .tree-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      border: 1px solid var(--border-light);
      font-size: 12px;
      gap: 8px;
    }

    .selected-target-hint {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .selected-target-hint strong {
      color: var(--text-primary);
    }

    .directory-tree-container {
      height: 260px;
      min-height: 260px;
      max-height: 260px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-app);
      padding: 4px 0;
      display: flex;
      flex-direction: column;
    }

    .directory-tree-container .empty-state {
      flex: 1;
      height: 100%;
      padding: 0 12px;
    }

    .tree-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-primary);
      flex-shrink: 0;
      transition: background 0.15s ease;
      user-select: none;
    }

    .tree-node:hover {
      background: var(--bg-surface-hover);
    }

    .tree-node.active {
      background: var(--accent-light);
      color: var(--accent-color);
      font-weight: 600;
    }

    .tree-node .folder-icon {
      stroke: #f59e0b;
      fill: rgba(245, 158, 11, 0.15);
      flex-shrink: 0;
    }

    .tree-node .node-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Multi-Select & Card Checkboxes */
    .card-select-btn {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 10;
    }

    .card-select-btn .check-icon-svg {
      display: block;
      opacity: 0;
      transform: scale(0.78);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }

    .card-select-btn:hover {
      border-color: var(--text-secondary);
      background: var(--bg-surface-hover);
    }

    .file-card:hover .card-select-btn,
    .file-card.selected .card-select-btn,
    body.is-selecting .card-select-btn {
      opacity: 1;
    }

    .file-card.selected .card-select-btn {
      background: var(--bg-surface);
      border-color: var(--border-color);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .file-card.selected .card-select-btn .check-icon-svg {
      opacity: 1;
      transform: scale(1);
    }

    .file-card.selected {
      border-color: var(--border-color);
      background: var(--bg-surface-active);
    }

    .multi-select-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: var(--shadow-soft);
      padding: 10px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 900;
      animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 92vw;
    }

    @keyframes slideUp {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }

    .multi-select-count {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .multi-select-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
    }

    /* Task Floating Capsule Widget (Compact for Mobile) */
    .task-floating-capsule {
      position: fixed;
      right: 14px;
      bottom: calc(18px + env(safe-area-inset-bottom, 0px));
      z-index: 1050;
      cursor: pointer;
      user-select: none;
      animation: capsuleSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      transition: transform 0.15s ease, opacity 0.15s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .task-floating-capsule:active {
      transform: scale(0.97);
    }

    .capsule-inner {
      height: 34px;
      max-width: 190px;
      padding: 0 8px 0 10px;
      background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      gap: 7px;
      color: var(--text-primary);
    }

    .capsule-progress-ring {
      position: relative;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .capsule-progress-ring .ring-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .capsule-progress-ring .ring-bg {
      fill: none;
      stroke: var(--bg-tertiary);
      stroke-width: 2.5;
    }

    .capsule-progress-ring .ring-bar {
      fill: none;
      stroke: var(--color-accent);
      stroke-width: 2.5;
      stroke-dasharray: 56.548;
      stroke-dashoffset: 56.548;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.15s linear;
    }

    .capsule-progress-ring .ring-text {
      font-size: 8px;
      font-weight: 700;
      font-family: monospace;
      color: var(--text-primary);
    }

    .capsule-info {
      flex: 1;
      min-width: 0;
    }

    .capsule-title {
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      color: var(--text-primary);
    }

    .capsule-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 999px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--color-accent);
      line-height: 1.2;
      flex-shrink: 0;
    }

    .capsule-cancel-btn {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
    }

    .capsule-cancel-btn:hover, .capsule-cancel-btn:active {
      background: color-mix(in srgb, var(--color-error) 15%, transparent);
      color: var(--color-error);
    }

    @keyframes capsuleSlideUp {
      from { transform: translateY(12px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
`;
