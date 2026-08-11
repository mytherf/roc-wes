<!-- ══════════════════════════════════════════════════════════════════════
     StatusBar.vue - 编辑器底部状态栏

     功能：
       1. 左侧：当前工程名（多工程管理）
       2. 中间：实时统计画布节点数 / 连线数（每 500ms 刷新一次）
       3. 右侧：版本号（来自 .env 的 VITE_APP_VERSION）
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="status-bar">
    <!-- 左侧：当前工程名（多工程管理） -->
    <div class="status-item">
      <span class="status-icon">📁</span>
      <span class="status-text">{{ projectStore.currentProject?.name ?? '—' }}</span>
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
import { useProjectStore } from '@/stores/project' // 多工程：状态栏显示当前工程名

const props = defineProps<{
  graph: any
}>()

const projectStore = useProjectStore()

const version = import.meta.env.VITE_APP_VERSION || '1.0.0'
const nodeCount = ref(0) // 画布节点数（实时统计）
const edgeCount = ref(0) // 画布连线数（实时统计）
let statsTimer: number | null = null // 统计刷新定时器

function updateStats() {
  // 从 Graph 实例读取最新的节点/连线数量
  if (props.graph) {
    nodeCount.value = props.graph.getNodes().length
    edgeCount.value = props.graph.getEdges().length
  }
}

onMounted(() => {
  updateStats()
  // 每 500ms 刷新一次（画布增删节点后数字自动更新）
  statsTimer = window.setInterval(updateStats, 500)
})

onBeforeUnmount(() => {
  // 组件卸载时停掉定时器
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
  gap: 16px;
  padding: 0 16px;
  background: var(--statusbar-bg);
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  height: 32px;
  user-select: none;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.status-icon {
  font-size: 14px;
}
.status-text {
  font-weight: 500;
  color: var(--text-primary);
}
</style>