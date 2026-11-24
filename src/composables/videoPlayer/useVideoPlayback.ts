import { ref, computed, watch, type Ref } from 'vue';
import { logger } from '@/services/logger';
import { getLocalDiskPath } from '@/composables/videoPlayer/types';

export interface UseVideoPlaybackOptions {
  url: () => string | null;
  pageUrl: () => string | undefined;
  videoRef: Ref<HTMLVideoElement | null>;
  isAudioMode: Ref<boolean>;
  isEditingMode: Ref<boolean>;
  isMouseInVideoArea: Ref<boolean>;
  showControls: Ref<boolean>;
  resetControlsTimeout: () => void;
  applyMetadataWindowSize: (vw: number, vh: number) => void;
  onTimeUpdateSegmentCheck: (curTime: number) => void;
  onMetadataDurationReady: (dur: number) => void;
  onPlaybackStopped: () => void;
}

/**
 * 视频播放内核管理（HLS/直链/本地流加载、Referer 会话注册、播放进度/音量/倍速/画中画控制）
 */
export function useVideoPlayback(options: UseVideoPlaybackOptions) {
  const {
    url,
    pageUrl,
    videoRef,
    isAudioMode,
    isEditingMode,
    isMouseInVideoArea,
    showControls,
    resetControlsTimeout,
    applyMetadataWindowSize,
    onTimeUpdateSegmentCheck,
    onMetadataDurationReady,
    onPlaybackStopped
  } = options;

  const previewClientId = 'preview_video_' + Math.random().toString(36).slice(2);
  const effectiveReferer = computed(() => (pageUrl() || '').trim());

  watch(() => [url(), effectiveReferer.value], ([u, p]) => {
    if (p && window.electronAPI && window.electronAPI.createMediaClient) {
      window.electronAPI.createMediaClient({ clientId: previewClientId, referer: p });
    }
    if (u && p && window.electronAPI && window.electronAPI.setMediaReferer) {
      window.electronAPI.setMediaReferer(u, p);
    }
  }, { immediate: true });

  const cleanupMediaClient = () => {
    if (window.electronAPI && window.electronAPI.destroyMediaClient) {
      window.electronAPI.destroyMediaClient(previewClientId);
    }
  };

  const playerSessionKey = ref(Date.now());
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const playbackRate = ref(1);
  const volume = ref(1);
  const isMuted = ref(false);
  const isDragging = ref(false);
  const isPip = ref(false);
  const supportsPip = ref(false);
  const showVolume = ref(false);
  const videoRatio = ref<number | null>(null);

  let hls: any = null;

  const localDiskPath = computed(() => getLocalDiskPath(url()));
  const isLocalVideo = computed(() => !!localDiskPath.value);

  const videoTitle = computed(() => {
    const disk = localDiskPath.value;
    if (disk) {
      const parts = disk.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] || '本地视频';
    }
    const raw = url();
    if (raw) {
      try {
        const u = new URL(raw);
        const pathname = u.pathname.split('/').pop();
        return pathname || '视频播放器';
      } catch {
        return '视频播放器';
      }
    }
    return '视频播放器';
  });

  const releaseVideoMedia = () => {
    if (videoRef.value) {
      try {
        videoRef.value.pause();
        videoRef.value.removeAttribute('src');
        videoRef.value.load();
      } catch {}
    }
    if (hls) {
      try {
        hls.destroy();
      } catch {}
      hls = null;
    }
  };

  const formatMediaSrc = (rawUrl: string): string => {
    if (!rawUrl) return '';
    let cleanPath = rawUrl.trim().replace(/\\/g, '/');

    if (/^(http:\/\/|https:\/\/|blob:|data:)/i.test(cleanPath)) {
      return cleanPath;
    }

    if (cleanPath.startsWith('velora://local/')) {
      cleanPath = decodeURIComponent(cleanPath.slice('velora://local/'.length));
    }

    const port = window.__SERVER_PORT__ || 0;
    const token = window.__SERVER_TOKEN__ || '';
    return `http://127.0.0.1:${port}/stream?path=${encodeURIComponent(cleanPath)}&_v=${playerSessionKey.value}&token=${encodeURIComponent(token)}`;
  };

  const loadVideo = async () => {
    const rawUrl = url();
    if (!videoRef.value || !rawUrl) return;
    if ((!window.__SERVER_PORT__ || !window.__SERVER_TOKEN__) && window.electronAPI?.getServerInfo && !/^(http:\/\/|https:\/\/|blob:|data:)/i.test(rawUrl.trim())) {
      try {
        const info = await window.electronAPI.getServerInfo();
        if (info?.port) window.__SERVER_PORT__ = info.port;
        if (info?.token) window.__SERVER_TOKEN__ = info.token;
      } catch {}
    }
    const video = videoRef.value;
    const playUrl = formatMediaSrc(rawUrl);

    if (hls) {
      hls.destroy();
      hls = null;
    }

    const checkM3U8Content = async (targetUrl: string): Promise<boolean> => {
      if (!targetUrl) return false;
      if (targetUrl.includes('127.0.0.1:') || targetUrl.includes('localhost:') || /^\/|^[a-zA-Z]:[\\/]/i.test(targetUrl)) {
        return false;
      }
      if (/\.(mp4|webm|mkv|avi|flv|mp3|wav|ogg|aac|png|jpe?g|webp)$/i.test(targetUrl.split('?')[0])) {
        return false;
      }

      try {
        const res = await fetch(targetUrl, {
          headers: {
            'X-Velora-Client-Id': previewClientId,
            'Range': 'bytes=0-512',
            ...(effectiveReferer.value ? { 'X-Velora-Referer': effectiveReferer.value } : {})
          }
        });
        if (!res.ok && res.status !== 206) return false;
        const reader = res.body?.getReader();
        if (!reader) return false;
        const { value } = await reader.read();
        reader.cancel();
        if (!value) return false;
        const text = new TextDecoder().decode(value);
        return text.includes('#EXTM3U');
      } catch {
        return false;
      }
    };

    const isM3U8 = playUrl.toLowerCase().includes('.m3u8') || await checkM3U8Content(playUrl);

    if (isM3U8) {
      try {
        const HlsModule = await import('hls.js');
        const Hls = HlsModule.default || HlsModule;
        if (Hls.isSupported()) {
          hls = new Hls({
            autoStartLoad: true,
            startPosition: -1,
            capLevelToPlayerSize: false,
            fetchSetup: (context: any, initParams: any) => {
              initParams.headers = {
                ...(initParams.headers || {}),
                'X-Velora-Client-Id': previewClientId,
                ...(effectiveReferer.value ? { 'X-Velora-Referer': effectiveReferer.value } : {})
              };
              return new Request(context.url, initParams);
            }
          });

          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            const msg = `HLS Error: ${data.type} - ${data.details} (fatal: ${data.fatal})`;
            logger.error('VideoPreview', msg);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls?.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls?.recoverMediaError();
                  break;
                default:
                  hls?.destroy();
                  if (video) {
                    video.src = playUrl;
                    video.play().catch(() => {});
                  }
                  break;
              }
            }
          });

          hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: any) => {
            let maxLevel = -1;
            let maxBitrate = -1;
            if (data && data.levels) {
              for (let i = 0; i < data.levels.length; i++) {
                if (data.levels[i].bitrate > maxBitrate) {
                  maxBitrate = data.levels[i].bitrate;
                  maxLevel = i;
                }
              }
            }
            if (maxLevel !== -1 && hls) {
              hls.currentLevel = maxLevel;
              logger.info('VideoPreview', `Locked to highest HLS quality level ${maxLevel} (${maxBitrate} bps)`);
            }
            video.play().catch(() => {});
          });

          hls.loadSource(playUrl);
          hls.attachMedia(video);
        } else {
          video.src = playUrl;
          video.play().catch(() => {});
        }
      } catch {
        video.src = playUrl;
        video.play().catch(() => {});
      }
    } else {
      video.src = playUrl;
      video.play().catch(() => {});
    }
  };

  const togglePlay = () => {
    if (!videoRef.value) return;
    if (isPlaying.value) {
      videoRef.value.pause();
      onPlaybackStopped();
    } else {
      videoRef.value.play().catch(() => {});
    }
  };

  const onTimeUpdate = () => {
    if (!isDragging.value && videoRef.value) {
      currentTime.value = videoRef.value.currentTime;
      onTimeUpdateSegmentCheck(currentTime.value);
    }
  };

  const onVideoEnded = () => {
    isPlaying.value = false;
    onPlaybackStopped();
  };

  const onLoadedMetadata = () => {
    if (videoRef.value) {
      duration.value = videoRef.value.duration;
      onMetadataDurationReady(duration.value);

      const vw = videoRef.value.videoWidth;
      const vh = videoRef.value.videoHeight;

      if (vw && vh && !isAudioMode.value && !isEditingMode.value) {
        videoRatio.value = vw / vh;
        applyMetadataWindowSize(vw, vh);
      }
    }
  };

  const onSeek = (e: Event) => {
    isDragging.value = true;
    const val = Number((e.target as HTMLInputElement).value);
    currentTime.value = val;
    if (videoRef.value) {
      videoRef.value.currentTime = val;
    }
  };

  const onSeekEnd = (e: Event) => {
    isDragging.value = false;
    const val = Number((e.target as HTMLInputElement).value);
    if (videoRef.value && Math.abs(videoRef.value.currentTime - val) > 0.3) {
      videoRef.value.currentTime = val;
    }
    if (!isMouseInVideoArea.value) {
      showControls.value = false;
    } else {
      resetControlsTimeout();
    }
  };

  const onSpeedChange = () => {
    if (videoRef.value) {
      videoRef.value.playbackRate = playbackRate.value;
    }
  };

  const toggleMute = () => {
    if (!videoRef.value) return;
    videoRef.value.muted = !videoRef.value.muted;
    isMuted.value = videoRef.value.muted;
    if (!isMuted.value && volume.value === 0) {
      volume.value = 1;
      videoRef.value.volume = 1;
    }
  };

  const onVolumeChange = () => {
    if (videoRef.value) {
      volume.value = videoRef.value.volume;
      isMuted.value = videoRef.value.muted;
    }
  };

  const onVolumeSlider = (e: Event) => {
    if (videoRef.value) {
      const val = Number((e.target as HTMLInputElement).value);
      videoRef.value.volume = val;
      if (val > 0) {
        videoRef.value.muted = false;
        isMuted.value = false;
      }
    }
  };

  const onVideoError = (e: Event) => {
    const target = e.target as HTMLVideoElement;
    logger.error('VideoPreview', `Native Video Error: ${target.error?.message || 'unknown'}`);
  };

  const togglePip = async () => {
    if (!videoRef.value) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.value.requestPictureInPicture();
      }
    } catch (error) {
      logger.error('VideoPreview', 'PiP failed: ' + error);
    }
  };

  const seekBy = (delta: number) => {
    if (!videoRef.value) return;
    const maxDur = duration.value || videoRef.value.duration || 0;
    const newTime = Math.max(0, Math.min(maxDur, videoRef.value.currentTime + delta));
    videoRef.value.currentTime = newTime;
    currentTime.value = newTime;
    if (isMouseInVideoArea.value) {
      resetControlsTimeout();
    }
  };

  const changeVolume = (delta: number) => {
    if (!videoRef.value) return;
    const newVol = Math.max(0, Math.min(1, Number((volume.value + delta).toFixed(2))));
    videoRef.value.volume = newVol;
    volume.value = newVol;
    if (newVol > 0 && isMuted.value) {
      videoRef.value.muted = false;
      isMuted.value = false;
    }
    showVolume.value = true;
    resetControlsTimeout();
  };

  return {
    playerSessionKey,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    isDragging,
    isPip,
    supportsPip,
    showVolume,
    videoRatio,
    localDiskPath,
    isLocalVideo,
    videoTitle,
    releaseVideoMedia,
    loadVideo,
    togglePlay,
    onTimeUpdate,
    onVideoEnded,
    onLoadedMetadata,
    onSeek,
    onSeekEnd,
    onSpeedChange,
    toggleMute,
    onVolumeChange,
    onVolumeSlider,
    onVideoError,
    togglePip,
    seekBy,
    changeVolume,
    cleanupMediaClient
  };
}
