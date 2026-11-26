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

    body.lan-mobile-mode .remote-form-grid {
      grid-template-columns: 1fr;
    }

    body.lan-mobile-mode .workspace-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      padding: 8px 10px;
      margin-bottom: 10px;
    }

    body.lan-mobile-mode .toolbar-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    body.lan-mobile-mode .search-wrap {
      flex: 1 1 100%;
      width: 100%;
    }

    body.lan-mobile-mode .sort-select {
      flex: 1;
      min-width: 120px;
    }

    body.lan-mobile-mode .multi-select-bar {
      bottom: calc(70px + env(safe-area-inset-bottom, 0px));
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
      color: var(--text-primary);
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
