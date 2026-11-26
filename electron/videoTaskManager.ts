import { logger } from './logger';
import {
  editVideoSegments,
  cancelVideoEdit,
  mergeVideos,
  compressVideo,
  extractAudio,
  exportVideoGif,
  EditVideoParams,
  MergeVideosParams,
  CompressVideoParams,
  ExtractAudioParams,
  ExportGifParams
} from './videoEditor';

export type VideoTaskType = 'cut' | 'merge' | 'compress' | 'extract-audio' | 'gif';

export interface VideoTaskPayload {
  cutParams?: EditVideoParams;
  mergeParams?: MergeVideosParams;
  compressParams?: CompressVideoParams;
  extractAudioParams?: ExtractAudioParams;
  gifParams?: ExportGifParams;
}

export interface VideoTaskInternal {
  id: string;
  type: VideoTaskType;
  title: string;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  statusText: string;
  error?: string;
  outputPath?: string;
  createdAt: number;
  payload: VideoTaskPayload;
  extra?: Record<string, any>;
}

export interface VideoTaskSnapshot {
  id: string;
  type: VideoTaskType;
  title: string;
  status: 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  statusText: string;
  error?: string;
  outputPath?: string;
  createdAt: number;
  extra?: Record<string, any>;
}

export interface VideoQueueState {
  activeTask: VideoTaskSnapshot | null;
  queue: VideoTaskSnapshot[];
  totalCount: number;
}

type StateChangeListener = (state: VideoQueueState) => void;
type TaskFinishCallback = (task: VideoTaskSnapshot, success: boolean, outputPath?: string) => void;

class VideoTaskManager {
  private queue: VideoTaskInternal[] = [];
  private activeTask: VideoTaskInternal | null = null;
  private listeners: Set<StateChangeListener> = new Set();
  private finishCallbacks: Set<TaskFinishCallback> = new Set();
  private throttleTimer: NodeJS.Timeout | null = null;

  public enqueueTask(params: {
    id?: string;
    type: VideoTaskType;
    title: string;
    payload: VideoTaskPayload;
    extra?: Record<string, any>;
  }): string {
    const taskId = params.id || `${params.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    // 同步设置内部 task params 中的 taskId
    if (params.type === 'cut' && params.payload.cutParams) {
      params.payload.cutParams.taskId = taskId;
    } else if (params.type === 'merge' && params.payload.mergeParams) {
      params.payload.mergeParams.taskId = taskId;
    } else if (params.type === 'compress' && params.payload.compressParams) {
      params.payload.compressParams.taskId = taskId;
    } else if (params.type === 'extract-audio' && params.payload.extractAudioParams) {
      params.payload.extractAudioParams.taskId = taskId;
    } else if (params.type === 'gif' && params.payload.gifParams) {
      params.payload.gifParams.taskId = taskId;
    }

    const task: VideoTaskInternal = {
      id: taskId,
      type: params.type,
      title: params.title || '视频处理任务',
      status: 'waiting',
      progress: 0,
      statusText: '等待处理中...',
      createdAt: Date.now(),
      payload: params.payload,
      extra: params.extra || {}
    };

    this.queue.push(task);
    logger.info('VideoTaskManager', `Task enqueued: ${taskId} (${task.title}), queue length: ${this.queue.length}`);
    this.notifyStateChange();
    this.scheduleNext();
    return taskId;
  }

  public cancelTask(taskId: string): boolean {
    logger.info('VideoTaskManager', `Cancel requested for task: ${taskId}`);

    // 1. 如果是正在运行的任务
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask.status = 'cancelled';
      this.activeTask.statusText = '正在取消任务...';
      cancelVideoEdit(taskId);
      this.notifyStateChange();

      // 保底超时处理：若底层转码未在 2.5 秒内退出，强制解挂并轮转下一任务
      const currentActiveId = taskId;
      setTimeout(() => {
        if (this.activeTask && this.activeTask.id === currentActiveId) {
          logger.warn('VideoTaskManager', `Forcing release of hung active task: ${currentActiveId}`);
          const finishedSnapshot = this.toSnapshot(this.activeTask);
          this.activeTask = null;
          this.notifyStateChange();
          this.emitFinish(finishedSnapshot, false);
          this.scheduleNext();
        }
      }, 2500);

      return true;
    }

    // 2. 如果是在排队中的等待任务
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      const removed = this.queue.splice(idx, 1)[0];
      removed.status = 'cancelled';
      logger.info('VideoTaskManager', `Removed pending task from queue: ${taskId}`);
      this.notifyStateChange();
      this.emitFinish(this.toSnapshot(removed), false);
      return true;
    }

    return false;
  }

  public getQueueState(): VideoQueueState {
    return {
      activeTask: this.activeTask ? this.toSnapshot(this.activeTask) : null,
      queue: this.queue.map((t) => this.toSnapshot(t)),
      totalCount: (this.activeTask ? 1 : 0) + this.queue.length
    };
  }

  public onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onTaskFinish(callback: TaskFinishCallback): () => void {
    this.finishCallbacks.add(callback);
    return () => {
      this.finishCallbacks.delete(callback);
    };
  }

  private emitFinish(task: VideoTaskSnapshot, success: boolean, outputPath?: string) {
    this.finishCallbacks.forEach((cb) => {
      try {
        cb(task, success, outputPath);
      } catch (err: any) {
        logger.error('VideoTaskManager', `Finish callback error: ${err.message}`);
      }
    });
  }

  private notifyStateChange(immediate = false) {
    if (immediate) {
      if (this.throttleTimer) {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
      }
      this.broadcastState();
      return;
    }

    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.broadcastState();
    }, 80);
  }

  private broadcastState() {
    const state = this.getQueueState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err: any) {
        logger.error('VideoTaskManager', `State listener error: ${err.message}`);
      }
    });
  }

  private toSnapshot(task: VideoTaskInternal): VideoTaskSnapshot {
    return {
      id: task.id,
      type: task.type,
      title: task.title,
      status: task.status,
      progress: task.progress,
      statusText: task.statusText,
      error: task.error,
      outputPath: task.outputPath,
      createdAt: task.createdAt,
      extra: task.extra
    };
  }

  private async scheduleNext() {
    if (this.activeTask) {
      return; // 严格单任务串行
    }

    if (this.queue.length === 0) {
      this.notifyStateChange(true);
      return;
    }

    const nextTask = this.queue.shift()!;
    nextTask.status = 'running';
    nextTask.statusText = '准备启动任务...';
    nextTask.progress = 0;
    this.activeTask = nextTask;
    this.notifyStateChange(true);

    logger.info('VideoTaskManager', `Starting execution of task: ${nextTask.id} (${nextTask.type})`);

    try {
      if (nextTask.type === 'cut') {
        const cutParams = nextTask.payload.cutParams;
        if (!cutParams) throw new Error('剪辑任务缺少参数');

        const result = await editVideoSegments(cutParams, (percent, text) => {
          if (this.activeTask && this.activeTask.id === nextTask.id && this.activeTask.status !== 'cancelled') {
            this.activeTask.progress = percent;
            this.activeTask.statusText = text;
            this.notifyStateChange(false);
          }
        });

        this.handleTaskResult(nextTask, result);
      } else if (nextTask.type === 'merge') {
        const mergeParams = nextTask.payload.mergeParams;
        if (!mergeParams) throw new Error('合并任务缺少参数');

        const result = await mergeVideos(mergeParams, (percent, text) => {
          if (this.activeTask && this.activeTask.id === nextTask.id && this.activeTask.status !== 'cancelled') {
            this.activeTask.progress = percent;
            this.activeTask.statusText = text;
            this.notifyStateChange(false);
          }
        });

        this.handleTaskResult(nextTask, result);
      } else if (nextTask.type === 'compress') {
        const compressParams = nextTask.payload.compressParams;
        if (!compressParams) throw new Error('压缩任务缺少参数');

        const result = await compressVideo(compressParams, (percent, text) => {
          if (this.activeTask && this.activeTask.id === nextTask.id && this.activeTask.status !== 'cancelled') {
            this.activeTask.progress = percent;
            this.activeTask.statusText = text;
            this.notifyStateChange(false);
          }
        });

        this.handleTaskResult(nextTask, result);
      } else if (nextTask.type === 'extract-audio') {
        const extractAudioParams = nextTask.payload.extractAudioParams;
        if (!extractAudioParams) throw new Error('提取音频任务缺少参数');

        const result = await extractAudio(extractAudioParams, (percent, text) => {
          if (this.activeTask && this.activeTask.id === nextTask.id && this.activeTask.status !== 'cancelled') {
            this.activeTask.progress = percent;
            this.activeTask.statusText = text;
            this.notifyStateChange(false);
          }
        });

        this.handleTaskResult(nextTask, result);
      } else if (nextTask.type === 'gif') {
        const gifParams = nextTask.payload.gifParams;
        if (!gifParams) throw new Error('导出 GIF 任务缺少参数');

        const result = await exportVideoGif(gifParams, (percent, text) => {
          if (this.activeTask && this.activeTask.id === nextTask.id && this.activeTask.status !== 'cancelled') {
            this.activeTask.progress = percent;
            this.activeTask.statusText = text;
            this.notifyStateChange(false);
          }
        });

        this.handleTaskResult(nextTask, result);
      }
    } catch (err: any) {
      logger.error('VideoTaskManager', `Task runtime error: ${err.message}`);
      this.handleTaskResult(nextTask, { success: false, error: err.message || '任务执行异常' });
    }
  }

  private handleTaskResult(task: VideoTaskInternal, result: { success: boolean; outputPath?: string; error?: string }) {
    const isCancelled = task.status === 'cancelled' || result.error === '操作已取消';
    if (result.success) {
      task.status = 'completed';
      task.progress = 100;
      task.statusText = '处理完成';
      task.outputPath = result.outputPath;
    } else if (isCancelled) {
      task.status = 'cancelled';
      task.statusText = '已取消';
    } else {
      task.status = 'failed';
      task.error = result.error || '处理失败';
      task.statusText = result.error || '处理失败';
    }

    const finishedSnapshot = this.toSnapshot(task);
    this.activeTask = null;
    this.notifyStateChange(true);
    this.emitFinish(finishedSnapshot, result.success, result.outputPath);

    // 调度执行下一个任务
    setImmediate(() => {
      this.scheduleNext();
    });
  }
}

export const videoTaskManager = new VideoTaskManager();
