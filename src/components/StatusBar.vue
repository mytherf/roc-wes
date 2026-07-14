<template>
  <div class="status-bar">
    <!-- 左侧：授权状态（直接显示“已授权”，无交互） -->
    <div class="status-item">
      <span class="status-icon"></span>
      <span class="status-text"></span>
    </div>

    <!-- 中间：节点/边统计 -->
    <div class="status-item">
      <span>📊 节点: {{ nodeCount }}</span>
      <span style="margin-left: 12px;">🔗 边: {{ edgeCount }}</span>
    </div>

    <!-- 右侧：版本信息 -->
    <div class="status-item" style="margin-left: auto;">
      <span>v{{ version }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  graph: any
}>()

const version = import.meta.env.VITE_APP_VERSION || '1.0.0'
const nodeCount = ref(0)
const edgeCount = ref(0)
let statsTimer: number | null = null

function updateStats() {
  if (props.graph) {
    nodeCount.value = props.graph.getNodes().length
    edgeCount.value = props.graph.getEdges().length
  }
}

onMounted(() => {
  updateStats()
  statsTimer = window.setInterval(updateStats, 500)
})

onBeforeUnmount(() => {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 6px 20px;
  background: #f5f5f5;
  border-top: 1px solid #e8e8e8;
  font-size: 13px;
  color: #333;
  flex-shrink: 0;
  height: 36px;
  user-select: none;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-icon {
  font-size: 16px;
}
.status-text {
  font-weight: 500;
}
</style>