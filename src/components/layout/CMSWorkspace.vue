<template>
  <div class="cms-workspace-wrapper">
    <!-- 1. 骨架屏占位 -->
    <div v-if="isFirstLoad" class="skeleton-container">
      <div class="skeleton-search"></div>
      <div class="skeleton-categories">
        <div class="skeleton-pill active"></div>
        <div v-for="i in 6" :key="i" class="skeleton-pill"></div>
      </div>
      <div class="skeleton-grid">
        <div v-for="i in 10" :key="i" class="skeleton-card">
          <div class="skeleton-thumb"></div>
          <div class="skeleton-info">
            <div class="skeleton-line title"></div>
            <div class="skeleton-line sub"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 真实内容区 -->
    <div v-else class="cms-container">
      <!-- 顶部搜索框 (水平居中对齐) -->
      <div class="search-bar">
        <div class="search-input-wrapper">
          <v-input 
            v-model="searchKeyword" 
            placeholder="搜索视频名称..." 
            class="search-input"
            @enter="handleSearch"
          />
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <v-button variant="primary" class="search-btn" @click="handleSearch">搜索</v-button>
        <v-button v-if="keyword" variant="secondary" class="reset-btn" @click="handleReset">清空</v-button>
      </div>

      <!-- 单行大类水平滚动栏 (下拉展示子类，无大类/子类字样) -->
      <div 
        class="category-panel" 
        v-if="parentCategories.length > 0"
        ref="categoryPanelRef"
      >
        <div class="parent-category-slider">
          <!-- 智能显示左滚动箭头 -->
          <button 
            v-show="showLeftArrow" 
            class="scroll-arrow left" 
            @mouseenter="startScroll(-1)" 
            @mouseleave="stopScroll"
            title="向左滚动"
          >
            ‹
          </button>
          
          <div 
            class="parent-category-list-viewport" 
            ref="sliderViewport"
            @scroll="checkOverflow"
          >
            <!-- 全部选项 -->
            <div class="parent-cat-container">
              <button 
                class="cat-item" 
                :class="{ active: selectedParentId === null }" 
                @click="handleParentSelect(null)"
              >
                全部
              </button>
            </div>

            <!-- 大类项 -->
            <div 
              v-for="cat in parentCategories" 
              :key="cat.id" 
              class="parent-cat-container"
              @mouseenter="handleItemMouseEnter($event, cat.id)"
              @mouseleave="handleItemMouseLeave"
            >
              <button 
                class="cat-item" 
                :class="{ active: selectedParentId === cat.id }" 
                @click="handleParentSelect(cat.id)"
              >
                {{ cat.name }}
              </button>
            </div>
          </div>

          <!-- 智能显示右滚动箭头 -->
          <button 
            v-show="showRightArrow" 
            class="scroll-arrow right" 
            @mouseenter="startScroll(1)" 
            @mouseleave="stopScroll"
            title="向右滚动"
          >
            ›
          </button>
        </div>

        <!-- 将悬浮下拉菜单放置在 viewport 外层，基于计算位置精确定位，防止被 overflow 截断 -->
        <Transition name="dropdown-fade">
          <div 
            v-show="hoveredParentId !== null && activeHoverSubCategories.length > 0" 
            class="sub-category-dropdown"
            :style="dropdownStyle"
            @mouseenter="handleDropdownMouseEnter"
            @mouseleave="handleItemMouseLeave"
          >
            <button 
              v-for="sub in activeHoverSubCategories" 
              :key="sub.id" 
              class="dropdown-item" 
              :class="{ active: activeCategoryId === sub.id }" 
              @click="handleSubSelect(sub.id, hoveredParentId!)"
            >
              {{ sub.name }}
            </button>
          </div>
        </Transition>
      </div>

      <!-- 搜索状态提示 -->
      <div v-if="keyword" class="search-result-hint">
        正在展示 “<span class="highlight">{{ keyword }}</span>” 的搜索结果，共 {{ total }} 条数据。
      </div>

      <!-- 资源网格区 -->
      <div class="video-grid-container">
        <div v-if="videos.length === 0 && !loading" class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
          </svg>
          <p>暂无符合条件的资源，尝试换个分类或搜索词吧</p>
        </div>

        <div v-else class="video-grid">
          <div 
            v-for="video in videos" 
            :key="video.id" 
            class="video-card"
            @click="goToDetail(video.id)"
          >
            <!-- 封面背景大图 -->
            <div 
              class="video-thumb" 
              :style="video.pic ? { backgroundImage: 'url(' + video.pic + ')' } : {}"
            >
              <!-- 当没有图片时的优雅 fallback -->
              <div v-if="!video.pic" class="video-cover-fallback">
                <span class="cover-char">{{ video.name.charAt(0) }}</span>
              </div>

              <!-- 悬浮播放按钮遮罩 -->
              <div class="card-overlay">
                <div class="play-btn-circle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </div>
              </div>

              <!-- 左上角评分 -->
              <span 
                v-if="video.score && video.score !== '0.0'" 
                class="video-badge score-badge"
              >
                {{ video.score }}
              </span>

              <!-- 右上角集数备注 -->
              <span 
                v-if="video.remarks" 
                class="video-badge remarks-badge"
                :class="{ completed: video.remarks.includes('已完成') || video.remarks.includes('共') }"
              >
                {{ video.remarks }}
              </span>

              <!-- 右下角类型 -->
              <span class="video-badge type-name">{{ video.categoryName }}</span>
            </div>
            
            <div class="video-info">
              <h4 class="video-title" :title="video.name">{{ video.name }}</h4>
              <span class="video-update-time">{{ formatDate(video.time) }} 更新</span>
            </div>
          </div>
        </div>

        <!-- 触底加载哨兵 -->
        <div ref="loadMoreTrigger" class="load-more-sentinel">
          <div v-if="loading" class="spinner-loader">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span v-else-if="page >= pageCount && videos.length > 0" class="no-more-text">
            已加载全部资源 (共 {{ total }} 条)
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCMS } from '../../composables/useCMS'
import { logger } from '../../services/logger'
import VInput from '../base/VInput.vue'
import VButton from '../base/VButton.vue'

const props = defineProps<{
  resourceId: string
  resourceUrl: string
}>()

const router = useRouter()

// 每个实例独享物理隔离的 CMS 状态模块
const {
  loading,
  categories,
  videos,
  total,
  page,
  pageCount,
  keyword,
  activeCategoryId,
  loadCategories,
  loadVideos,
  search,
  selectCategory
} = useCMS(props.resourceUrl)

// 页面控制状态
const isFirstLoad = ref(true)
const searchKeyword = ref('')
const selectedParentId = ref<number | null>(null)
const hoveredParentId = ref<number | null>(null)
const categoryPanelRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<{ left?: string }>({})
let dropdownTimer: any = null

// 分类体系拆解
const parentCategories = computed(() => {
  return categories.value.filter(c => c.parentId === 0)
})

const getSubCategoriesOf = (parentId: number) => {
  return categories.value.filter(c => c.parentId === parentId)
}

const activeHoverSubCategories = computed(() => {
  if (hoveredParentId.value === null) return []
  return getSubCategoriesOf(hoveredParentId.value)
})

const handleItemMouseEnter = (event: MouseEvent, catId: number) => {
  if (dropdownTimer) clearTimeout(dropdownTimer)
  hoveredParentId.value = catId
  const target = event.currentTarget as HTMLElement
  if (target && categoryPanelRef.value) {
    const targetRect = target.getBoundingClientRect()
    const panelRect = categoryPanelRef.value.getBoundingClientRect()
    let left = targetRect.left - panelRect.left + (targetRect.width / 2) - 135
    const maxLeft = panelRect.width - 280
    left = Math.max(16, Math.min(left, maxLeft))
    dropdownStyle.value = { left: `${left}px` }
  }
}

const handleItemMouseLeave = () => {
  dropdownTimer = setTimeout(() => {
    hoveredParentId.value = null
  }, 150)
}

const handleDropdownMouseEnter = () => {
  if (dropdownTimer) clearTimeout(dropdownTimer)
}

// 大类水平滚动箭头逻辑
const sliderViewport = ref<HTMLElement | null>(null)
const showLeftArrow = ref(false)
const showRightArrow = ref(false)
let scrollInterval: any = null

const checkOverflow = () => {
  nextTick(() => {
    if (sliderViewport.value) {
      const { scrollLeft, scrollWidth, clientWidth } = sliderViewport.value
      showLeftArrow.value = scrollLeft > 1
      showRightArrow.value = scrollLeft + clientWidth < scrollWidth - 2
    }
  })
}

const startScroll = (direction: number) => {
  if (scrollInterval) clearInterval(scrollInterval)
  scrollInterval = setInterval(() => {
    if (sliderViewport.value) {
      sliderViewport.value.scrollLeft += direction * 6
      checkOverflow()
    }
  }, 16)
}

const stopScroll = () => {
  if (scrollInterval) {
    clearInterval(scrollInterval)
    scrollInterval = null
  }
}

// 初始化与拉取
const initCMSPage = async () => {
  if (!props.resourceUrl) return
  isFirstLoad.value = true
  searchKeyword.value = ''
  selectedParentId.value = null
  hoveredParentId.value = null
  showLeftArrow.value = false
  showRightArrow.value = false
  
  try {
    await Promise.all([
      loadCategories(),
      loadVideos(1)
    ])
    setTimeout(checkOverflow, 300)
  } catch (err) {
    logger.error('CMS', 'Failed to init CMS workspace: ' + err)
  } finally {
    isFirstLoad.value = false
  }
}

watch(() => parentCategories.value, () => {
  checkOverflow()
}, { deep: true })

const onResize = () => {
  checkOverflow()
}

onMounted(() => {
  initCMSPage()
  window.addEventListener('resize', onResize)
  setupScrollObserver()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  cleanupScrollObserver()
})

const handleSearch = () => {
  search(searchKeyword.value.trim())
}

const handleReset = () => {
  searchKeyword.value = ''
  search('')
}

const handleParentSelect = (parentId: number | null) => {
  selectedParentId.value = parentId
  selectCategory(parentId)
}

const handleSubSelect = (subId: number, parentId: number) => {
  selectedParentId.value = parentId
  selectCategory(subId)
  hoveredParentId.value = null
}

// 触底无限滚动
const loadMoreTrigger = ref<HTMLElement | null>(null)
let scrollObserver: IntersectionObserver | null = null

const setupScrollObserver = () => {
  scrollObserver = new IntersectionObserver((entries) => {
    const entry = entries[0]
    if (entry.isIntersecting && !loading.value && page.value < pageCount.value) {
      loadVideos(page.value + 1)
    }
  }, {
    rootMargin: '150px'
  })

  watch(() => isFirstLoad.value, (newVal) => {
    if (!newVal) {
      setTimeout(() => {
        if (loadMoreTrigger.value && scrollObserver) {
          scrollObserver.observe(loadMoreTrigger.value)
        }
      }, 100)
    }
  }, { immediate: true })
}

const cleanupScrollObserver = () => {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
}

const goToDetail = (vodId: number) => {
  router.push({
    name: 'VideoDetail',
    params: {
      type: 'cms',
      id: props.resourceId,
      vodId: String(vodId)
    }
  })
}

const formatDate = (timeStr: string) => {
  if (!timeStr) return ''
  const parts = timeStr.split(' ')
  return parts[0] || timeStr
}
</script>

<style scoped lang="less">
.cms-workspace-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bg-app);
}

/* 骨架屏样式 */
.skeleton-container {
  display: flex;
  flex-direction: column;
  padding: var(--view-padding);
  gap: 20px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.skeleton-search {
  height: 36px;
  width: 320px;
  align-self: center;
  background: var(--border-light);
  border-radius: 6px;
  animation: shine 1.5s infinite ease-in-out;
}

.skeleton-categories {
  display: flex;
  gap: 12px;
}

.skeleton-pill {
  width: 70px;
  height: 28px;
  border-radius: 14px;
  background: var(--border-light);
  animation: shine 1.5s infinite ease-in-out;

  &.active {
    background: var(--border-color);
  }
}

.skeleton-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 20px;
  overflow: hidden;
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 290px;
  
  .skeleton-thumb {
    flex: 1;
    border-radius: 8px;
    background: var(--border-light);
    animation: shine 1.5s infinite ease-in-out;
  }
  
  .skeleton-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 4px;
  }
}

.skeleton-line {
  height: 12px;
  background: var(--border-light);
  border-radius: 4px;
  animation: shine 1.5s infinite ease-in-out;

  &.title {
    width: 70%;
  }

  &.sub {
    width: 40%;
    height: 10px;
  }
}

@keyframes shine {
  0% { opacity: 0.5; }
  50% { opacity: 0.85; }
  100% { opacity: 0.5; }
}

/* 真实视图样式 */
.cms-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: var(--view-padding);
  box-sizing: border-box;
  overflow: hidden;
}

/* 搜索栏 - 水平居中 */
.search-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-shrink: 0;
  width: 100%;

  .search-input-wrapper {
    position: relative;
    width: 340px;

    .search-input {
      padding-left: 36px;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
      pointer-events: none;
    }
  }
}

/* 重新排版的单行大类水平滚动栏 */
.category-panel {
  position: relative;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 20px;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.parent-category-slider {
  display: flex;
  align-items: center;
  position: relative;
  width: 100%;
}

.parent-category-list-viewport {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
  scroll-behavior: smooth;
  padding: 6px 0;

  &::-webkit-scrollbar {
    display: none;
  }
}

.scroll-arrow {
  border: none;
  background: var(--bg-surface);
  color: var(--text-secondary);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  z-index: 10;
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    color: var(--color-accent);
    background: var(--bg-surface-hover);
    transform: scale(1.08);
  }

  &.left {
    margin-right: 8px;
  }

  &.right {
    margin-left: 8px;
  }
}

.parent-cat-container {
  flex-shrink: 0;
}

.cat-item {
  border: none;
  background: transparent;
  padding: 6px 14px;
  height: 28px;
  border-radius: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;

  &:hover {
    background: var(--bg-surface-hover);
    color: var(--color-accent);
  }

  &.active {
    background: var(--bg-surface-active);
    color: var(--color-accent);
    font-weight: 600;
  }
}

.sub-category-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  z-index: 1000;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 1fr));
  gap: 6px;
  min-width: 270px;
  max-height: 220px;
  overflow-y: auto;
  box-sizing: border-box;
}

.sub-category-dropdown::-webkit-scrollbar {
  width: 4px;
}

.sub-category-dropdown::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.dropdown-item {
  border: none;
  background: transparent;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.2s;

  &:hover {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  &.active {
    background: var(--border-light);
    color: var(--color-accent);
    font-weight: 600;
  }
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.search-result-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  flex-shrink: 0;

  .highlight {
    color: var(--color-accent);
    font-weight: 600;
  }
}

.video-grid-container {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.video-grid-container::-webkit-scrollbar {
  width: 6px;
}

.video-grid-container::-webkit-scrollbar-track {
  background: transparent;
}

.video-grid-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 20px 16px;
}

.video-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-2px);

    .video-thumb {
      box-shadow: var(--shadow-soft);
      
      .video-cover-fallback {
        transform: scale(1.05);
      }
      
      .card-overlay {
        opacity: 1;
        .play-btn-circle {
          transform: translate(-50%, -50%) scale(1);
        }
      }
    }
    
    .video-title {
      color: var(--color-accent-hover);
    }
  }
}

.video-thumb {
  aspect-ratio: 2 / 2.8;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  background: var(--border-light);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  background-size: cover;
  background-position: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  .video-cover-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, oklch(95% 0.005 90), oklch(90% 0.008 90));
    transition: transform 0.3s ease;

    .cover-char {
      font-size: 32px;
      font-weight: 700;
      color: var(--text-tertiary);
    }
  }
  
  [data-theme='dark'] & .video-cover-fallback {
    background: linear-gradient(135deg, oklch(22% 0.005 90), oklch(18% 0.005 90));
  }

  .card-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.15);
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;

    .play-btn-circle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bg-surface);
      color: var(--color-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      
      svg {
        margin-left: 2px;
      }
    }
  }

  .video-badge {
    position: absolute;
    padding: 3px 6px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

    &.score-badge {
      top: 8px;
      left: 8px;
      background: #f59e0b;
      color: #fff;
      border: 1px solid #d97706;
    }

    &.remarks-badge {
      top: 8px;
      right: 8px;
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      max-width: 90px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &.completed {
        background: var(--color-accent);
        color: var(--bg-surface);
        border-color: var(--color-accent);
      }
    }

    &.type-name {
      bottom: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      backdrop-filter: blur(4px);
    }
  }
}

.video-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 2px;
}

.video-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s ease;
}

.video-update-time {
  font-size: 11px;
  color: var(--text-secondary);
}

.load-more-sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 32px 0;
  width: 100%;
  box-sizing: border-box;

  .no-more-text {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

.spinner-loader {
  display: flex;
  gap: 6px;

  .dot {
    width: 6px;
    height: 6px;
    background-color: var(--text-secondary);
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1.0); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 20px;
  color: var(--text-secondary);
  text-align: center;

  svg {
    opacity: 0.4;
    margin-bottom: 16px;
  }

  p {
    font-size: 14px;
    margin: 0;
  }
}
</style>
