export const lanWebWorkspaceStyles = `    /* Main Container */
    main {
      flex: 1;
      max-width: 1360px;
      width: 100%;
      margin: 0 auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* Resource Switcher Tabs */
    .resource-tabs-wrap {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .resource-tab-item {
      padding: 6px 14px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .resource-tab-item:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .resource-tab-item.active {
      background: var(--bg-surface);
      border-color: var(--color-accent);
      color: var(--color-accent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent), var(--shadow-sm);
      font-weight: 600;
    }

    .resource-tab-item.active svg {
      stroke: var(--color-accent);
    }

    /* Workspace Toolbar */
    .workspace-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      background: var(--bg-surface);
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
    }

    .toolbar-nav-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .nav-back-btn {
      width: 32px;
      height: 32px;
      padding: 0;
      flex-shrink: 0;
      border-radius: 6px;
      background: var(--border-light);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
    }

    .nav-back-btn:hover:not(:disabled) {
      background: var(--border-color);
      color: var(--color-accent);
    }

    .nav-back-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      pointer-events: none;
    }

    .breadcrumb-container {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      white-space: nowrap;
      background: var(--bg-tertiary);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--border-light);
      font-size: 13px;
      flex: 1;
      min-width: 0;
    }

    .breadcrumb-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .breadcrumb-item:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .breadcrumb-item.active {
      font-weight: 600;
      color: var(--text-primary);
      cursor: default;
    }

    .breadcrumb-sep {
      color: var(--text-muted);
      font-size: 12px;
      flex-shrink: 0;
    }

    .toolbar-tools {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-wrap {
      position: relative;
      width: 190px;
      margin: 0;
      padding: 0;
    }

    .search-wrap .search-btn {
      position: absolute;
      left: 3px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      padding: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--text-muted);
      border-radius: 4px;
      line-height: 1;
    }

    .search-wrap .search-btn:hover {
      color: var(--color-accent);
    }

    .search-wrap .clear-search-btn {
      position: absolute;
      right: 5px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--text-muted);
      border-radius: 4px;
      line-height: 1;
    }

    .search-wrap .clear-search-btn:hover {
      color: var(--text-primary);
    }

    .search-input {
      width: 100%;
      padding-left: 24px !important;
      padding-right: 22px !important;
      font-size: 12px;
      height: 32px;
    }

    .search-input[type="search"]::-webkit-search-decoration,
    .search-input[type="search"]::-webkit-search-cancel-button,
    .search-input[type="search"]::-webkit-search-results-button,
    .search-input[type="search"]::-webkit-search-results-decoration {
      display: none;
      -webkit-appearance: none;
    }

    .sort-select {
      height: 32px;
      background: var(--bg-app);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0 10px;
      font-size: 12px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }

    .sort-select:focus {
      border-color: var(--color-accent);
    }
`;
