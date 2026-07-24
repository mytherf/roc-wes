<template>
  <div class="run-page">
    <!-- 加载状态 -->
    <div v-if="loading" class="overlay">
      <div class="spinner"></div>
      <p>正在加载运行数据...</p>
    </div>

    <!-- 无数据 -->
    <div v-if="!hasData && !loading" class="overlay">
      <div class="empty-icon">📊</div>
      <h2>暂无运行数据</h2>
      <p>请从编辑页面点击 <strong>“▶ 运行”</strong> 按钮生成运行数据</p>
    </div>

    <!-- 运行画布 -->
    <div v-show="hasData" id="run-container" ref="containerRef"></div>
    <TeleportContainer />

    <!-- 信息栏 -->
    <div v-if="hasData" class="run-info-bar">
      <span class="run-status">🟢 运行中</span>
      <span class="run-stat">📊 节点: {{ nodeCount }}</span>
      <span class="run-stat">🔗 连线: {{ edgeCount }}</span>
      <span class="run-stat">🕐 {{ currentTime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Graph } from '@antv/x6'
import { getTeleport } from '@antv/x6-vue-shape'

// 注册所有自定义节点（统一由节点注册表管理）
import '@/components/nodes/registry'

// 服务
import { MockDataService } from '@/services/MockDataService'
import type { DataBindingConfig, IDataService } from '@/services/DataService'
import { AnimationService } from '@/services/AnimationService'

const TeleportContainer = getTeleport()

const containerRef = ref<HTMLDivElement | null>(null)
let graph: Graph | null = null
let dataService: IDataService | null = null
let animationService: AnimationService | null = null
let resizeHandler: (() => void) | null = null
let statsTimer: number | null = null

const loading = ref(true)
const hasData = ref(false)
const nodeCount = ref(0)
const edgeCount = ref(0)
const currentTime = ref('')

const nodeDataSubscriptions = new Map<string, string>()

onMounted(async() => {
  if (!containerRef.value) return

  const stored = sessionStorage.getItem('scada-run-data')
  if (!stored) {
    loading.value = false
    hasData.value = false
    return
  }

  try {
    const data = JSON.parse(stored)
    if (!data.nodes || data.nodes.length === 0) {
      loading.value = false
      hasData.value = false
      return
    }

    hasData.value = true

    await nextTick()

    graph = new Graph({
      container: containerRef.value,
      background: { color: '#f5f5f5' },
      grid: true,
      interacting: false,
      panning: true,
      mousewheel: {
        enabled: true,
        zoomAtMousePosition: true,
        minScale: 0.1,
        maxScale: 3,
      },
      virtual: {
        enabled: true,
        margin: 150,
      },
    })

    graph.fromJSON({ cells: [...data.nodes, ...data.edges] })
    graph.zoomTo(1)
    graph.centerContent()

    dataService = new MockDataService()
    bindAllNodes()

    animationService = new AnimationService(graph)
    applyAllAnimations()

    updateStats()
    statsTimer = window.setInterval(() => {
      updateStats()
      currentTime.value = new Date().toLocaleTimeString()
    }, 1000)

    resizeHandler = () => {
      if (graph) {
        graph.zoomToFit({
          maxScale: 1.5,
          padding: { top: 60, right: 40, bottom: 60, left: 40 },
        })
      }
    }
    window.addEventListener('resize', resizeHandler)

    loading.value = false
    console.log('✅ 运行态启动成功')
  } catch (error) {
    console.error('运行态加载失败:', error)
    loading.value = false
    hasData.value = false
  }
})

function bindNodeData(node: any) {
  const nodeData = node.getData()
  const binding = nodeData?.binding as DataBindingConfig | undefined
  if (!binding?.pointId) return

  if (nodeDataSubscriptions.has(node.id)) {
    dataService?.unsubscribe(nodeDataSubscriptions.get(node.id)!)
    nodeDataSubscriptions.delete(node.id)
  }

  dataService?.subscribe(binding.pointId, (point) => {
    const currentData = node.getData()
    let newValue = point.value
    if (binding.transform) {
      newValue = binding.transform(point.value)
    }
    node.setData({
      ...currentData,
      value: newValue,
      _timestamp: point.timestamp,
      _quality: point.quality,
    })
    node.trigger('change:data', { current: node })
  })

  nodeDataSubscriptions.set(node.id, binding.pointId)
}

function bindAllNodes() {
  if (!graph) return
  const nodes = graph.getNodes()
  for (const node of nodes) {
    bindNodeData(node)
  }
}

function unbindAllNodes() {
  for (const [, pointId] of nodeDataSubscriptions) {
    dataService?.unsubscribe(pointId)
  }
  nodeDataSubscriptions.clear()
}

function applyNodeAnimation(node: any) {
  const data = node.getData()
  if (data?.animation) {
    animationService?.setAnimation(node.id, data.animation)
  }
}

function applyAllAnimations() {
  if (!graph) return
  const nodes = graph.getNodes()
  for (const node of nodes) {
    applyNodeAnimation(node)
  }
}

function updateStats() {
  if (!graph) return
  nodeCount.value = graph.getNodes().length
  edgeCount.value = graph.getEdges().length
}

onBeforeUnmount(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
  unbindAllNodes()
  dataService?.disconnect()
  animationService?.dispose()
  if (graph) {
    graph.dispose()
    graph = null
  }
})
</script>

<style scoped>
.run-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f0f2f5;
  position: relative;
}

#run-container {
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
  color: #666;
  z-index: 10;
}
.overlay h2 {
  font-size: 24px;
  margin: 12px 0 8px;
  color: #333;
}
.overlay p {
  font-size: 14px;
  color: #999;
  margin: 0;
}
.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e8e8e8;
  border-top: 4px solid #1890ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty-icon {
  font-size: 64px;
}
.run-info-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 20px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 13px;
  z-index: 100;
  user-select: none;
}
.run-status {
  color: #52c41a;
  font-weight: 500;
}
.run-stat {
  opacity: 0.8;
}
.run-stat:not(:last-child)::after {
  content: '|';
  margin-left: 20px;
  opacity: 0.3;
}
</style>