<template>
  <div class="app-container">
    <!-- 左侧：组件库侧边栏 -->
    <Sidebar v-if="graphInstance && dndInstance" :graph="graphInstance" :dnd="dndInstance" />
    <!-- 右侧区域 -->
    <div class="right-area">
      <!-- 顶部：工具栏 -->
      <WorkflowToolbar :graph="graphInstance" :canvas-ref="canvasRef" />
      <!-- 中间：画布 + 属性面板 -->
      <div class="bottom-area">
        <div class="canvas-wrapper">
          <X6Canvas ref="canvasRef" @ready="onCanvasReady" />
        </div>
        <PropertyPanel :canvas-ref="canvasRef" />
      </div>
      <!-- 底部：状态栏 -->
      <StatusBar :graph="graphInstance" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import X6Canvas from '@/components/X6Canvas.vue'
import PropertyPanel from '@/components/PropertyPanel.vue'
import WorkflowToolbar from '@/components/WorkflowToolbar.vue'
import StatusBar from '@/components/StatusBar.vue'

const canvasRef = ref<InstanceType<typeof X6Canvas>>()
const graphInstance = ref(null)
const dndInstance = ref(null)

const onCanvasReady = (payload: { graph: any; dnd: any }) => {
  graphInstance.value = payload.graph
  dndInstance.value = payload.dnd
}
</script>

<style>
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

.right-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
}

.bottom-area {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.canvas-wrapper {
  flex: 1 1 0%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>