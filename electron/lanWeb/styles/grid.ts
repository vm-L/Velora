export const lanWebGridStyles = `    /* File Grid Layout - 1:1 with LocalWorkspace.vue */
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
`;
