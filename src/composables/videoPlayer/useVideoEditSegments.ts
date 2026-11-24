import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useVideoEditQueue } from '@/composables/useVideoEditQueue';
import type { EditSegment } from '@/composables/videoPlayer/types';

export interface UseVideoEditSegmentsOptions {
  videoRef: Ref<HTMLVideoElement | null>;
  currentTime: Ref<number>;
  duration: Ref<number>;
  localDiskPath: ComputedRef<string | null>;
  videoTitle: ComputedRef<string>;
  releaseVideoMedia: () => void;
}

/**
 * 本地视频多区间剪辑打点、选段预览及异步队列导出控制
 */
export function useVideoEditSegments(options: UseVideoEditSegmentsOptions) {
  const { videoRef, currentTime, duration, localDiskPath, videoTitle, releaseVideoMedia } = options;
  const { enqueueTask } = useVideoEditQueue();

  const editSegments = ref<EditSegment[]>([]);
  const activeSegmentIndex = ref(0);
  const isSegmentPlaying = ref(false);
  const showOverwriteConfirm = ref(false);

  const totalEditedDuration = computed(() => {
    return editSegments.value.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
  });

  const initSegmentsIfEmpty = () => {
    if (editSegments.value.length === 0) {
      editSegments.value = [
        {
          id: 'seg_' + Date.now(),
          start: 0,
          end: duration.value > 0 ? duration.value : 10
        }
      ];
      activeSegmentIndex.value = 0;
    }
  };

  const syncInitialSegmentDuration = (dur: number) => {
    if (editSegments.value.length === 1 && editSegments.value[0].end === 10) {
      editSegments.value[0].end = dur;
    }
  };

  const resetEditSegments = () => {
    editSegments.value = [];
  };

  const stopSegmentPlaying = () => {
    isSegmentPlaying.value = false;
  };

  const checkSegmentPlaybackEnd = (curTime: number) => {
    if (isSegmentPlaying.value) {
      const seg = editSegments.value[activeSegmentIndex.value];
      if (seg && curTime >= seg.end) {
        videoRef.value?.pause();
        isSegmentPlaying.value = false;
      }
    }
  };

  const selectSegment = (idx: number) => {
    if (idx >= 0 && idx < editSegments.value.length) {
      activeSegmentIndex.value = idx;
      const seg = editSegments.value[idx];
      if (videoRef.value) {
        videoRef.value.currentTime = seg.start;
        currentTime.value = seg.start;
      }
    }
  };

  const setCurrentAsStart = () => {
    if (editSegments.value.length === 0) return;
    const seg = editSegments.value[activeSegmentIndex.value];
    if (!seg) return;
    const cur = Number((videoRef.value?.currentTime ?? currentTime.value).toFixed(2));
    const maxDur = duration.value > 0 ? duration.value : (videoRef.value?.duration || 0);

    if (cur >= seg.end) {
      seg.start = cur;
      const targetEnd = maxDur > 0 ? Math.min(maxDur, cur + 15) : cur + 15;
      seg.end = Number(Math.max(cur + 0.1, targetEnd).toFixed(2));
    } else {
      seg.start = cur;
    }
  };

  const setCurrentAsEnd = () => {
    if (editSegments.value.length === 0) return;
    const seg = editSegments.value[activeSegmentIndex.value];
    if (!seg) return;
    const cur = Number((videoRef.value?.currentTime ?? currentTime.value).toFixed(2));

    if (cur <= seg.start) {
      seg.end = cur;
      seg.start = Number(Math.max(0, cur - 15).toFixed(2));
    } else {
      seg.end = cur;
    }
  };

  const addSegment = () => {
    const cur = Number((videoRef.value?.currentTime ?? currentTime.value).toFixed(2));
    const maxDur = duration.value > 0 ? duration.value : (videoRef.value?.duration || 0);

    let newStart = cur;
    let newEnd = maxDur > 0 ? Math.min(maxDur, cur + 15) : cur + 15;
    if (maxDur > 0 && cur >= maxDur) {
      newStart = Math.max(0, maxDur - 15);
      newEnd = maxDur;
    }

    const newSeg: EditSegment = {
      id: 'seg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      start: Number(newStart.toFixed(2)),
      end: Number(newEnd.toFixed(2))
    };
    editSegments.value.push(newSeg);
    activeSegmentIndex.value = editSegments.value.length - 1;
  };

  const removeSegment = (idx: number) => {
    if (editSegments.value.length <= 1) return;
    editSegments.value.splice(idx, 1);
    if (activeSegmentIndex.value >= editSegments.value.length) {
      activeSegmentIndex.value = editSegments.value.length - 1;
    }
  };

  const togglePreviewSegment = (idx: number) => {
    if (isSegmentPlaying.value && activeSegmentIndex.value === idx) {
      isSegmentPlaying.value = false;
      videoRef.value?.pause();
      return;
    }
    selectSegment(idx);
    isSegmentPlaying.value = true;
    videoRef.value?.play().catch(() => {});
  };

  const seekToSegmentStart = () => {
    if (editSegments.value.length === 0) return;
    const seg = editSegments.value[activeSegmentIndex.value];
    if (seg && videoRef.value) {
      videoRef.value.currentTime = seg.start;
      currentTime.value = seg.start;
    }
  };

  const seekToSegmentEnd = () => {
    if (editSegments.value.length === 0) return;
    const seg = editSegments.value[activeSegmentIndex.value];
    if (seg && videoRef.value) {
      videoRef.value.currentTime = seg.end;
      currentTime.value = seg.end;
    }
  };

  const selectPrevSegment = () => {
    if (editSegments.value.length === 0) return;
    const targetIdx = Math.max(0, activeSegmentIndex.value - 1);
    selectSegment(targetIdx);
  };

  const selectNextSegment = () => {
    if (editSegments.value.length === 0) return;
    const targetIdx = Math.min(editSegments.value.length - 1, activeSegmentIndex.value + 1);
    selectSegment(targetIdx);
  };

  const startExport = (mode: 'replace' | 'saveAs', saveAsPath?: string) => {
    const disk = localDiskPath.value;
    if (!disk || !window.electronAPI?.editVideoSegments) return;

    // 覆盖导出前彻底释放当前播放器对原视频的读取流与句柄占用
    if (mode === 'replace') {
      releaseVideoMedia();
    }

    enqueueTask({
      sourcePath: disk,
      segments: editSegments.value.map(s => ({ start: s.start, end: s.end })),
      outputPath: saveAsPath,
      mode,
      title: videoTitle.value
    });
  };

  const promptConfirmOverwrite = () => {
    showOverwriteConfirm.value = true;
  };

  const executeOverwriteSave = () => {
    showOverwriteConfirm.value = false;
    startExport('replace');
  };

  const handleSaveAs = async () => {
    const disk = localDiskPath.value;
    if (!disk || !window.electronAPI?.showSaveDialog) return;

    const ext = disk.split('.').pop() || 'mp4';
    const baseName = disk.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^/.]+$/, '') || 'video';
    const defaultFileName = `${baseName}_edited.${ext}`;

    const res = await window.electronAPI.showSaveDialog({
      defaultPath: defaultFileName,
      title: '另存剪辑视频为',
      filters: [
        { name: '视频文件 (*.' + ext + ')', extensions: [ext] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!res.canceled && res.filePath) {
      startExport('saveAs', res.filePath);
    }
  };

  return {
    editSegments,
    activeSegmentIndex,
    isSegmentPlaying,
    totalEditedDuration,
    showOverwriteConfirm,
    initSegmentsIfEmpty,
    syncInitialSegmentDuration,
    resetEditSegments,
    stopSegmentPlaying,
    checkSegmentPlaybackEnd,
    selectSegment,
    setCurrentAsStart,
    setCurrentAsEnd,
    addSegment,
    removeSegment,
    togglePreviewSegment,
    seekToSegmentStart,
    seekToSegmentEnd,
    selectPrevSegment,
    selectNextSegment,
    promptConfirmOverwrite,
    executeOverwriteSave,
    handleSaveAs
  };
}
