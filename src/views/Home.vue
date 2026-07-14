<template>
  <div class="view home-view">
    <div class="content-box">
      <h1>自由视界</h1>
      <p>我现在会自适应填满整个内容区域拉！ &#x1f389;</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Home logic
</script>

<style scoped lang="less">
.home-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.content-box {
  background: white;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  width: 100%;
  height: 100%;
  transition: all 0.2s ease-out;
}

h1 {
  margin: 0 0 10px;
  color: #333;
  font-size: 32px;
}

p {
  margin: 0;
  color: #666;
  font-size: 16px;
}
</style>
