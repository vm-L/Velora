export const lanWebRemoteStyles = `
    /* View Switch & Panels */
    .lan-panel-section {
      display: none;
      flex-direction: column;
      gap: 16px;
    }
    .lan-panel-section.is-active {
      display: flex;
    }

    .panel-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--shadow-sm);
    }

    .panel-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .panel-card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .panel-readonly-banner {
      padding: 10px 14px;
      border-radius: 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 12.5px;
    }

    .remote-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .remote-form-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .remote-form-field.full-span {
      grid-column: 1 / -1;
    }

    .remote-form-field label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .remote-form-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .remote-split-grid {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .remote-sheet-surface {
      display: contents;
    }

    .remote-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .remote-filter-tabs {
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    }

    .remote-filter-tabs .segmented-option {
      font-size: 12px;
      padding: 5px 4px;
    }

    .pan-footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Remote Download List */
    .remote-dl-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .remote-dl-item {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .remote-dl-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .remote-dl-name {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .remote-dl-status {
      font-size: 11.5px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .remote-dl-status.is-active {
      color: var(--text-primary);
      background: var(--accent-light);
    }

    .remote-dl-status.is-done {
      color: var(--color-success);
      background: color-mix(in srgb, var(--color-success) 14%, transparent);
    }

    .remote-dl-status.is-error {
      color: var(--color-error);
      background: color-mix(in srgb, var(--color-error) 12%, transparent);
    }

    .remote-dl-progress-track {
      width: 100%;
      height: 6px;
      background: var(--bg-tertiary);
      border-radius: 999px;
      overflow: hidden;
    }

    .remote-dl-progress-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: 999px;
      transition: width 0.25s ease;
    }

    .remote-dl-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .remote-dl-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Pan Parse List */
    .pan-parse-list {
      display: flex;
      flex-direction: column;
      max-height: 360px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-app);
    }

    .pan-parse-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
      cursor: pointer;
    }

    .pan-parse-row:last-child {
      border-bottom: none;
    }

    .pan-parse-row:hover {
      background: var(--bg-surface-hover);
    }

    .pan-parse-row input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      outline: none;
      background: var(--bg-surface);
      cursor: pointer;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      flex-shrink: 0;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .pan-parse-row input[type="checkbox"]:hover {
      border-color: var(--text-secondary);
      background: var(--bg-surface-hover);
    }

    .pan-parse-row input[type="checkbox"]:checked {
      background: var(--bg-surface);
      border-color: var(--border-color);
    }

    .pan-parse-row input[type="checkbox"]:checked::after {
      content: "";
      width: 4px;
      height: 8px;
      border: solid var(--color-accent);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg) translate(-0.5px, -1px);
      display: block;
    }

    .pan-parse-row-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-primary);
    }

    .pan-parse-row-size {
      font-size: 12px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .pan-folder-picker-list {
      display: flex;
      flex-direction: column;
      height: 260px;
      min-height: 260px;
      max-height: 260px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-app);
    }

    .pan-folder-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
      flex-shrink: 0;
      cursor: pointer;
    }

    .pan-folder-row:hover {
      background: var(--bg-surface-hover);
    }

    /* Floating Upload Progress */
    .upload-progress-float {
      position: fixed;
      right: 20px;
      bottom: 84px;
      width: 300px;
      max-width: calc(100vw - 32px);
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 14px;
      box-shadow: var(--shadow-soft);
      z-index: 900;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .upload-progress-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .upload-progress-name {
      font-size: 12px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-badge-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--bg-tertiary);
      color: var(--color-accent);
      border: 1px solid var(--border-color);
      font-size: 11px;
      font-weight: 600;
      margin-left: auto;
    }

    .desktop-drop-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.12);
      border: 3px dashed var(--color-accent);
      z-index: 1200;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .desktop-drop-overlay.is-visible {
      display: flex;
    }

    .desktop-drop-card {
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      padding: 18px 28px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      box-shadow: var(--shadow-soft);
    }
`;
