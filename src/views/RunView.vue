<!-- ══════════════════════════════════════════════════════════════════════
     RunView.vue - 运行态视图（把编辑好的组态“跑起来”的页面）

     运行流程：
       1. 编辑页点击「▶ 运行」时，编辑器把当前画布数据序列化后
          写入 run-preview.json 文件（应用配置目录）
       2. 本页面挂载后异步读取该文件，重新渲染画布
       3. 与编辑态不同：这里不可编辑（interacting: false），
          只展示节点动画 + 实时数据刷新（数据绑定、动画引擎）

     与编辑态（X6Canvas）的关系：
       - 共用同一套节点组件注册表、数据绑定（useDataService）、动画引擎
       - 状态栏底部实时显示节点数/连线数/当前时间
     ══════════════════════════════════════════════════════════════════════ -->
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
import { AnimationService } from '@/services/AnimationService'
import { useDataService } from '@/composables/useDataService'
import { readJsonFile } from '@/platform/fileStorage' // 文件读取工具（Tauri FS 落盘）

const TeleportContainer = getTeleport()

const containerRef = ref<HTMLDivElement | null>(null)
// X6 Graph 实例（运行态画布）
let graph: Graph | null = null
// 动画引擎（驱动节点闪烁、位移等动画）
let animationService: AnimationService | null = null
// 窗口尺寸变化监听器（自适应缩放画布）
let resizeHandler: (() => void) | null = null
// 统计信息定时器（每秒刷新节点数/连线数/时间）
let statsTimer: number | null = null

const loading = ref(true)   // 是否正在加载
const hasData = ref(false)  // 是否有运行数据（从编辑页跳转过来才有）
const nodeCount = ref(0)    // 画布节点数量（底部信息栏展示）
const edgeCount = ref(0)    // 画布连线数量（底部信息栏展示）
const currentTime = ref('') // 当前时间（底部信息栏每秒刷新）

// 数据服务管理（与编辑态 X6Canvas 共用同一套绑定逻辑）
const dataService = useDataService()

onMounted(async() => {
  if (!containerRef.value) return

  // 从预览快照文件读取画布数据（编辑页「▶ 运行」时写入）
  const data = await readJsonFile<{ nodes: any[]; edges: any[] }>('run-preview.json')
  if (!data || !data.nodes || data.nodes.length === 0) {
    loading.value = false
    hasData.value = false
    return
  }

  try {
    hasData.value = true

    await nextTick()

    graph = new Graph({
      container: containerRef.value,
      // 浅灰背景 + 网格线，保持与编辑态一致的视觉参考
      background: { color: '#f5f5f5' },
      grid: true,
      // 运行态不允许编辑（禁止拖动/缩放节点），只允许平移查看
      interacting: false,
      panning: true,
      // 滚轮缩放（以鼠标位置为中心，限制缩放范围 0.1~3 倍）
      mousewheel: {
        enabled: true,
        zoomAtMousePosition: true,
        minScale: 0.1,
        maxScale: 3,
      },
      // 虚拟渲染：只渲染视口附近的节点，节点很多时保持流畅
      virtual: {
        enabled: true,
        margin: 150,
      },
    })

    graph.fromJSON({ cells: [...data.nodes, ...data.edges] })
    graph.zoomTo(1)
    graph.centerContent()

    // 绑定数据源（setData 会自动触发 change:data，驱动节点组件刷新）
    dataService.bindAllNodes(graph)

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

function applyNodeAnimation(node: any) {
  // 读取节点上配置的动画类型，交给动画引擎播放
  const data = node.getData()
  if (data?.animation) {
    animationService?.setAnimation(node.id, data.animation)
  }
}

function applyAllAnimations() {
  // 画布加载完成后，给所有节点统一启动动画
  if (!graph) return
  const nodes = graph.getNodes()
  for (const node of nodes) {
    applyNodeAnimation(node)
  }
}

function updateStats() {
  // 刷新底部信息栏的节点数 / 连线数
  if (!graph) return
  nodeCount.value = graph.getNodes().length
  edgeCount.value = graph.getEdges().length
}

onBeforeUnmount(() => {
  // 组件卸载清理：移除监听器、停掉定时器、断开数据连接、销毁画布
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
  dataService.dispose()
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
