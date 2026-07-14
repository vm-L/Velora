<template>
  <div class="animated-text-container" :class="{ collapsed: isCollapsed }">
    <span v-for="(char, index) in textArray" :key="index"
      :style="{ '--i': index, '--inv-i': textArray.length - 1 - index }">{{ char }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  isCollapsed: boolean
}>()

const textArray = computed(() => props.text.split(''))
</script>

<style scoped>
.animated-text-container {
  display: flex;
  white-space: pre;
}

.animated-text-container span {
  opacity: 1;
  transform: translateX(0);
  transition: opacity 0.1s ease, transform 0.1s ease;
  transition-delay: calc(var(--i) * 0.014s);
}

.animated-text-container.collapsed span {
  opacity: 0;
  transform: translateX(-5px);
  transition: opacity 0.1s ease, transform 0.1s ease;
  transition-delay: calc(var(--inv-i) * 0.014s);
}
</style>
