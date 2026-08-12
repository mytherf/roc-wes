<!-- ══════════════════════════════════════════════════════════════════════
     NodeDetailView.vue - 节点详情独立窗口页面（运行预览中双击节点打开）

     由 platform/routeWindow.ts 的 openNodeDetailWindow 创建的独立 OS 窗口
     （Tauri WebviewWindow，label: node-detail）加载本路由（/node-detail）。

     数据来源与实时性：
       1. 读取与运行预览窗口相同的快照文件 run-preview.json，
          取出目标节点，构建一个隐藏容器的 X6 Graph（仅数据模型，不渲染画布）
       2. 复用编辑/运行态同一套 useDataService 绑定逻辑订阅数据源，
          数据推送写入节点 data → change:data → 详情组件实时刷新
       3. 每个节点独立一个窗口（label = node-detail-<nodeId>，见 routeWindow.ts），
          本窗口生命周期内目标节点固定不变
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="node-detail-page">
    <!-- 加载状态 -->
    <div v-if="loading" class="overlay">
      <div class="spinner"></div>
      <p>正在加载节点数据...</p>
    </div>

    <!-- 无数据 / 节点不存在 -->
    <div v-else-if="!ready" class="overlay">
      <div class="empty-icon">🔍</div>
      <h2>未找到节点</h2>
      <p>运行快照中不存在该节点，请先在运行预览窗口中双击有效节点</p>
    </div>

    <!-- 详情内容（内嵌模式铺满窗口；关闭即关闭整个 OS 窗口） -->
    <NodeDetailDialog
      v-else-if="graph"
      :node-id="nodeId"
      :graph="graph"
      :embedded="true"
      @close="closeWindow"
    />

    <!-- 隐藏的画布容器：X6 Graph 必须绑定 DOM 容器，
         本页面只需数据模型与 change:data 事件，不需要可见渲染 -->
    <div ref="graphContainerRef" class="hidden-graph-container"></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Graph } from '@antv/x6'

// 注册所有自定义节点形状（全局注册，fromJSON 需识别自定义 shape）
import '@/components/nodes/registry'

import NodeDetailDialog from '@/components/NodeDetailDialog.vue'
import { useDataService } from '@/composables/useDataService'
import { useDataSourceStore } from '@/stores/dataSource'
import { readJsonFile } from '@/platform/fileStorage'
import { useThemeStore } from '@/stores/theme'

// 独立窗口是全新的页面实例，需要自行初始化主题（应用 data-theme 属性）
useThemeStore()

const route = useRoute()

// 目标节点 ID（来自 URL 查询参数；每节点独立窗口，生命周期内不变）
const nodeId = ref(String(route.query.nodeId || ''))

const loading = ref(true)   // 是否正在加载快照
const ready = ref(false)    // 快照中是否找到目标节点
// 隐藏画布容器（仅供 X6 Graph 挂载）
const graphContainerRef = ref<HTMLDivElement | null>(null)

// Graph 容器用 ref 保持模板可响应
// 注：必须用 shallowRef——普通 ref 会对 Graph 实例做深度类型解包（UnwrapRef），
// 导致 graph.value 类型被拆散，传入 bindAllNodes 时与 Graph 不兼容
const graph = shallowRef<Graph | null>(null)
// 快照节点列表（构建 Graph 时使用）
let snapshotNodes: any[] = []

// 数据服务（与运行预览窗口同一套绑定逻辑）
const dataService = useDataService()
const dataSourceStore = useDataSourceStore()

/** 从快照节点列表中构建无头 Graph 并绑定数据源 */
function buildGraph(nodes: any[]) {
  graph.value?.dispose()
  const g = new Graph({ container: graphContainerRef.value as HTMLDivElement })
  g.fromJSON({ cells: nodes })
  graph.value = g
  dataService.bindAllNodes(g)
}

onMounted(async () => {
  // 读取与运行预览相同的快照文件（编辑页「▶ 运行」时写入）
  const data = await readJsonFile<{ nodes: any[]; edges: any[] }>('run-preview.json')
  snapshotNodes = data?.nodes || []

  const found = !!nodeId.value && snapshotNodes.some((n) => n.id === nodeId.value)
  if (found) {
    buildGraph(snapshotNodes)
    ready.value = true
  }
  loading.value = false

  // 数据源列表就绪后补绑（与 RunView 相同的时序竞态处理：
  // 快照先于 datasources.json 加载完成时订阅会失败，loaded 后补绑一次）
  watch(
    () => dataSourceStore.loaded,
    (loaded) => {
      if (loaded && graph.value) {
        dataService.bindAllNodes(graph.value)
      }
    }
  )
})

/** 关闭窗口（详情头部 × 按钮触发） */
async function closeWindow() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch (err) {
    console.error('[NodeDetailView] 关闭窗口失败:', err)
  }
}

onBeforeUnmount(() => {
  dataService.dispose()
  graph.value?.dispose()
  graph.value = null
})
</script>

<style scoped>
.node-detail-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--panel-bg);
  position: relative;
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
  background: var(--panel-bg);
  color: var(--text-secondary);
  z-index: 10;
}
.overlay h2 {
  font-size: 18px;
  margin: 12px 0 8px;
  color: var(--text-primary);
}
.overlay p {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  padding: 0 24px;
  text-align: center;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty-icon {
  font-size: 48px;
}
/* 隐藏画布容器：零尺寸不可见，仅满足 X6 Graph 的容器要求 */
.hidden-graph-container {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
</style>
