<template>
  <div class="app-container">
    <!-- 侧边栏：传入 graph 和 dnd 实例 -->
    <!-- 只有实例就绪后才渲染侧边栏 -->
    <Sidebar v-if="graphInstance && dndInstance" :graph="graphInstance" :dnd="dndInstance" />
    <!-- 画布组件：通过 ref 获取实例 -->
    <X6Canvas ref="canvasRef" @ready="onCanvasReady" />
  </div>
</template>


<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import X6Canvas from './components/X6Canvas.vue'

// 引用画布组件
const canvasRef = ref<InstanceType<typeof X6Canvas>>()

// 存储 graph 和 dnd 实例（用于传递给侧边栏）
const graphInstance = ref(null)
const dndInstance = ref(null)

const onCanvasReady = (payload: { graph: any; dnd: any }) => {
  graphInstance.value = payload.graph
  dndInstance.value = payload.dnd
}
</script>



<style>
/* 全局样式重置 */
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', sans-serif;
}

.app-container {
  display: flex;
  width: 100vw;
  height: 100vh;
}

/* X6Canvas 将占据剩余宽度 */
</style>