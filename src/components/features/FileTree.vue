<template>
  <div class="file-tree-container">
    <div v-if="treeData.length === 0" class="file-tree-empty">
      暂无文件信息
    </div>
    <div v-else class="file-tree-list">
      <div
        v-for="node in flattenedNodes"
        :key="node.id"
        class="file-tree-node"
        :style="{ paddingLeft: `${node.depth * 20 + 8}px` }"
        @click="handleNodeRowClick(node)"
      >
        <!-- 展开/折叠箭头（仅目录） -->
        <span
          v-if="node.isDirectory"
          class="expand-icon"
          @click.stop="toggleExpand(node)"
        >
          <VIcon
            :name="node.expanded ? 'chevron-down' : 'chevron-right'"
            :size="14"
          />
        </span>
        <span v-else class="expand-placeholder"></span>

        <!-- 复选框 -->
        <div class="checkbox-wrap" @click.stop>
          <VCheckbox
            class="node-checkbox"
            :checked="isNodeChecked(node)"
            :indeterminate="isNodeIndeterminate(node)"
            @change="onNodeCheckChange(node, $event)"
          />
        </div>

        <!-- 图标 -->
        <span class="node-icon" @click.stop="node.isDirectory ? toggleExpand(node) : handleNodeRowClick(node)">
          <VIcon :name="getNodeIcon(node)" :size="16" />
        </span>

        <!-- 文件/目录名 -->
        <span
          class="node-name"
          :title="node.path"
        >
          {{ node.name }}
        </span>

        <!-- 在线预览按钮（音视频文件） -->
        <VButton
          v-if="previewable && isNodePreviewable(node)"
          variant="icon"
          class="node-preview-btn"
          :loading="previewLoadingIndex === node.fileIndex"
          :disabled="previewLoadingIndex !== null && previewLoadingIndex !== node.fileIndex"
          @click.stop="onNodePreview(node)"
          title="在线预览"
        >
          <VIcon name="play" :size="13" />
        </VButton>

        <!-- 大小 -->
        <span class="node-size">
          {{ formatBytes(node.size) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import VButton from '@/components/base/VButton.vue';
import VIcon from '@/components/base/VIcon.vue';
import VCheckbox from '@/components/base/VCheckbox.vue';
import type { IconName } from '@/components/base/VIcon.vue';

export interface RawFileInfo {
  name: string;
  path: string;
  size: number;
}

interface InternalTreeNode {
  id: string;
  name: string;
  path: string;
  depth: number;
  isDirectory: boolean;
  size: number;
  fileIndex?: number;
  expanded: boolean;
  children: InternalTreeNode[];
  fileIndices: number[]; // 包含的所有子文件索引
}

const props = withDefaults(defineProps<{
  files: RawFileInfo[];
  modelValue: number[];
  previewable?: boolean;
  previewLoadingIndex?: number | null;
}>(), {
  previewable: false,
  previewLoadingIndex: null
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number[]): void;
  (e: 'preview', fileIndex: number): void;
}>();

const expandedMap = ref<Record<string, boolean>>({});
const selectedSet = computed(() => new Set(props.modelValue));

// 构建树形结构
const treeData = computed<InternalTreeNode[]>(() => {
  if (!props.files || props.files.length === 0) return [];

  const rootNodes: InternalTreeNode[] = [];
  const map: Record<string, InternalTreeNode> = {};

  props.files.forEach((file, index) => {
    // 统一将反斜杠替换为正斜杠，并去除首尾斜杠
    const normPath = (file.path || file.name).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const parts = normPath.split('/');

    let currentPath = '';
    let parentChildren = rootNodes;

    parts.forEach((part, depth) => {
      const isFile = depth === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!map[currentPath]) {
        const node: InternalTreeNode = {
          id: currentPath,
          name: part,
          path: currentPath,
          depth,
          isDirectory: !isFile,
          size: isFile ? file.size : 0,
          fileIndex: isFile ? index : undefined,
          expanded: expandedMap.value[currentPath] ?? true,
          children: [],
          fileIndices: isFile ? [index] : []
        };
        map[currentPath] = node;
        parentChildren.push(node);
      } else {
        if (isFile) {
          map[currentPath].fileIndex = index;
          map[currentPath].size = file.size;
        }
        if (!map[currentPath].fileIndices.includes(index)) {
          map[currentPath].fileIndices.push(index);
        }
      }

      // 向上回溯累加目录的 size 和 fileIndices
      let parentPath = '';
      for (let i = 0; i < depth; i++) {
        parentPath = parentPath ? `${parentPath}/${parts[i]}` : parts[i];
        if (map[parentPath]) {
          if (!map[parentPath].fileIndices.includes(index)) {
            map[parentPath].fileIndices.push(index);
          }
          if (isFile) {
            map[parentPath].size += file.size;
          }
        }
      }

      parentChildren = map[currentPath].children;
    });
  });

  return rootNodes;
});

// 树扁平化展开展示
const flattenedNodes = computed(() => {
  const list: InternalTreeNode[] = [];

  function traverse(nodes: InternalTreeNode[]) {
    for (const node of nodes) {
      list.push(node);
      if (node.isDirectory && node.expanded && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(treeData.value);
  return list;
});

const toggleExpand = (node: InternalTreeNode) => {
  node.expanded = !node.expanded;
  expandedMap.value[node.id] = node.expanded;
};

const handleNodeRowClick = (node: InternalTreeNode) => {
  if (node.isDirectory) {
    toggleExpand(node);
  } else {
    const checked = isNodeChecked(node);
    onNodeCheckChange(node, !checked);
  }
};

// 检查节点勾选状态
const isNodeChecked = (node: InternalTreeNode): boolean => {
  if (node.fileIndices.length === 0) return false;
  return node.fileIndices.every(idx => selectedSet.value.has(idx));
};

// 检查目录半选状态
const isNodeIndeterminate = (node: InternalTreeNode): boolean => {
  if (!node.isDirectory || node.fileIndices.length === 0) return false;
  const selectedCount = node.fileIndices.filter(idx => selectedSet.value.has(idx)).length;
  return selectedCount > 0 && selectedCount < node.fileIndices.length;
};

// 节点复选框切换
const onNodeCheckChange = (node: InternalTreeNode, checked: boolean) => {
  const currentSet = new Set(props.modelValue);
  if (checked) {
    node.fileIndices.forEach(idx => currentSet.add(idx));
  } else {
    node.fileIndices.forEach(idx => currentSet.delete(idx));
  }
  emit('update:modelValue', Array.from(currentSet));
};

const isNodePreviewable = (node: InternalTreeNode): boolean => {
  if (node.isDirectory || node.fileIndex === undefined) return false;
  const ext = node.name.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts', 'm4v', 'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext);
};

const onNodePreview = (node: InternalTreeNode) => {
  if (node.fileIndex === undefined) return;
  emit('preview', node.fileIndex);
};

const getNodeIcon = (node: InternalTreeNode): IconName => {
  if (node.isDirectory) return 'folder';
  const ext = node.name.split('.').pop()?.toLowerCase() || '';
  if (['mp4', 'mkv', 'avi', 'flv', 'mov', 'wmv', 'webm', 'ts'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return 'music';
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return 'image';
  }
  return 'file';
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
</script>

<style scoped>
.file-tree-container {
  width: 100%;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-app);
}

.file-tree-empty {
  padding: 30px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.file-tree-list {
  padding: 4px 0;
}

.file-tree-node {
  display: flex;
  align-items: center;
  height: 32px;
  padding-right: 12px;
  font-size: 13px;
  color: var(--text-primary);
  user-select: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.file-tree-node:hover {
  background: var(--bg-surface-hover);
}

.file-tree-node .expand-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
}

.file-tree-node .expand-icon:hover {
  color: var(--text-primary);
}

.file-tree-node .expand-placeholder {
  width: 18px;
  flex-shrink: 0;
}

.file-tree-node .node-checkbox {
  margin: 0 8px 0 2px;
  cursor: pointer;
  accent-color: var(--color-accent);
}

.file-tree-node .node-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-tree-node .node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.file-tree-node .node-size {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 12px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.file-tree-node .node-preview-btn {
  width: 24px;
  height: 24px;
  margin-left: 8px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.file-tree-node .node-preview-btn:hover {
  color: var(--color-accent);
}
</style>
