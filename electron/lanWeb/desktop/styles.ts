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
      background: var(--bg-surface-active);
      border-color: transparent;
      color: var(--color-accent);
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
      background: var(--bg-surface-active);
      border-color: transparent;
      color: var(--color-accent);
      font-weight: 600;
      box-shadow: none;
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item svg {
      flex-shrink: 0;
      stroke: currentColor;
    }

    body.lan-desktop-mode #resource-tabs .resource-tab-item.active svg {
      stroke: var(--color-accent);
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

    /* Desktop Grid Focus, Drop Target, Marquee & Context Menu */
    body.lan-desktop-mode .file-card.is-focused {
      border-color: var(--border-color);
      box-shadow: none;
    }

    body.lan-desktop-mode .file-card.selected.is-focused {
      border-color: var(--border-color);
      box-shadow: none;
    }

    .is-drop-target {
      border-color: var(--color-accent) !important;
      background: var(--bg-surface-active) !important;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent) !important;
    }

    /* Desktop Details List View */
    body.lan-desktop-mode .file-grid.is-list-view {
      display: flex;
      flex-direction: column;
      gap: 0;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .desktop-list-header,
    .desktop-list-row {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 92px 144px 188px;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      user-select: none;
    }

    .desktop-list-header {
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      position: sticky;
      top: 0;
      z-index: 4;
    }

    .desktop-list-header .is-sortable {
      cursor: pointer;
      transition: color 0.15s ease;
    }

    .desktop-list-header .is-sortable:hover {
      color: var(--text-primary);
    }

    .desktop-list-row {
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
      color: var(--text-primary);
      cursor: pointer;
      transition: background 0.12s ease;
    }

    .desktop-list-row:last-child {
      border-bottom: none;
    }

    .desktop-list-row:hover {
      background: var(--bg-surface-hover);
    }

    .desktop-list-row.selected {
      background: var(--bg-surface-active);
    }

    .desktop-list-row.is-focused {
      box-shadow: inset 2px 0 0 var(--text-tertiary);
    }

    .desktop-list-header .col-check,
    .desktop-list-row .col-check {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .list-check-box {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      color: transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .list-check-box .check-icon-svg {
      display: block;
      opacity: 0;
      transform: scale(0.78);
      transition: opacity 0.15s ease, transform 0.15s ease;
    }

    .list-check-box:hover {
      border-color: var(--text-secondary);
      background: var(--bg-surface-hover);
    }

    .desktop-list-row.selected .list-check-box,
    .list-check-box.is-checked {
      background: var(--bg-surface);
      border-color: var(--border-color);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .desktop-list-row.selected .list-check-box .check-icon-svg,
    .list-check-box.is-checked .check-icon-svg {
      opacity: 1;
      transform: scale(1);
    }

    .desktop-list-row .col-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .desktop-row-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    .list-new-badge {
      font-size: 10px;
      font-weight: 700;
      color: var(--color-success);
      flex-shrink: 0;
    }

    .list-ext-tag {
      font-size: 10px;
      font-weight: 600;
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-light);
      border-radius: 4px;
      padding: 1px 5px;
      flex-shrink: 0;
    }

    .desktop-list-header .col-size,
    .desktop-list-header .col-time,
    .desktop-list-row .col-size,
    .desktop-list-row .col-time {
      font-size: 12px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .desktop-list-header .col-actions {
      text-align: right;
      padding-right: 4px;
    }

    .desktop-list-row .col-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }

    .row-action-btn {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .row-action-btn:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-color);
      color: var(--text-primary);
    }

    .row-action-btn.is-danger:hover {
      background: color-mix(in srgb, var(--color-error) 12%, transparent);
      border-color: color-mix(in srgb, var(--color-error) 35%, transparent);
      color: var(--color-error);
    }

    .desktop-marquee-box {
      position: fixed;
      border: 1px solid var(--color-accent);
      background: color-mix(in srgb, var(--color-accent) 8%, transparent);
      border-radius: 4px;
      pointer-events: none;
      z-index: 960;
    }

    .desktop-context-menu {
      position: fixed;
      min-width: 168px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      box-shadow: var(--shadow-soft), 0 8px 24px rgba(0, 0, 0, 0.12);
      padding: 5px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      z-index: 980;
    }

    .desktop-ctx-item {
      border: none;
      background: transparent;
      color: var(--text-primary);
      font-size: 13px;
      text-align: left;
      padding: 7px 11px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: background 0.12s ease;
    }

    .desktop-ctx-item:hover {
      background: var(--bg-surface-hover);
    }

    .desktop-ctx-item.is-danger {
      color: var(--color-error);
    }

    .desktop-ctx-item.is-danger:hover {
      background: color-mix(in srgb, var(--color-error) 12%, transparent);
    }

    .desktop-ctx-divider {
      height: 1px;
      background: var(--border-light);
      margin: 3px 6px;
    }

    /* Desktop Split-Pane Remote Downloads & Pan Console */
    body.lan-desktop-mode .remote-split-grid {
      display: grid;
      grid-template-columns: 350px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }

    body.lan-desktop-mode .remote-split-grid.is-readonly .remote-list-card,
    body.lan-desktop-mode .remote-split-grid.is-readonly .remote-pan-results-card {
      grid-column: 1 / -1;
    }

    body.lan-desktop-mode .remote-list-card,
    body.lan-desktop-mode .remote-pan-results-card {
      min-width: 0;
    }

    body.lan-desktop-mode .pan-parse-list {
      max-height: calc(100vh - 280px);
    }

    body.lan-desktop-mode .card-actions-btn,
    body.lan-desktop-mode .mobile-sheet-close-btn,
    body.lan-desktop-mode .mobile-sheet-cancel-btn,
    body.lan-desktop-mode .mobile-inline-paste-btn,
    body.lan-desktop-mode .mobile-only-dl-trigger,
    body.lan-desktop-mode .mobile-only-pan-paste {
      display: none !important;
    }
`;
