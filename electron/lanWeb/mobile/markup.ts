import {
  lanWebDownloadsPanelMarkup,
  lanWebPanPanelMarkup,
  lanWebSharedModalsMarkup
} from '../shared/modalsMarkup';
import { lanMobileVideoEditMarkup } from './videoEditMarkup';

export const lanMobileMarkup = `<div id="app">
    <!-- Mobile Top Header -->
    <header>
      <a href="/m" class="brand-logo">
        <img src="/icon.png" class="brand-logo-img" alt="Velora" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='block';">
        <svg class="brand-logo-svg" style="display:none;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span>Velora</span>
      </a>

      <div class="header-actions">
        <button class="v-btn v-btn-icon" onclick="switchLanView('desktop')" title="切换桌面版">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </button>
        <button id="theme-btn" class="v-btn v-btn-icon" title="切换主题">
          <svg id="theme-icon-light" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg id="theme-icon-dark" style="display:none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </button>
        <button id="logout-btn" class="v-btn v-btn-icon" style="display:none;" title="退出登录">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </header>

    <main class="mobile-main-content">
      <section class="lan-panel-section is-active" data-panel="files" id="panel-files">
        <!-- Resource Switcher Pills (auto-hidden on mobile when <= 1 resource) -->
        <div id="resource-tabs" class="resource-tabs-wrap"></div>

        <!-- Mobile Compact Single-Row Toolbar + Collapsible Search Drawer -->
        <div class="workspace-toolbar mobile-compact-toolbar">
          <div class="mobile-toolbar-row">
            <button id="nav-back-btn" class="v-btn v-btn-icon nav-back-btn" title="返回上一级" disabled onclick="navigateUp()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div id="breadcrumbs" class="breadcrumb-container"></div>
            <div class="mobile-toolbar-actions">
              <button id="mobile-search-toggle-btn" class="v-btn v-btn-icon" type="button" onclick="toggleMobileSearchDrawer()" title="搜索文件">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
              <button id="view-mode-btn" class="v-btn v-btn-icon" type="button" onclick="toggleViewMode()" title="切换网格视图">
                <svg id="view-icon-list" style="display:none;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                <svg id="view-icon-grid" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </button>
              <button id="mobile-sort-btn" class="v-btn v-btn-icon" type="button" onclick="openMobileSortSheet()" title="排序方式">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M6 12h12"></path>
                  <path d="M10 18h4"></path>
                </svg>
              </button>
              <button id="mobile-tools-more-btn" class="v-btn v-btn-icon" type="button" onclick="openMobileToolsSheet()" title="更多操作">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>

          <div id="mobile-search-drawer" class="mobile-search-drawer">
            <form id="search-form" class="search-wrap" action="javascript:void(0);" onsubmit="return false;">
              <button id="search-btn" class="search-btn" title="点击搜索" type="button">
                <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </button>
              <input type="search" id="search-input" class="v-input search-input" placeholder="搜索当前目录文件" enterkeyhint="search" autocomplete="off" spellcheck="false">
              <button id="clear-search-btn" class="clear-search-btn" title="清空搜索" type="button" style="display:none;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </form>
            <select id="sort-select" style="display:none;" aria-hidden="true">
              <option value="mtime-desc">修改时间 ↓</option>
              <option value="mtime-asc">修改时间 ↑</option>
              <option value="name-asc">名称 A-Z</option>
              <option value="name-desc">名称 Z-A</option>
              <option value="size-desc">大小 ↓</option>
              <option value="size-asc">大小 ↑</option>
            </select>
          </div>
        </div>

        <!-- File Grid -->
        <div id="file-grid" class="file-grid"></div>
      </section>

      ${lanWebDownloadsPanelMarkup}
      ${lanWebPanPanelMarkup}
    </main>

    <!-- Mobile Bottom Tab Bar -->
    <nav class="mobile-bottom-nav" aria-label="主导航">
      <button class="mobile-tab-btn active" data-nav-view="files" onclick="switchMainView('files')">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>文件</span>
      </button>
      <button class="mobile-tab-btn" data-nav-view="downloads" onclick="switchMainView('downloads')">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>下载</span>
        <span class="nav-badge-count dl-active-badge" style="display:none;">0</span>
      </button>
      <button class="mobile-tab-btn" data-nav-view="pan" onclick="switchMainView('pan')">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
        </svg>
        <span>解析</span>
      </button>
    </nav>

    <!-- Mobile Full-Width Multi-Select Bottom Bar (replaces bottom nav when selecting) -->
    <div id="mobile-select-bar" class="mobile-select-bar" style="display:none;" aria-label="批量操作">
      <button id="m-batch-select-all-btn" class="mobile-select-action-btn" type="button" onclick="toggleSelectAll()">全选</button>
      <button id="m-batch-merge-btn" class="mobile-select-action-btn" type="button" style="display:none;" onclick="openBatchMergeModal()">合并</button>
      <button id="m-batch-compress-btn" class="mobile-select-action-btn" type="button" style="display:none;" onclick="openBatchCompressModal()">压缩</button>
      <button id="m-batch-move-btn" class="mobile-select-action-btn" type="button" style="display:none;" onclick="openBatchMoveModal()">移动</button>
      <button id="m-batch-delete-btn" class="mobile-select-action-btn is-danger" type="button" style="display:none;" onclick="confirmDeleteSelectedItems()">删除</button>
      <button class="mobile-select-action-btn" type="button" onclick="clearSelection()">取消</button>
    </div>

    ${lanMobileVideoEditMarkup}
    ${lanWebSharedModalsMarkup}
  </div>`;
