export const DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT = 0;
export const MIN_VIDEO_COMPRESS_SPEED_LIMIT = 1;
export const MAX_VIDEO_COMPRESS_SPEED_LIMIT = 32;

export const LEGACY_SPEED_PRESET_MAP: Record<string, number> = {
  low: 2,
  balanced: 4,
  fast: 8,
  unlimited: 0
};

const UNLIMITED_ALIASES = new Set([
  '',
  '0',
  '0x',
  'unlimited',
  '全速',
  '不限',
  '不限速',
  '全速 (不限)',
  '全速（不限）'
]);

export interface SpeedLimitParseResult {
  valid: boolean;
  value: number;
  clamped?: boolean;
}

/**
 * 将原始倍速配置（含旧版预设档位与倍速字符串）规范化为整数倍速（0 表示全速，1~32 表示限速倍速）
 */
export function normalizeVideoCompressSpeedLimit(
  raw: unknown,
  fallback: number = DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT
): number {
  if (raw === null || raw === undefined) {
    return fallback;
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return fallback;
    }
    if (raw <= 0) {
      return 0;
    }
    return Math.min(
      MAX_VIDEO_COMPRESS_SPEED_LIMIT,
      Math.max(MIN_VIDEO_COMPRESS_SPEED_LIMIT, Math.round(raw))
    );
  }

  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (UNLIMITED_ALIASES.has(normalized)) {
      return 0;
    }
    if (Object.prototype.hasOwnProperty.call(LEGACY_SPEED_PRESET_MAP, normalized)) {
      return LEGACY_SPEED_PRESET_MAP[normalized];
    }
    const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)x?$/);
    if (match) {
      const num = Number(match[1]);
      if (!Number.isFinite(num)) {
        return fallback;
      }
      if (num <= 0) {
        return 0;
      }
      return Math.min(
        MAX_VIDEO_COMPRESS_SPEED_LIMIT,
        Math.max(MIN_VIDEO_COMPRESS_SPEED_LIMIT, Math.round(num))
      );
    }
    return fallback;
  }

  return fallback;
}

/**
 * 解析并迁移配置对象中的视频压缩速度限制（优先读取新字段，缺失时兼容旧预设字段）
 */
export function resolveVideoCompressSpeedLimit(
  settings: { videoCompressSpeedLimit?: unknown; videoCompressSpeedPreset?: unknown },
  fallback: number = DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT
): number {
  const { videoCompressSpeedLimit, videoCompressSpeedPreset } = settings;
  if (
    videoCompressSpeedLimit !== undefined &&
    videoCompressSpeedLimit !== null &&
    videoCompressSpeedLimit !== ''
  ) {
    return normalizeVideoCompressSpeedLimit(videoCompressSpeedLimit, fallback);
  }
  if (videoCompressSpeedPreset !== undefined) {
    return normalizeVideoCompressSpeedLimit(videoCompressSpeedPreset, fallback);
  }
  return fallback;
}

/**
 * 解析用户在输入框或下拉选择中的速度限制输入
 * 仅允许 1~32 的整数（可带 x/X 后缀），留空、0 或全速别名均解析为 0（全速）
 */
export function parseSpeedLimitInput(raw: string): SpeedLimitParseResult {
  const trimmed = String(raw ?? '').trim().toLowerCase();
  if (UNLIMITED_ALIASES.has(trimmed)) {
    return { valid: true, value: 0 };
  }
  if (Object.prototype.hasOwnProperty.call(LEGACY_SPEED_PRESET_MAP, trimmed)) {
    return { valid: true, value: LEGACY_SPEED_PRESET_MAP[trimmed] };
  }
  const match = trimmed.match(/^(\d+)x?$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num === 0) {
      return { valid: true, value: 0 };
    }
    if (!Number.isFinite(num) || num > MAX_VIDEO_COMPRESS_SPEED_LIMIT) {
      return { valid: true, value: MAX_VIDEO_COMPRESS_SPEED_LIMIT, clamped: true };
    }
    return { valid: true, value: num };
  }
  return { valid: false, value: DEFAULT_VIDEO_COMPRESS_SPEED_LIMIT };
}

/**
 * 将规范化的速度限制数值格式化为输入框展示文本
 */
export function formatSpeedLimitDisplay(limit: number): string {
  const normalized = normalizeVideoCompressSpeedLimit(limit);
  return normalized > 0 ? `${normalized}x` : '全速';
}
