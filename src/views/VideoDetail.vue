<template>
  <div class="view video-detail-view">
    <!-- 顶部导航栏 -->
    <div class="detail-nav-header">
      <v-button variant="secondary" class="back-btn" @click="goBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回列表
      </v-button>
      <span class="nav-title" v-if="videoDetail">{{ videoDetail.name }}</span>
    </div>

    <!-- 加载中或错误状态 -->
    <div v-if="detailLoading" class="loader-container">
      <div class="spinner"></div>
      <p>正在获取视频详情及播放源...</p>
    </div>
    
    <div v-else-if="!videoDetail" class="error-container">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <p>{{ error || '视频详情不存在或已被移除' }}</p>
      <v-button variant="primary" @click="goBack">返回上一页</v-button>
    </div>

    <!-- 主体内容 -->
    <div v-else class="detail-main-layout">
      <!-- 左侧：播放器与影片详情介绍 -->
      <div class="layout-left">
        <!-- 播放器区域 -->
        <div class="player-wrapper">
                              <div v-if="activeEpisode" class="player-container">
            <video 
              v-show="isNativeVideo || sniffedMediaUrl"
              ref="videoPlayer" 
              class="video-element" 
              controls 
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onMetadataLoaded"
            ></video>
            
            <div v-if="!isNativeVideo && !sniffedMediaUrl" class="sniffing-overlay">
              <div class="loading-spinner"></div>
              <p>正在后台嗅探真实视频流...</p>
            </div>
            
            <webview 
              v-if="!isNativeVideo && !sniffedMediaUrl"
              ref="webviewPlayer" 
              class="video-element" 
              style="width:0;height:0;position:absolute;opacity:0;pointer-events:none;"
              :src="activeEpisode.url"
            ></webview>
          </div>
          
          <div v-else class="no-active-play">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <p>请在右侧剧集列表中选择要播放的集数</p>
          </div>
        </div>

        <!-- 影片基础简介卡片 -->
        <div class="video-intro-card">
          <div class="card-scroll-area">
            <div class="meta-section">
              <div class="video-meta-poster">
                <img v-if="videoDetail.pic" :src="videoDetail.pic" class="poster-img" referrerpolicy="no-referrer" />
                <div v-else class="poster-fallback">
                  <span>{{ videoDetail.name.charAt(0) }}</span>
                </div>
              </div>
              
              <div class="video-meta-text">
                <div class="title-header-row">
                  <h2 class="title" :title="videoDetail.name">{{ videoDetail.name }}</h2>
                  <div class="title-action-btns">
                    <v-button variant="icon" class="title-action-btn" @click="handleCopyTitle" title="复制标题">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </v-button>
                    <v-button variant="icon" class="title-action-btn" @click="handleDownloadVideo" title="下载当前集数视频">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </v-button>
                  </div>
                </div>
                <div class="badge-row">
                  <span class="meta-badge">{{ videoDetail.categoryName }}</span>
                  <span class="meta-badge" v-if="videoDetail.year">{{ videoDetail.year }}年</span>
                  <span class="meta-badge" v-if="videoDetail.area">{{ videoDetail.area }}</span>
                  <span class="meta-badge" v-if="videoDetail.lang">{{ videoDetail.lang }}</span>
                </div>
                
                <div class="info-list">
                  <div class="info-item" v-if="videoDetail.director">
                    <span class="label">导演：</span>
                    <span class="value">{{ videoDetail.director }}</span>
                  </div>
                  <div class="info-item" v-if="videoDetail.actor">
                    <span class="label">主演：</span>
                    <span class="value" :title="videoDetail.actor">{{ videoDetail.actor }}</span>
                  </div>
                  <div class="info-item" v-if="videoDetail.time">
                    <span class="label">更新：</span>
                    <span class="value">{{ videoDetail.time }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <div class="synopsis-section" v-if="videoDetail.content">
              <h3>剧情简介</h3>
              <p class="synopsis-content">{{ videoDetail.content }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：播放源与集数列表 -->
      <div class="layout-right">
        <!-- 播放源切换 Tab -->
        <div class="source-header" v-if="videoDetail.playSources.length > 0">
          <span class="section-title">选择播放源</span>
          <div class="source-tabs">
            <button 
              v-for="(source, index) in videoDetail.playSources" 
              :key="source.from" 
              class="source-tab-btn"
              :class="{ active: activeSourceIndex === index }"
              @click="activeSourceIndex = index"
            >
              {{ mapSourceName(source.from) }}
            </button>
          </div>
        </div>

        <!-- 当前播放源的集数网格 -->
        <div class="episodes-section" v-if="currentSource">
          <div class="episodes-header">
            <span class="section-title">播放列表</span>
            <span class="episodes-count">共 {{ currentSource.episodes.length }} 集</span>
          </div>
          
          <div class="episodes-scroll-area">
            <div class="episodes-grid">
              <button 
                v-for="ep in currentSource.episodes" 
                :key="ep.url"
                class="episode-btn"
                :class="{ 
                  active: activeEpisode && activeEpisode.url === ep.url,
                  played: playedHistory.includes(ep.url) 
                }"
                @click="playEpisode(ep)"
              >
                {{ ep.name }}
              </button>
            </div>
          </div>
        </div>

        <div v-else class="no-sources-hint">
          暂无可用播放源
        </div>
      </div>
    </div>

    <!-- 保存视频弹窗 -->
    <save-media-dialog 
      v-model:visible="saveDialogVisible"
      :url="saveTargetUrl"
      :default-name="saveDefaultName"
      :default-dir="saveDefaultDir"
      type="video"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, onActivated, onDeactivated } from 'vue'
import { useRoute } from 'vue-router'

import { useSettings } from '../composables/useSettings'
import { useCMS } from '../composables/useCMS'
import { useMessage } from '../composables/useMessage'
import { useOpenedCMS } from '../composables/useOpenedCMS'
import { logger } from '../services/logger'
import VButton from '../components/base/VButton.vue'
import SaveMediaDialog from '../components/features/SaveMediaDialog.vue'

// 弹窗保存媒体控制
const saveDialogVisible = ref(false)
const saveTargetUrl = ref('')
const saveDefaultName = ref('')
const saveDefaultDir = ref('')

// Hls.js 库的动态加载
const loadHlsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Hls) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Hls.js library'))
    document.head.appendChild(script)
  })
}

const props = defineProps<{ vodId: string, resourceId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { state } = useSettings()
const { showMessage } = useMessage()

const cmsId = props.resourceId
const vodId = Number(props.vodId)

// 拿到当前 CMS 配置
const cmsResource = computed(() => {
  return state.cmsResources.find(r => r.id === cmsId)
})
const route = useRoute()
const apiUrl = computed(() => cmsResource.value?.url || '')

// 实例化私有的 CMS 状态模块
const {
  error,
  selectedVideo: videoDetail,
  detailLoading,
  loadVideoDetail
} = useCMS(apiUrl.value)

// 页面播放状态
const activeSourceIndex = ref(0)
const activeEpisode = ref<{ name: string; url: string } | null>(null)
const playedHistory = ref<string[]>([])
const sniffedMediaUrl = ref<string | null>(null)

const webviewPlayer = ref<any>(null)

const isNativeVideo = computed(() => {
  if (!activeEpisode.value) return true;
  const lowerUrl = activeEpisode.value.url.toLowerCase();
  return lowerUrl.includes('.m3u8') || lowerUrl.includes('.mp4') || lowerUrl.includes('.webm') || lowerUrl.includes('.flv') || lowerUrl.includes('.mkv');
});

onDeactivated(() => {
  if (videoPlayer.value) {
    videoPlayer.value.pause();
  }
})

onActivated(() => {
  // We can resume native video if we want, or leave it paused for user to manually resume
})


// 获取当前源
const currentSource = computed(() => {
  if (!videoDetail.value) return null
  return videoDetail.value.playSources[activeSourceIndex.value] || null
})

// Hls.js 实例和 DOM 引用
const videoPlayer = ref<HTMLVideoElement | null>(null)
let hlsInstance: any = null

// 监听路由以处理自动暂停与恢复
let wasPlayingBeforeHidden = false
const isVisible = computed(() => {
  return route.path.includes('/resource/cms/' + props.resourceId)
})

watch(isVisible, (visible) => {
  if (!videoPlayer.value) return
  if (visible) {
    if (wasPlayingBeforeHidden) {
      videoPlayer.value.play().catch(() => {})
      wasPlayingBeforeHidden = false
    }
  } else {
    wasPlayingBeforeHidden = !videoPlayer.value.paused
    if (wasPlayingBeforeHidden) {
      videoPlayer.value.pause()
    }
  }
})

// 返回列表操作
const goBack = () => {
  emit('close')
}

// 复制视频标题
const handleCopyTitle = () => {
  if (videoDetail.value?.name) {
    navigator.clipboard.writeText(videoDetail.value.name)
    showMessage('已复制视频标题到剪贴板', 'success')
  }
}

// 下载当前选中的集数视频 (智能解析真实媒体 URL & 统一推荐 mp4 后缀)
const handleDownloadVideo = () => {
  if (!videoDetail.value || !activeEpisode.value) {
    showMessage('请先选择要下载的集数', 'warning')
    return
  }
  const ep = activeEpisode.value
  let targetUrl = ep.url

  // 判断是否为非直连媒体的网页解析链接
  const lowerUrl = targetUrl.toLowerCase()
  const isWebPageUrl = !lowerUrl.includes('.m3u8') && 
                       !lowerUrl.includes('.mp4') && 
                       !lowerUrl.includes('.webm') && 
                       !lowerUrl.includes('.flv') && 
                       !lowerUrl.includes('.mkv')

  if (isWebPageUrl) {
    let matchedUrl = ''

    // 策略 A: 跨源同集名匹配 (查找其他包含 .m3u8/.mp4 的源中同名的集数)
    if (videoDetail.value.playSources) {
      for (const source of videoDetail.value.playSources) {
        const matchedEp = source.episodes.find(e => e.name.trim() === ep.name.trim())
        if (matchedEp) {
          const mUrl = matchedEp.url.toLowerCase()
          if (mUrl.includes('.m3u8') || mUrl.includes('.mp4')) {
            matchedUrl = matchedEp.url
            break
          }
        }
      }
    }

    if (matchedUrl) {
      targetUrl = matchedUrl
    } else if (sniffedMediaUrl.value) {
      // 策略 B: 使用网络嗅探捕获到的真实媒体流 URL
      targetUrl = sniffedMediaUrl.value
    } else {
      showMessage('当前网页源未获取到真实媒体流，请尝试切换至 m3u8 播放源或待播放缓冲后重试', 'warning')
      return
    }
  }

  const rawName = `${videoDetail.value.name}_${ep.name}`.replace(/[\\/:*?"<>|]/g, '_')
  // 弹窗默认推荐规范的 mp4 合并后文件后缀名 (如 example.mp4)
  const defaultFilename = `${rawName}.mp4`

  saveTargetUrl.value = targetUrl
  saveDefaultName.value = defaultFilename
  saveDefaultDir.value = state.videoDirectory || ''
  saveDialogVisible.value = true
}

// 映射友好的播放源名称
const mapSourceName = (name: string) => {
  if (name.includes('m3u8')) return '高清极速(m3u8)'
  if (name.includes('yun') || name.includes('play')) return '网页播放'
  return name.toUpperCase()
}


const handleMediaSniffed = (data: { url: string, type: string, timestamp: number }) => {
  if (data.type === 'video' && activeEpisode.value && !isNativeVideo.value && !sniffedMediaUrl.value) {
    logger.info('VideoDetail', `Sniffed real media URL: ${data.url}`);
    sniffedMediaUrl.value = data.url;
    
    // Auto play the sniffed URL natively!
    nextTick(() => {
      if (!videoPlayer.value) return;
      logger.info('Player', '[Player] Playing Sniffed URL: ' + data.url);
      
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      
      if (data.url.toLowerCase().includes('.m3u8')) {
        import('hls.js').then((HlsModule) => {
          const Hls = HlsModule.default || HlsModule;
          if (Hls.isSupported()) {
            hlsInstance = new Hls({ autoStartLoad: true, startPosition: -1 });
            hlsInstance.loadSource(data.url);
            hlsInstance.attachMedia(videoPlayer.value!);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
              videoPlayer.value?.play().catch(e => logger.warn('Player', 'Auto-play blocked: ' + e));
            });
          }
        });
      } else {
        videoPlayer.value.src = data.url;
        videoPlayer.value.load();
        videoPlayer.value.play().catch(e => logger.warn('Player', 'Auto-play blocked: ' + e));
      }
    });
  }
}

// 初始化加载
onMounted(async () => {
  if (window.electronAPI) {
    window.electronAPI.onMediaSniffed(handleMediaSniffed);
  }

  await loadVideoDetail(vodId)
  loadPlaybackHistory()
  
  // 默认自动开始播放第一集
  if (currentSource.value && currentSource.value.episodes.length > 0) {
    // 优先加载历史播放集，如无历史则播第一集
    const lastPlayedEp = currentSource.value.episodes.find(ep => playedHistory.value.includes(ep.url))
    playEpisode(lastPlayedEp || currentSource.value.episodes[0])
  }

  // 监听网络嗅探器，自动记录网页内嵌播放时发起的真实媒体流 URL
  if (window.electronAPI && window.electronAPI.onMediaSniffed) {
    window.electronAPI.onMediaSniffed((data: any) => {
      if (data.type === 'video' && data.url) {
        sniffedMediaUrl.value = data.url
      }
    })
  }
})

onUnmounted(() => {
  destroyPlayer()
  if (window.electronAPI) {
    window.electronAPI.offMediaSniffed(handleMediaSniffed);
  }
})

// 销毁播放器
const destroyPlayer = () => {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
  if (videoPlayer.value) {
    videoPlayer.value.src = ''
    videoPlayer.value.load()
  }
}

// 播放指定集数
const playEpisode = async (episode: { name: string; url: string }) => {
  activeEpisode.value = episode
  sniffedMediaUrl.value = null // clear sniffed url
  saveToHistory(episode.url)

  await nextTick()
  destroyPlayer()

  if (!isNativeVideo.value) {
    logger.info('Player', '[Player] Start sniffing for Webview URL: ' + episode.url)
    return
  }

  if (!videoPlayer.value) return

  const url = episode.url
  logger.info('Player', '[Player] Playing URL: ' + url)

  // 1. 如果是 .m3u8 后缀，使用 Hls.js 播放
  if (url.toLowerCase().includes('.m3u8')) {
    try {
      await loadHlsScript()
      
      if ((window as any).Hls && (window as any).Hls.isSupported()) {
        const hls = new (window as any).Hls({
          maxMaxBufferLength: 30, // 优化缓冲性能
        })
        hls.loadSource(url)
        hls.attachMedia(videoPlayer.value)
        hlsInstance = hls

        hls.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
          // 恢复上一次观看的进度
          const savedProgress = getSavedProgress(url)
          if (savedProgress > 0 && videoPlayer.value) {
            videoPlayer.value.currentTime = savedProgress
          }
          videoPlayer.value?.play().catch(e => logger.warn('Player', 'Auto-play blocked: ' + e))
        })

        hls.on((window as any).Hls.Events.ERROR, (_event: any, data: any) => {
          if (data.fatal) {
            switch (data.type) {
              case (window as any).Hls.ErrorTypes.NETWORK_ERROR:
                logger.error('Player', '[Player] Fatal network error, trying to recover...')
                hls.startLoad()
                break
              case (window as any).Hls.ErrorTypes.MEDIA_ERROR:
                logger.error('Player', '[Player] Fatal media error, trying to recover...')
                hls.recoverMediaError()
                break
              default:
                logger.error('Player', '[Player] Unrecoverable player error')
                destroyPlayer()
                break
            }
          }
        })
      } else if (videoPlayer.value.canPlayType('application/vnd.apple.mpegurl')) {
        // 原生 HLS 支持 (如 Safari 引擎)
        videoPlayer.value.src = url
        videoPlayer.value.addEventListener('loadedmetadata', () => {
          const savedProgress = getSavedProgress(url)
          if (savedProgress > 0 && videoPlayer.value) {
            videoPlayer.value.currentTime = savedProgress
          }
          videoPlayer.value?.play().catch(e => logger.warn('Player', 'Auto-play blocked: ' + e))
        })
      } else {
        logger.error('Player', 'Browser does not support HLS playback')
      }
    } catch (e) {
      logger.error('Player', 'Hls.js script load error: ' + e)
    }
  } else {
    // 2. 如果是普通 mp4，直接使用 HTML5 video 播放
    videoPlayer.value.src = url
    videoPlayer.value.load()
    videoPlayer.value.addEventListener('loadedmetadata', () => {
      const savedProgress = getSavedProgress(url)
      if (savedProgress > 0 && videoPlayer.value) {
        videoPlayer.value.currentTime = savedProgress
      }
      videoPlayer.value?.play().catch(e => logger.warn('Player', 'Auto-play blocked: ' + e))
    })
  }
}



// 记录播放进度
const onTimeUpdate = () => {
  if (!videoPlayer.value || !activeEpisode.value) return
  const curTime = videoPlayer.value.currentTime
  // 没播完时才存进度
  if (curTime > 5 && videoPlayer.value.duration - curTime > 10) {
    saveProgress(activeEpisode.value.url, curTime)
  }
}

const onMetadataLoaded = () => {
  // 元数据载入完成
}

// 缓存历史播放与进度管理 (LocalStorage)
const loadPlaybackHistory = () => {
  try {
    const key = `played_history_${cmsId}_${vodId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      playedHistory.value = JSON.parse(stored)
    }
  } catch (e) {
    logger.error('Player', String(e))
  }
}

const saveToHistory = (url: string) => {
  if (!playedHistory.value.includes(url)) {
    playedHistory.value.push(url)
    try {
      const key = `played_history_${cmsId}_${vodId}`
      localStorage.setItem(key, JSON.stringify(playedHistory.value))
    } catch (e) {
      logger.error('Player', String(e))
    }
  }
}

const saveProgress = (url: string, time: number) => {
  try {
    const key = `progress_${encodeURIComponent(url)}`
    localStorage.setItem(key, String(time))
  } catch (e) {
    logger.error('Player', String(e))
  }
}

const getSavedProgress = (url: string): number => {
  try {
    const key = `progress_${encodeURIComponent(url)}`
    const stored = localStorage.getItem(key)
    return stored ? Number(stored) : 0
  } catch (e) {
    return 0
  }
}
</script>

<style scoped lang="less">
.video-detail-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: var(--bg-app);
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bg-app);
}

.detail-nav-header {
  height: 56px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);

  .back-btn {
    padding: 4px 12px;
  }

  .nav-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* 详情排版 */
.detail-main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: var(--view-padding);
  gap: 24px;
  box-sizing: border-box;
}

.layout-left {
  flex: 1.6;
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  overflow: hidden;
}

.layout-right {
  flex: 0.8;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* 播放器容器 */
.player-wrapper {
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-soft);
  position: relative;
  flex-shrink: 0;
}

.player-container {
  width: 100%;
  height: 100%;
  position: relative;

  .video-element,
  .video-element-iframe {
    width: 100%;
    height: 100%;
    object-fit: contain;
    outline: none;
    border: none;
  }
}

.external-play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  z-index: 10;
  padding: 24px;
  text-align: center;
  box-sizing: border-box;

  .external-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 320px;
    gap: 12px;

    svg {
      color: var(--text-tertiary);
      opacity: 0.8;
    }

    h3 {
      font-size: 16px;
      margin: 0;
      font-weight: 600;
    }

    p {
      font-size: 12.5px;
      color: rgba(255, 255, 255, 0.7);
      margin: 0;
      line-height: 1.5;
    }
  }
}

.no-active-play {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);

  svg {
    opacity: 0.3;
    margin-bottom: 12px;
  }

  p {
    font-size: 13.5px;
    margin: 0;
  }
}

/* 影片基本信息介绍 */
.video-intro-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
}

.card-scroll-area::-webkit-scrollbar {
  width: 5px;
}

.card-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.meta-section {
  display: flex;
  gap: 20px;
}

.video-meta-poster {
  width: 110px;
  aspect-ratio: 2 / 2.8;
  border-radius: 6px;
  overflow: hidden;
  background: var(--border-light);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;

  .poster-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 700;
    color: var(--text-tertiary);
    background: var(--border-light);
  }
}

.video-meta-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;

  .title-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }

  .title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .title-action-btns {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .title-action-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .meta-badge {
    background: var(--bg-surface-active);
    color: var(--color-accent);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }

  .info-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
  }

  .info-item {
    display: flex;
    align-items: baseline;

    .label {
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .value {
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.divider {
  height: 1px;
  background: var(--border-light);
  margin: 20px 0;
}

.synopsis-section {
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }

  .synopsis-content {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0;
    text-align: justify;
  }
}

/* 播放源与列表 */
.source-header {
  margin-bottom: 20px;
  flex-shrink: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
  margin-bottom: 12px;
}

.source-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.source-tab-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }

  &.active {
    background: var(--color-accent);
    color: var(--bg-surface);
    border-color: var(--color-accent);
  }
}

.episodes-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border-light);
  padding-top: 20px;
}

.episodes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;

  .section-title {
    margin-bottom: 0;
  }

  .episodes-count {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.episodes-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.episodes-scroll-area::-webkit-scrollbar {
  width: 5px;
}

.episodes-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.episodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px 8px;
  padding-bottom: 16px;
}

.episode-btn {
  height: 36px;
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-primary);
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;

  &:hover {
    border-color: var(--text-secondary);
    color: var(--color-accent);
  }

  &.active {
    background: var(--color-accent) !important;
    color: var(--bg-surface) !important;
    border-color: var(--color-accent) !important;
    font-weight: 600;
  }

  /* 已播历史记录样式 */
  &.played {
    background: var(--bg-surface-hover);
    color: var(--text-secondary);
    border-color: var(--border-light);
  }
}

.no-sources-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

/* 加载或异常容器 */
.loader-container,
.error-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  text-align: center;
  gap: 16px;

  p {
    font-size: 14px;
    margin: 0;
  }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.sniffing-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--spacing-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

</style>
