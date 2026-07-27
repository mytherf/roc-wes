<template>
  <!-- X6 画布挂载的容器 -->
  <div id="x6-container" ref="containerRef"></div>
  <!-- 【关键】TeleportContainer 必须放在画布容器同级，Vue 节点才能正确渲染 -->
  <TeleportContainer/>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, watch, nextTick} from 'vue'
import {Clipboard, Dnd, Graph, Keyboard, Selection, Transform} from '@antv/x6'
import {getTeleport} from '@antv/x6-vue-shape';
import type {GraphData} from '@/stores/editor'
import {useEditorStore} from '@/stores/editor'

import {AnimationService} from '@/services/AnimationService'
import {PointIdGenerator} from '@/services/PointIdGenerator'

import {useDataService} from '@/composables/useDataService'
import {useGraphSync} from '@/composables/useGraphSync'

// ===================== 1. 获取 Teleport 容器组件 =====================
const TeleportContainer = getTeleport()

// ===================== 2. 响应式引用与实例变量 =====================
const containerRef = ref<HTMLDivElement | null>(null)

// X6 Graph 实例（内部使用，供闭包和事件回调引用）
let graph: Graph | null = null
// 响应式引用，用于 defineExpose 暴露给父组件（解决 let 变量暴露为 null 的问题）
const graphRef = ref<Graph | null>(null)

// Dnd 拖拽实例
let dnd: Dnd | null = null
// 响应式引用，用于 defineExpose
const dndRef = ref<Dnd | null>(null)

// ResizeObserver 实例（用于画布自适应）
let resizeObserver: ResizeObserver | null = null

// 节点动画服务
let animationService: AnimationService | null = null

// ===================== 3. 使用 Store 与 Composables =====================
const editorStore = useEditorStore()

// 数据服务管理（数据源创建、缓存、节点订阅绑定与清理）
const dataService = useDataService()

// 画布 ↔ Store 双向同步（防循环标志、事件监听、watcher）
const {updateNodePosition, updateNodeSize, bindGraphEvents, bindStoreWatchers, syncGraphToStore, setSyncSuppressed} = useGraphSync({
  getGraph: () => graph,
  onReload: (data) => loadGraphData(data),
  // 新增节点：绑定数据源 + 应用动画
  onNodeAdded: (cell) => {
    const data = cell.getData()
    if (data?.binding?.pointId) {
      dataService.bindNodeData(cell)
    }
    applyNodeAnimation(cell)
    // 图标模式下新增的节点也需压缩尺寸
    if (editorStore.displayMode === 'icon' && cell.isNode() && isMinimalShape(cell)) {
      originalSizes.set(cell.id, { ...cell.getSize() })
      cell.setSize(ICON_MODE_SIZE)
    }
  },
  // 移除节点：释放点 ID
  onNodeRemoved: (cell) => {
    const data = cell.getData()
    const generator = PointIdGenerator.getInstance()
    if (data?.pointId) {
      generator.release(data.pointId)
    }
    if (data?.binding?.pointId) {
      generator.release(data.binding.pointId)
    }
  },
})

// ===================== 4.5 显示模式切换：节点尺寸适配 =====================

/** 图标模式下的紧凑节点尺寸（与 NodeMinimalView 视觉尺寸匹配） */
const ICON_MODE_SIZE = { width: 140, height: 36 }

/** 支持极简视图的节点形状（切换图标模式时需压缩尺寸） */
const MINIMAL_SHAPES = new Set([
  'custom-card', 'gauge-node', 'chart-node', 'indicator-node',
  'stacker-node', 'conveyor-node', 'agv-node', 'shuttle-node',
  'sorter-node', 'elevator-node', 'robot-node', 'rack-node',
])

/** 记录节点进入图标模式前的原始尺寸（nodeId → size） */
const originalSizes = new Map<string, { width: number; height: number }>()

// 定义事件：画布初始化完成 / 节点双击
const emit = defineEmits<{
  (e: 'ready', payload: { graph: Graph; dnd: Dnd }): void
  (e: 'node-dblclick', payload: { nodeId: string; shape: string }): void
}>()

// ===================== 4. 暴露实例给父组件 =====================
defineExpose({
  graph: graphRef,
  dnd: dndRef,
  bindNodeData: dataService.bindNodeData,
  unbindNodeData: dataService.unbindNodeData,
  updateNodePosition,
  updateNodeSize,
})

// ===================== 4.6 监听显示模式切换 =====================
// 切换时批量调整节点模型尺寸，使选择框与图标模式的视觉内容匹配
watch(() => editorStore.displayMode, (mode, oldMode) => {
  if (!graph || mode === oldMode) return
  setSyncSuppressed(true)
  if (mode === 'icon') {
    applyIconModeSizes(graph)
  } else {
    restoreFullModeSizes(graph)
  }
  syncGraphToStore()
  nextTick(() => setSyncSuppressed(false))
})

// ===================== 5. 组件挂载后初始化画布 =====================
onMounted(() => {
  if (!containerRef.value) return

  graph = new Graph({
    container: containerRef.value,
    autoResize: true,
    grid: true,
    background: {color: '#f5f5f5'},
    panning: {
      enabled: true,
      eventTypes: ['rightMouseDown'],
    },

    virtual: {
      enabled: true,
      margin: 150,
    },
    mousewheel: {
      enabled: true,
      zoomAtMousePosition: true,
      minScale: 0.2,
      maxScale: 3,
    },

    connecting: {
      allowNode: true,
      allowPort: true,
      allowBlank: false,
      snap: {
        radius: 20,
      },
      createEdge: () => {
        return graph!.createEdge({
          shape: 'edge',
          attrs: {
            line: {
              stroke: '#1890ff',
              strokeWidth: 2,
              targetMarker: {
                name: 'block',
                width: 12,
                height: 8,
              },
            },
          },
        })
      },
      validateConnection: ({sourceCell, targetCell}) => {
        if (sourceCell === targetCell) return false
        const edges = graph!.getEdges()
        for (const edge of edges) {
          if (
              edge.getSourceCellId() === sourceCell?.id &&
              edge.getTargetCellId() === targetCell?.id
          ) {
            return false
          }
        }
        return true
      },
    },
  })

  // 同步到响应式引用，使父组件能访问到 graph 实例
  graphRef.value = graph

  if (!graph) {
    console.error('graph 未初始化')
    return
  }

  animationService = new AnimationService(graph)

  graph.use(
      new Selection({
        enabled: true,
        multiple: true,
        rubberband: true,
        movable: true,
        strict: false,
        showNodeSelectionBox: true,
        modifiers: ['shift'],
      })
  )

  // 节点缩放（X6 v3 通过内置 Transform 插件实现）
  graph.use(
      new Transform({
        resizing: {
          enabled: true,
          minWidth: 40,
          minHeight: 40,
          orthogonal: true,
          allowReverse: true,
          preserveAspectRatio: false,
        },
      })
  )

  graph.use(
      new Clipboard({
        enabled: true,
        useLocalStorage: false,
      })
  )

  graph.use(
      new Keyboard({
        enabled: true,
        global: true,
      })
  )

  graph.bindKey('ctrl+c', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.copy(cells)
    }
  })

  graph.bindKey('ctrl+v', () => {
    if (!graph!.isClipboardEmpty()) {
      graph!.paste({offset: {dx: 20, dy: 20}})
    }
  })

  graph.bindKey('delete', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.removeCells(cells)
    }
  })
  graph.bindKey('backspace', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.removeCells(cells)
    }
  })

  graph.bindKey('ctrl+a', () => {
    const allCells = graph!.getCells()
    graph!.select(allCells)
  })

  graph.bindKey('ctrl+z', () => {
    editorStore.undo()
  })
  graph.bindKey('ctrl+shift+z', () => {
    editorStore.redo()
  })

  dnd = new Dnd({
    target: graph,
    getDragNode: (node) => {
      const cloned = node.clone()
      cloned.setAttrs({
        body: {
          stroke: '#1890ff',
          strokeWidth: 2,
          fill: '#e6f7ff',
        },
      })
      return cloned
    },
    getDropNode: (node) => {
      return node.clone()
    },
  })

  // 同步到响应式引用
  dndRef.value = dnd

  if (editorStore.graphData.nodes.length > 0) {
    loadGraphData(editorStore.graphData)
  }

  // ---------- 注册画布 ↔ Store 同步（事件 + watcher） ----------
  bindGraphEvents(graph)
  bindStoreWatchers()

  // ---------- 其余画布事件 ----------

  // 绑定配置变化时自动切换数据源（如属性面板修改 pointId）
  graph.on('cell:change:data', ({cell}) => {
    if (cell.isNode()) {
      dataService.rebindIfChanged(cell)
    }
  })

  graph.on('cell:click', ({cell}) => {
    console.log('点击了元素:', cell.id)
  })

  // 双击节点：派发事件给父组件（用于弹出节点详情界面）
  graph.on('node:dblclick', ({node}) => {
    emit('node-dblclick', {nodeId: node.id, shape: node.shape})
  })

  graph.on('edge:connected', ({edge}) => {
    console.log(
        '连线完成:',
        edge.getSourceCellId(),
        '->',
        edge.getTargetCellId()
    )
  })

  // 派发 ready 事件
  emit('ready', {
    graph: graph as Graph,
    dnd: dnd as Dnd,
  })

  // 监听容器尺寸变化，自适应画布
  resizeObserver = new ResizeObserver((entries) => {
    if (!graph) return
    for (const entry of entries) {
      const {width, height} = entry.contentRect
      if (width > 0 && height > 0) {
        graph.resize(width, height)
        if ((graph as any).scroller) {
          (graph as any).scroller.resize()
        }
      }
    }
  })
  resizeObserver.observe(containerRef.value)
});

// ===================== 6. 辅助函数 =====================

/** 判断节点是否需要在图标模式下压缩尺寸 */
function isMinimalShape(node: any): boolean {
  return MINIMAL_SHAPES.has(node.shape)
}

/** 图标模式：保存原始尺寸并压缩所有极简视图节点 */
function applyIconModeSizes(g: Graph) {
  for (const node of g.getNodes()) {
    if (!isMinimalShape(node)) continue
    originalSizes.set(node.id, { ...node.getSize() })
    node.setSize(ICON_MODE_SIZE)
  }
}

/** 切回完整模式：恢复各节点原始尺寸 */
function restoreFullModeSizes(g: Graph) {
  for (const node of g.getNodes()) {
    if (!isMinimalShape(node)) continue
    const original = originalSizes.get(node.id)
    if (original) {
      node.setSize(original)
    }
  }
  originalSizes.clear()
}

/**
 * 应用节点动画（读取 node.data.animation 配置）
 */
function applyNodeAnimation(node: any) {
  const data = node.getData()
  if (data?.animation) {
    animationService?.setAnimation(node.id, data.animation)
  }
}

/**
 * 加载画布数据：解绑旧订阅 → 重建 cells → 重新绑定数据与动画
 */
function loadGraphData(data: GraphData) {
  if (!graph) return
  const g = graph

  dataService.unbindAllNodes()

  const x6Data = {
    cells: [
      ...data.nodes.map(n => ({...n, position: {x: n.x || 0, y: n.y || 0}})),
      ...data.edges,
    ],
  }
  g.batchUpdate(() => {
    g.clearCells()
    g.fromJSON(x6Data)
  })


  // 从画布节点初始化已用点 ID
  const generator = PointIdGenerator.getInstance()
  generator.initFromNodes(g.getNodes())

  // 重新绑定数据源
  dataService.bindAllNodes(g)

  // 应用动画
  for (const node of g.getNodes()) {
    applyNodeAnimation(node)
  }

  // 图标模式下重载后重新应用紧凑尺寸（如撤销/重做恢复了完整尺寸）
  if (editorStore.displayMode === 'icon') {
    applyIconModeSizes(g)
    syncGraphToStore()
  }
}

// ===================== 7. 组件卸载前清理 =====================
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null

  dataService.dispose()

  animationService?.dispose()

  if (graph) {
    graph.dispose()
    graph = null
    graphRef.value = null
  }
  dndRef.value = null
})

</script>


<style scoped>
#x6-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

#x6-container :deep(::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

#x6-container :deep(::-webkit-scrollbar-track) {
  background: #f0f0f0;
  border-radius: 4px;
}

#x6-container :deep(::-webkit-scrollbar-thumb) {
  background: #c1c1c1;
  border-radius: 4px;
}

#x6-container :deep(::-webkit-scrollbar-thumb:hover) {
  background: #a8a8a8;
}

#x6-container :deep(::-webkit-scrollbar-corner) {
  background: #f0f0f0;
}
</style>
