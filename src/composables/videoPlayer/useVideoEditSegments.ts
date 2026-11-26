import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useVideoEditQueue } from '@/composables/useVideoEditQueue';
import { useMessage } from '@/composables/useMessage';
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
  const { enqueueTask, enqueueGifTask } = useVideoEditQueue();
  const { showMessage } = useMessage();

  const editSegments = ref<EditSegment[]>([]);
  const activeSegmentIndex = ref(0);
  const isSegmentPlaying = ref(false);

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

  const moveSegment = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (idx < 0 || idx >= editSegments.value.length || target < 0 || target >= editSegments.value.length) return;
    const [item] = editSegments.value.splice(idx, 1);
    editSegments.value.splice(target, 0, item);
    if (activeSegmentIndex.value === idx) {
      activeSegmentIndex.value = target;
    } else if (activeSegmentIndex.value === target) {
      activeSegmentIndex.value = idx;
    }
  };

  const updateSegmentTime = (idx: number, field: 'start' | 'end', sec: number): boolean => {
    const seg = editSegments.value[idx];
    if (!seg || isNaN(sec) || sec < 0) return false;
    const maxDur = duration.value > 0 ? duration.value : (videoRef.value?.duration || 0);
    const clamped = maxDur > 0 ? Math.min(maxDur, sec) : sec;
    const rounded = Number(clamped.toFixed(2));
    if (field === 'start') {
      if (rounded >= seg.end - 0.1) return false;
      seg.start = rounded;
      return true;
    } else {
      if (rounded <= seg.start + 0.1) return false;
      seg.end = rounded;
      return true;
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

  const handleExportGif = async () => {
    const disk = localDiskPath.value;
    if (!disk || !window.electronAPI?.showSaveDialog) return;

    const seg = editSegments.value[activeSegmentIndex.value];
    if (!seg || seg.end <= seg.start + 0.1) {
      showMessage('请先标记有效的剪辑选段', 'warning');
      return;
    }

    const clipDur = seg.end - seg.start;
    if (clipDur > 60) {
      showMessage(`单段 GIF 时长不能超过 60 秒（当前 ${clipDur.toFixed(1)} 秒），请缩短选段`, 'warning');
      return;
    }

    const baseName = disk.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^/.]+$/, '') || 'video';
    const defaultFileName = `${baseName}_clip.gif`;

    const res = await window.electronAPI.showSaveDialog({
      defaultPath: defaultFileName,
      title: '导出选中片段为 GIF',
      filters: [
        { name: 'GIF 动图 (*.gif)', extensions: ['gif'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!res.canceled && res.filePath) {
      await enqueueGifTask({
        sourcePath: disk,
        start: seg.start,
        end: seg.end,
        outputPath: res.filePath,
        title: `导出 GIF: ${res.filePath.split(/[/\\]/).pop() || defaultFileName}`
      });
    }
  };

  return {
    editSegments,
    activeSegmentIndex,
    isSegmentPlaying,
    totalEditedDuration,
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
    moveSegment,
    updateSegmentTime,
    togglePreviewSegment,
    seekToSegmentStart,
    seekToSegmentEnd,
    selectPrevSegment,
    selectNextSegment,
    startExport,
    handleExportGif
  };
}
