export const lanMobileStyles = `
    body.lan-mobile-mode #app {
      min-height: 100vh;
      padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
    }

    body.lan-mobile-mode header {
      height: 50px;
      padding: 0 12px;
      position: sticky;
      top: 0;
      z-index: 60;
    }

    body.lan-mobile-mode main.mobile-main-content {
      padding: 10px 12px 24px;
      flex: 1;
    }

    body.lan-mobile-mode #resource-tabs.is-single-hidden {
      display: none !important;
    }

    body.lan-mobile-mode .mobile-compact-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 6px 8px;
      margin-bottom: 10px;
    }

    .mobile-toolbar-row {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
    }

    .mobile-toolbar-row .nav-back-btn {
      width: 30px;
      height: 30px;
    }

    .mobile-toolbar-row .breadcrumb-container {
      flex: 1;
      min-width: 0;
      padding: 4px 8px;
      font-size: 12.5px;
    }

    .mobile-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .mobile-toolbar-actions .v-btn-icon.active {
      background: var(--bg-tertiary);
      color: var(--color-accent);
    }

    .mobile-search-drawer {
      display: none;
      padding-top: 8px;
      margin-top: 6px;
      border-top: 1px solid var(--border-light);
    }

    .mobile-search-drawer.is-open {
      display: block;
    }

    .mobile-search-drawer .search-wrap {
      width: 100% !important;
    }

    /* Mobile List View + Left Swipe Actions */
    body.lan-mobile-mode .file-grid.is-list-view {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mobile-list-row-wrap {
      position: relative;
      overflow: hidden;
      border-radius: 10px;
      border: 1px solid var(--border-light);
      background: var(--bg-tertiary);
      box-shadow: var(--shadow-sm);
    }

    .mobile-list-row-wrap.selected {
      border-color: var(--border-color);
      background: var(--bg-surface-active);
    }

    .mobile-list-row-wrap.selected .mobile-list-row {
      background: var(--bg-surface-active);
    }

    .mobile-swipe-actions {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: stretch;
      z-index: 1;
    }

    .mobile-swipe-btn {
      min-width: 64px;
      padding: 0 14px;
      border: none;
      border-left: 1px solid var(--border-color);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      background: var(--bg-surface-active);
      color: var(--text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mobile-swipe-btn.is-edit,
    .mobile-swipe-btn.is-download {
      background: var(--bg-tertiary);
      color: var(--color-accent);
    }

    .mobile-swipe-btn.is-move {
      background: var(--bg-surface-active);
      color: var(--text-primary);
    }

    .mobile-swipe-btn.is-delete {
      background: color-mix(in srgb, var(--color-error) 14%, var(--bg-surface));
      color: var(--color-error);
      border-left-color: color-mix(in srgb, var(--color-error) 24%, transparent);
    }

    .mobile-list-row {
      position: relative;
      z-index: 2;
      min-height: 58px;
      padding: 8px 4px 8px 10px;
      background: var(--bg-surface);
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      touch-action: pan-y;
      -webkit-user-select: none;
      user-select: none;
    }

    .mobile-row-check {
      width: 0;
      height: 22px;
      opacity: 0;
      overflow: hidden;
      margin-right: -10px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-app);
      color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
      transition: all 0.18s ease;
    }

    .mobile-row-check .check-icon-svg {
      display: block;
      opacity: 0;
      transform: scale(0.78);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }

    body.lan-mobile-mode.is-selecting .mobile-row-check,
    .mobile-list-row-wrap.selected .mobile-row-check {
      width: 22px;
      opacity: 1;
      margin-right: 0;
    }

    .mobile-list-row-wrap.selected .mobile-row-check {
      background: var(--bg-surface);
      border-color: var(--border-color);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .mobile-list-row-wrap.selected .mobile-row-check .check-icon-svg {
      opacity: 1;
      transform: scale(1);
    }

    .mobile-row-icon {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .mobile-row-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .mobile-row-title {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-primary);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-all;
    }

    .mobile-row-sub {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-row-new {
      font-size: 10px;
      font-weight: 700;
      color: var(--color-success);
      flex-shrink: 0;
    }

    .mobile-row-more-btn {
      width: 40px;
      height: 44px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      flex-shrink: 0;
      cursor: pointer;
    }

    .mobile-row-more-btn:active {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    /* Mobile Bottom Sheet Unification */
    body.lan-mobile-mode #action-modal.modal-overlay,
    body.lan-mobile-mode #video-merge-modal.modal-overlay,
    body.lan-mobile-mode #video-compress-modal.modal-overlay,
    body.lan-mobile-mode #custom-dialog-modal.modal-overlay {
      align-items: flex-end;
      padding: 0;
    }

    body.lan-mobile-mode #action-modal .modal-content,
    body.lan-mobile-mode #video-merge-modal .modal-content,
    body.lan-mobile-mode #video-compress-modal .modal-content,
    body.lan-mobile-mode #custom-dialog-modal .modal-content {
      width: 100% !important;
      max-width: 100% !important;
      border-radius: 16px 16px 0 0;
      border-bottom: none;
      max-height: 86dvh;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      animation: mobileSheetUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }

    body.lan-mobile-mode #action-modal .modal-header,
    body.lan-mobile-mode #video-merge-modal .modal-header,
    body.lan-mobile-mode #video-compress-modal .modal-header,
    body.lan-mobile-mode #custom-dialog-modal .modal-header {
      position: relative;
      padding-top: 18px;
    }

    body.lan-mobile-mode #action-modal .modal-header::before,
    body.lan-mobile-mode #video-merge-modal .modal-header::before,
    body.lan-mobile-mode #video-compress-modal .modal-header::before,
    body.lan-mobile-mode #custom-dialog-modal .modal-header::before {
      content: '';
      position: absolute;
      top: 7px;
      left: 50%;
      transform: translateX(-50%);
      width: 36px;
      height: 4px;
      border-radius: 999px;
      background: var(--border-color);
    }

    body.lan-mobile-mode #action-modal .modal-body,
    body.lan-mobile-mode #video-merge-modal .modal-body,
    body.lan-mobile-mode #video-compress-modal .modal-body {
      max-height: 62dvh;
      overflow-y: auto;
    }

    .mobile-sheet-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .mobile-sheet-option {
      width: 100%;
      padding: 11px 14px;
      border-radius: 8px;
      border: 1px solid var(--border-light);
      background: var(--bg-app);
      color: var(--text-primary);
      font-size: 13.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
    }

    .mobile-sheet-option.active {
      border-color: var(--color-accent);
      background: var(--bg-surface);
      font-weight: 600;
    }

    .mobile-sheet-check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      font-weight: 700;
    }

    @keyframes mobileSheetUp {
      from { transform: translateY(32px); opacity: 0.7; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Mobile Full-Width Multi-Select Bottom Bar */
    body.lan-mobile-mode #multi-select-bar {
      display: none !important;
    }

    body.lan-mobile-mode.is-selecting .mobile-bottom-nav,
    body.lan-mobile-mode.is-selecting .task-floating-capsule {
      display: none !important;
    }

    /* Mobile Fullscreen Black Cinema Video Preview & Image Lightbox */
    body.lan-mobile-mode #video-modal.video-preview-overlay {
      background: #000000;
      padding: 0;
    }

    body.lan-mobile-mode #video-modal .player-modal-content {
      width: 100%;
      height: 100dvh;
      max-width: 100%;
      border: none;
      border-radius: 0;
      background: #000000;
    }

    body.lan-mobile-mode #video-modal .player-preview-header {
      background: rgba(18, 18, 20, 0.9);
      color: #ffffff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: max(10px, env(safe-area-inset-top, 0px));
    }

    body.lan-mobile-mode #video-modal .player-preview-actions .v-btn-icon {
      color: #ffffff;
    }

    body.lan-mobile-mode #video-modal .player-video-wrap {
      flex: 1;
      aspect-ratio: auto;
      touch-action: none;
    }

    body.lan-mobile-mode .image-lightbox-overlay {
      background: #000000 !important;
    }

    body.lan-mobile-mode .image-nav-arrow {
      display: none !important;
    }

    body.lan-mobile-mode .image-modal-content.image-stage-viewport {
      width: 100vw;
      height: 100dvh;
    }

    body.lan-mobile-mode .image-modal-content img {
      max-width: 100vw;
      max-height: 100dvh;
      border-radius: 0;
      box-shadow: none;
    }

    .mobile-select-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: calc(58px + env(safe-area-inset-bottom, 0px));
      padding: 0 8px env(safe-area-inset-bottom, 0px);
      background: var(--bg-surface);
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 6px;
      z-index: 95;
      box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.08);
    }

    .mobile-select-action-btn {
      flex: 1 1 0%;
      min-width: 0;
      height: 40px;
      border: 1px solid var(--border-color);
      background: var(--bg-app);
      color: var(--text-primary);
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      white-space: nowrap;
      padding: 0 4px;
    }

    .mobile-select-action-btn.is-danger {
      color: var(--color-error);
      background: color-mix(in srgb, var(--color-error) 12%, transparent);
      border-color: color-mix(in srgb, var(--color-error) 25%, transparent);
    }

    /* Mobile Queue-First Remote Downloads & Bottom Sheet + Sticky Pan Actions */
    body.lan-mobile-mode .remote-dl-form-card {
      display: none !important;
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      align-items: flex-end;
      justify-content: center;
      padding: 0;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }

    body.lan-mobile-mode .remote-dl-form-card.is-sheet-open {
      display: flex !important;
    }

    body.lan-mobile-mode .remote-dl-form-card .remote-sheet-surface {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-color);
      border-radius: 16px 16px 0 0;
      padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
      animation: mobileSheetUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }

    body.lan-mobile-mode .mobile-only-dl-trigger {
      height: 30px;
      padding: 0 10px;
      font-size: 12px;
    }

    body.lan-mobile-mode .mobile-inline-paste-btn {
      height: 24px;
      padding: 0 8px;
      font-size: 11.5px;
    }

    body.lan-mobile-mode .mobile-only-pan-paste {
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
    }

    body.lan-mobile-mode .pan-results-footer {
      position: sticky;
      bottom: calc(64px + env(safe-area-inset-bottom, 0px));
      background: var(--bg-surface);
      padding-top: 10px;
      border-top: 1px solid var(--border-light);
      z-index: 5;
    }

    body.lan-mobile-mode .remote-form-grid {
      grid-template-columns: 1fr;
    }

    body.lan-mobile-mode .task-floating-capsule {
      bottom: calc(74px + env(safe-area-inset-bottom, 0px));
    }

    body.lan-mobile-mode .upload-progress-float {
      bottom: calc(74px + env(safe-area-inset-bottom, 0px));
      left: 12px;
      right: 12px;
      width: auto;
    }

    body.lan-mobile-mode .mobile-bottom-nav ~ * .file-card .card-actions-btn,
    body.lan-mobile-mode .card-actions-btn {
      width: 28px;
      height: 28px;
      opacity: 0.9;
    }

    .mobile-bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: calc(58px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: var(--bg-surface);
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: stretch;
      z-index: 80;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.04);
    }

    .mobile-tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      position: relative;
      -webkit-tap-highlight-color: transparent;
    }

    .mobile-tab-btn.active {
      color: var(--color-accent);
      font-weight: 600;
    }

    .mobile-tab-btn .nav-badge-count {
      position: absolute;
      top: 5px;
      right: calc(50% - 24px);
      margin-left: 0;
      min-width: 16px;
      height: 16px;
      font-size: 10px;
    }
`;
