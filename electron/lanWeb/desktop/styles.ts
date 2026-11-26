export const lanDesktopStyles = `
    body.lan-desktop-mode #app {
      height: 100vh;
      overflow: hidden;
    }

    body.lan-desktop-mode header {
      height: 54px;
      padding: 0 20px;
      flex-shrink: 0;
    }

    .desktop-shell {
      flex: 1;
      display: flex;
      min-height: 0;
      overflow: hidden;
    }

    .desktop-sidebar {
      width: 224px;
      flex-shrink: 0;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      padding: 14px 10px;
      gap: 4px;
      overflow-y: auto;
    }

    .desktop-nav-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .desktop-nav-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .desktop-nav-btn:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .desktop-nav-btn.active {
      background: var(--bg-tertiary);
      border-color: var(--border-color);
      color: var(--text-primary);
      font-weight: 600;
    }

    .desktop-nav-btn svg {
      flex-shrink: 0;
    }

    .desktop-sidebar-divider {
      height: 1px;
      background: var(--border-color);
      margin: 10px 6px 8px;
    }

    .desktop-sidebar-label {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--text-muted);
      padding: 2px 12px 4px;
      letter-spacing: 0.3px;
    }

    body.lan-desktop-mode #resource-tabs.resource-tabs-wrap {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 0;
      margin: 0;
      overflow: visible;
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item {
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      box-shadow: none;
      justify-content: flex-start;
      gap: 9px;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item.active {
      background: var(--bg-tertiary);
      border-color: var(--border-color);
      color: var(--text-primary);
      font-weight: 600;
      box-shadow: none;
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item svg {
      flex-shrink: 0;
      stroke: currentColor;
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item.active svg {
      stroke: var(--text-primary);
    }

    .desktop-main-content {
      flex: 1;
      min-width: 0;
      max-width: none;
      margin: 0;
      overflow-y: auto;
      padding: 18px 24px 84px;
      display: flex;
      flex-direction: column;
    }

    body.lan-desktop-mode .workspace-toolbar {
      margin-bottom: 14px;
    }
`;
