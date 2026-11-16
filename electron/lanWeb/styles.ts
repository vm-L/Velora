export const lanWebStyles = `/* Pristine Elegance OKLCH Theme Variables - 1:1 with Velora App */
    :root {
      --bg-app: oklch(98.5% 0.005 90);
      --bg-surface: oklch(100% 0 0);
      --bg-surface-hover: oklch(97.5% 0.008 90);
      --bg-surface-active: oklch(96.5% 0.01 90);
      --bg-tertiary: oklch(96% 0.006 90);

      --text-primary: oklch(38% 0.01 90);
      --text-secondary: oklch(62% 0.01 90);
      --text-tertiary: oklch(76% 0.01 90);
      --text-muted: oklch(70% 0.01 90);

      --color-accent: oklch(30% 0.01 90);
      --color-accent-hover: oklch(20% 0.01 90);
      --color-accent-text: #ffffff;
      --accent-color: var(--color-accent);
      --accent-hover: var(--color-accent-hover);
      --accent-light: oklch(92% 0.01 90);

      --border-color: oklch(93% 0.01 90);
      --border-light: oklch(96% 0.006 90);

      --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.02);
      --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.02);

      --color-success: oklch(68% 0.16 160);
      --color-error: oklch(62% 0.22 25);
      --color-warning: oklch(74% 0.17 70);
    }

    [data-theme='dark'] {
      --bg-app: oklch(15% 0.005 90);
      --bg-surface: oklch(18% 0.005 90);
      --bg-surface-hover: oklch(22% 0.005 90);
      --bg-surface-active: oklch(26% 0.005 90);
      --bg-tertiary: oklch(22% 0.005 90);

      --text-primary: oklch(95% 0.005 90);
      --text-secondary: oklch(75% 0.005 90);
      --text-tertiary: oklch(60% 0.005 90);
      --text-muted: oklch(50% 0.005 90);

      --color-accent: oklch(90% 0.01 90);
      --color-accent-hover: oklch(98.5% 0.01 90);
      --color-accent-text: oklch(15% 0.005 90);
      --accent-color: var(--color-accent);
      --accent-hover: var(--color-accent-hover);
      --accent-light: oklch(26% 0.005 90);

      --border-color: oklch(28% 0.005 90);
      --border-light: oklch(24% 0.005 90);

      --shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);
      --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    ::view-transition-old(root),
    ::view-transition-new(root) {
      animation: none;
      mix-blend-mode: normal;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      scrollbar-width: none;
    }

    ::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }

    body {
      font-family: "Segoe UI", Arial, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      background: var(--bg-app);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    input, textarea {
      user-select: text;
      -webkit-user-select: text;
      font-family: inherit;
    }

    /* Header Bar */
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      box-shadow: var(--shadow-sm);
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
      color: var(--text-primary);
      text-decoration: none;
      flex-shrink: 0;
    }

    .brand-logo svg {
      color: var(--color-accent);
    }

    .brand-logo-img {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      object-fit: contain;
      box-shadow: var(--shadow-sm);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* VButton Component Style - 1:1 with VButton.vue */
    .v-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 14px;
      height: 32px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
      user-select: none;
      flex-shrink: 0;
      white-space: nowrap;
      text-decoration: none;
    }

    .v-btn-primary {
      background: linear-gradient(180deg, var(--bg-surface) 0%, var(--border-light) 100%);
      color: var(--color-accent);
      border-color: var(--border-color);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6);
      font-weight: 600;
    }

    .v-btn-primary:hover {
      background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-surface-hover) 100%);
      color: var(--color-accent-hover);
      border-color: var(--border-color);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.75);
    }

    .v-btn-primary:active {
      transform: translateY(1px);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    [data-theme='dark'] .v-btn-primary {
      background: linear-gradient(180deg, var(--border-color) 0%, var(--border-light) 100%);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    [data-theme='dark'] .v-btn-primary:hover {
      background: linear-gradient(180deg, var(--bg-surface-active) 0%, var(--border-color) 100%);
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }

    .v-btn-secondary {
      background: var(--border-light);
      color: var(--text-primary);
      border-color: var(--border-color);
    }

    .v-btn-secondary:hover {
      background: var(--border-color);
    }

    .v-btn-danger-soft {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-error);
      border-color: transparent;
    }

    .v-btn-danger-soft:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    .v-btn-icon {
      padding: 0;
      width: 32px;
      height: 32px;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 6px;
    }

    .v-btn-icon:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }

    .v-input {
      padding: 7px 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      background: var(--bg-app);
      color: var(--text-primary);
      box-sizing: border-box;
      transition: border-color 0.2s;
    }

    .v-input:focus {
      border-color: var(--accent-color);
    }

    /* Main Container */
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
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: var(--color-accent-text);
      box-shadow: var(--shadow-sm);
      font-weight: 600;
    }

    .resource-tab-item.active svg {
      stroke: var(--color-accent-text);
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

    /* File Grid Layout - 1:1 with LocalWorkspace.vue */
    .file-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 14px;
    }

    @media (max-width: 640px) {
      .workspace-toolbar {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 10px 10px;
      }

      .toolbar-nav-group {
        width: 100%;
      }

      .toolbar-tools {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
      }

      .search-wrap {
        flex: 1;
        min-width: 0;
        width: auto !important;
      }

      .sort-select {
        flex-shrink: 0;
        max-width: 110px;
        padding: 0 4px;
        font-size: 11px;
      }

      .toolbar-tools .btn-text {
        display: none;
      }

      .toolbar-tools .v-btn {
        padding: 0 8px;
        min-width: 32px;
        height: 32px;
      }

      .file-grid {
        grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
        gap: 12px;
      }

      .file-card {
        padding: 14px 10px;
      }
    }

    .file-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
      text-align: center;
      box-shadow: var(--shadow-sm);
    }

    .file-card:hover {
      background: var(--bg-surface-hover);
      border-color: var(--border-color);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
    }

    .file-card:active {
      transform: scale(0.98);
    }

    .card-icon-wrap {
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      margin-bottom: 8px;
    }

    .file-svg {
      transition: transform 0.15s ease;
    }

    .folder-color {
      stroke: #f59e0b;
      fill: rgba(245, 158, 11, 0.15);
    }

    .video-color {
      stroke: #ef4444;
      fill: rgba(239, 68, 68, 0.12);
    }

    .audio-color {
      stroke: #8b5cf6;
      fill: rgba(139, 92, 246, 0.12);
    }

    .image-color {
      stroke: #10b981;
      fill: rgba(16, 185, 129, 0.12);
    }

    .code-color {
      stroke: #3b82f6;
    }

    .doc-color {
      stroke: var(--text-secondary);
    }

    .ext-badge {
      position: absolute;
      bottom: 0;
      right: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      letter-spacing: 0.5px;
    }

    .recent-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      color: var(--color-success);
      letter-spacing: 0.5px;
      user-select: none;
      pointer-events: none;
      white-space: nowrap;
      z-index: 2;
    }

    .file-card.has-actions .recent-badge {
      right: 28px;
    }

    .card-info {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
    }

    .card-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: break-all;
      white-space: normal;
      line-height: 1.35;
      max-height: 2.7em;
    }

    @media (max-width: 640px) {
      .card-name {
        -webkit-line-clamp: 3;
        max-height: 4.1em;
      }
      .video-edit-modal-content {
        height: 92vh;
        max-height: 94vh;
        border-radius: 10px;
      }
      .trimmer-controls {
        padding: 12px 14px;
        gap: 10px;
      }
    }

    .card-size {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1.2;
    }

    .card-time {
      font-size: 10px;
      color: var(--text-muted);
      line-height: 1.2;
    }

    .card-actions-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      border: 1px solid var(--border-light);
      border-radius: 4px;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .file-card:hover .card-actions-btn {
      opacity: 1;
    }

    /* Modal Dialogs - 1:1 with Velora Modal */
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
      font-weight: 600;
      font-size: 15px;
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
      max-width: 900px;
      width: 100%;
      background: #000000;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-soft);
    }

    .player-video-wrap {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
    }

    .player-video-wrap video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Image Modal */
    .image-modal-content {
      max-width: 90vw;
      max-height: 90vh;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .image-modal-content img {
      max-width: 100%;
      max-height: 85vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
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
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-app);
      padding: 4px 0;
      display: flex;
      flex-direction: column;
    }

    .tree-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-primary);
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

    .file-card:hover .card-select-btn,
    .file-card.selected .card-select-btn,
    body.is-selecting .card-select-btn {
      opacity: 1;
    }

    .file-card.selected .card-select-btn {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: var(--color-accent-text);
    }

    .file-card.selected {
      border-color: var(--color-accent);
      background: var(--bg-surface-hover);
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
      background: rgba(var(--bg-surface-rgb, 255, 255, 255), 0.92);
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
      padding: 1px 4px;
      border-radius: 999px;
      background: var(--color-accent);
      color: #fff;
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
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    @keyframes capsuleSlideUp {
      from { transform: translateY(12px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Video Trimmer Modal */
    .video-edit-modal-content {
      max-width: 900px;
      width: 100%;
      height: 88vh;
      max-height: 94vh;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--shadow-soft);
      display: flex;
      flex-direction: column;
    }

    .video-edit-modal-content .modal-header {
      flex-shrink: 0;
    }

    .trimmer-video-wrap {
      width: 100%;
      max-height: 25vh;
      min-height: 120px;
      background: #000;
      position: relative;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .trimmer-video-wrap video {
      width: 100%;
      height: 100%;
      max-height: 25vh;
      object-fit: contain;
      cursor: pointer;
    }

    .trimmer-controls {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--bg-app);
      border-top: 1px solid var(--border-light);
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .trimmer-controls > * {
      flex-shrink: 0;
    }

    .video-edit-modal-content .modal-footer {
      flex-shrink: 0;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-light);
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .time-steppers {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      width: 100%;
      flex-shrink: 0;
    }

    .time-steppers .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      user-select: none;
      -webkit-user-select: none;
    }

    .trimmer-action-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      width: 100%;
      flex-shrink: 0;
    }

    .trimmer-action-row .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      white-space: nowrap;
      user-select: none;
      -webkit-user-select: none;
    }

    .trimmer-action-row .v-btn.active {
      background: var(--color-accent);
      color: var(--color-accent-text);
      border-color: var(--color-accent);
    }

    .trim-points-row {
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 6px;
      width: 100%;
      flex-shrink: 0;
    }

    .trim-points-row .v-btn {
      padding: 6px 4px;
      font-size: 12px;
      min-width: 0;
      justify-content: center;
      white-space: nowrap;
    }

    .time-display {
      font-family: monospace;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-surface);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      width: 100%;
      min-height: 38px;
      flex-shrink: 0;
      text-align: center;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      transition: border-color 0.15s;
    }

    .time-display:active {
      border-color: var(--color-accent);
    }

    .time-display-progress {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      width: 0%;
      background: color-mix(in srgb, var(--color-accent) 18%, transparent);
      pointer-events: none;
      z-index: 0;
      transition: width 0.05s ease-out;
    }

    .time-display-text {
      position: relative;
      z-index: 1;
      pointer-events: none;
    }

    .segment-chips-container {
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      align-items: center;
      gap: 8px;
      min-height: 50px;
      max-height: 120px;
      overflow-y: auto;
      padding: 8px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      box-sizing: border-box;
    }

    .segment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s;
    }

    .segment-chip:hover {
      border-color: var(--color-accent);
    }

    .segment-chip.active {
      border-color: var(--color-accent);
      background: var(--bg-hover);
      box-shadow: 0 0 0 1px var(--color-accent);
      font-weight: 600;
    }

    .segment-chip.invalid {
      border-style: dashed;
      color: var(--text-muted);
    }

    .segment-chip .chip-remove {
      color: var(--text-muted);
      cursor: pointer;
      font-weight: bold;
      padding: 0 2px;
    }

    .segment-chip .chip-remove:hover {
      color: var(--color-error);
    }

    /* Merge Modal */
    .merge-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 260px;
      overflow-y: auto;
    }

    .merge-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 13px;
    }

    .merge-item-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }

    .merge-item-btns {
      display: flex;
      gap: 4px;
    }

    /* Compress Presets */
    .compress-presets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .preset-btn {
      padding: 8px 4px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-app);
      color: var(--text-primary);
      cursor: pointer;
      text-align: center;
      font-size: 12px;
      transition: all 0.15s;
      outline: none;
    }

    .preset-btn.active {
      border-color: var(--color-accent);
      background: var(--accent-light);
      color: var(--color-accent);
      font-weight: 600;
    }

    /* Segmented Control */
    .segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--bg-app);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
      gap: 3px;
      user-select: none;
      -webkit-user-select: none;
      box-sizing: border-box;
      width: 100%;
    }

    .segmented-option {
      padding: 6px 12px;
      text-align: center;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
    }

    .segmented-option:hover {
      color: var(--text-primary);
    }

    .segmented-option.active {
      background: var(--bg-surface);
      color: var(--text-primary);
      font-weight: 600;
      border-color: var(--border-light);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    [data-theme='dark'] .segmented-option.active {
      background: var(--bg-hover);
      border-color: var(--border-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    }

    /* Progress Modal */
    .progress-bar-bg {
      width: 100%;
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
      margin: 10px 0;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--color-accent) 0%, #3b82f6 100%);
      width: 0%;
      transition: width 0.25s ease;
      border-radius: 4px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }

    /* Touch & Mobile UX Enhancements */
    .file-card {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    }

    .file-card.pressing {
      transform: scale(0.97);
      opacity: 0.9;
    }

    .grid-sentinel {
      width: 100%;
      height: 36px;
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--text-tertiary);
      pointer-events: none;
    }

    .network-indicator {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      background: var(--bg-surface-hover);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      transition: all 0.25s ease;
    }

    .network-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-success);
      flex-shrink: 0;
      transition: background-color 0.25s ease;
    }

    .network-indicator.disconnected {
      color: var(--color-error);
      border-color: rgba(239, 68, 68, 0.25);
      background: rgba(239, 68, 68, 0.08);
    }

    .network-indicator.disconnected .network-dot {
      background: var(--color-error);
      animation: net-blink 1.2s infinite;
    }

    @keyframes net-blink {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.85); }
    }

    .image-modal-content img.swipe-left {
      transform: translateX(-40px);
      opacity: 0;
    }

    .image-modal-content img.swipe-right {
      transform: translateX(40px);
      opacity: 0;
    }`;
