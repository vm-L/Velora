<template>
  <svg
    :width="computedSize"
    :height="computedSize"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth || 2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="v-icon"
    :style="iconStyle"
    v-html="svgContent"
  ></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  name: IconName;
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
}>();

export type IconName =
  | 'magic'
  | 'js'
  | 'css'
  | 'pick-image'
  | 'copy-text'
  | 'video-sniffer'
  | 'audio-sniffer'
  | 'drag-handle'
  | 'close'
  | 'plus'
  | 'trash'
  | 'edit'
  | 'chevron-down'
  | 'check'
  | 'search'
  | 'settings'
  | 'folder'
  | 'file'
  | 'download'
  | 'play'
  | 'pause'
  | 'refresh'
  | 'maximize'
  | 'minimize'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'loading';

const computedSize = computed(() => props.size ?? 16);

const iconStyle = computed(() => {
  return props.color ? { color: props.color } : {};
});

const iconsMap: Record<string, string> = {
  // 魔法棒 (解析规则 / 解析页面)
  'magic': `
    <line x1="20" y1="20" x2="10" y2="10"></line>
    <line x1="13" y1="13" x2="10" y2="10" stroke-width="3"></line>
    <path d="M7 1l1.2 2.3L10.5 4.5L8.2 5.7L7 8l-1.2-2.3L3.5 4.5l2.3-1.2z" fill="currentColor" stroke="none"></path>
    <path d="M3 12v3M1.5 13.5h3" stroke-width="1.5"></path>
    <path d="M16 3v3M14.5 4.5h3" stroke-width="1.5"></path>
  `,

  // JS 注入
  'js': `
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="currentColor" stroke="none">JS</text>
  `,

  // CSS 样式注入
  'css': `
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="currentColor" stroke="none">CSS</text>
  `,

  // 捕获图片
  'pick-image': `
    <polygon points="3 3 7 12 9 9 12 7 3 3" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></polygon>
    <rect x="11" y="12" width="11" height="9" rx="1.5" ry="1.5" stroke="currentColor" stroke-width="2" fill="none"></rect>
    <circle cx="14" cy="15" r="0.5" fill="currentColor" stroke="none"></circle>
    <path d="M11 19l3-3l2.5 2.5l2.5-3.5l2 2" stroke="currentColor" stroke-width="2" fill="none"></path>
  `,

  // 复制文本
  'copy-text': `
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  `,

  // 视频嗅探器
  'video-sniffer': `
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
    <line x1="7" y1="2" x2="7" y2="22"></line>
    <line x1="17" y1="2" x2="17" y2="22"></line>
    <line x1="2" y1="12" x2="22" y2="12"></line>
    <line x1="2" y1="7" x2="7" y2="7"></line>
    <line x1="2" y1="17" x2="7" y2="17"></line>
    <line x1="17" y1="17" x2="22" y2="17"></line>
    <line x1="17" y1="7" x2="22" y2="7"></line>
  `,

  // 音频嗅探器
  'audio-sniffer': `
    <path d="M9 18V5l12-2v13"></path>
    <circle cx="6" cy="18" r="3"></circle>
    <circle cx="18" cy="16" r="3"></circle>
  `,

  // 拖拽 Handle (6点矩阵)
  'drag-handle': `
    <circle cx="9" cy="5" r="1.2" fill="currentColor"></circle>
    <circle cx="15" cy="5" r="1.2" fill="currentColor"></circle>
    <circle cx="9" cy="12" r="1.2" fill="currentColor"></circle>
    <circle cx="15" cy="12" r="1.2" fill="currentColor"></circle>
    <circle cx="9" cy="19" r="1.2" fill="currentColor"></circle>
    <circle cx="15" cy="19" r="1.2" fill="currentColor"></circle>
  `,

  // 关闭 / X
  'close': `
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  `,

  // 加号 / 新增
  'plus': `
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  `,

  // 删除 / 垃圾桶
  'trash': `
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  `,

  // 编辑 / 铅笔
  'edit': `
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  `,

  // 下拉箭头
  'chevron-down': `
    <polyline points="6 9 12 15 18 9"></polyline>
  `,

  // 对勾
  'check': `
    <polyline points="20 6 9 17 4 12"></polyline>
  `,

  // 搜索
  'search': `
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  `,

  // 设置 / 齿轮
  'settings': `
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  `,

  // 文件夹
  'folder': `
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  `,

  // 文件
  'file': `
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
    <polyline points="13 2 13 9 20 9"></polyline>
  `,

  // 下载
  'download': `
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  `,

  // 播放
  'play': `
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>
  `,

  // 暂停
  'pause': `
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  `,

  // 刷新 / 同步
  'refresh': `
    <polyline points="23 4 23 10 17 10"></polyline>
    <polyline points="1 20 1 14 7 14"></polyline>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  `,

  // 最大化
  'maximize': `
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
  `,

  // 最小化
  'minimize': `
    <line x1="5" y1="12" x2="19" y2="12"></line>
  `,

  // 提示信息 (Info - 居中信息圆标)
  'info': `
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  `,

  // 成功 (Success - 对勾圆环)
  'success': `
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  `,

  // 警告 (Warning - 三角形感叹号)
  'warning': `
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  `,

  // 错误 (Error - 叉号圆环)
  'error': `
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="15" y1="9" x2="9" y2="15"></line>
    <line x1="9" y1="9" x2="15" y2="15"></line>
  `,

  // 加载中 (Loading - 径向转圈)
  'loading': `
    <line x1="12" y1="2" x2="12" y2="6"></line>
    <line x1="12" y1="18" x2="12" y2="22"></line>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
    <line x1="2" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="22" y2="12"></line>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
  `
};

const svgContent = computed(() => {
  return iconsMap[props.name] || '';
});
</script>

<style scoped>
.v-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  user-select: none;
}
</style>
