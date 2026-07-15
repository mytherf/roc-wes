<template>
  <!-- X6 画布挂载的容器 -->
  <div id="x6-container" ref="containerRef"></div>
  <!-- 【关键】TeleportContainer 必须放在画布容器同级，Vue 节点才能正确渲染 -->
  <TeleportContainer/>
</template>

<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {Clipboard, Dnd, Graph, Keyboard, Selection} from '@antv/x6'
import {getTeleport} from '@antv/x6-vue-shape';
import type {GraphData} from '@/stores/editor'
import {useEditorStore} from '@/stores/editor'

import {MockDataService} from '@/services/MockDataService'
import type {DataBindingConfig, IDataService} from '@/services/DataService'

import {AnimationService} from '@/services/AnimationService'

import { PointIdGenerator } from '@/services/PointIdGenerator'

let animationService: AnimationService | null = null


// 数据服务实例
let dataService: IDataService | null = null
// 存储节点 ID → 数据点 ID 的映射，用于清理
const nodeDataSubscriptions = new Map<string, string>()


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

// 标记是否正在通过 store 更新画布（防止循环）
let isUpdatingFromStore = false

// ===================== 3. 使用 Store =====================
const editorStore = useEditorStore()

// 定义事件：画布初始化完成
const emit = defineEmits<{
  (e: 'ready', payload: { graph: Graph; dnd: Dnd }): void
}>()

// ===================== 3. 暴露实例给父组件 =====================
defineExpose({
  graph: graphRef,
  dnd: dndRef,
  bindNodeData,
  unbindNodeData,
})


// ===================== 4. 组件挂载后初始化画布 =====================
onMounted(() => {
  if (!containerRef.value) return

  graph = new Graph({
    container: containerRef.value,
    autoResize: true,
    grid: true,
    background: {color: '#f5f5f5'},
    panning: true,

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

  // ---------- 监听画布事件，同步到 Store ----------

  graph.on('node:moved', () => {
    if (isUpdatingFromStore) return
    syncGraphToStore()
    editorStore.pushHistory()
  })
  graph.on('cell:change', () => {
    if (isUpdatingFromStore) return
    syncGraphToStore()
    editorStore.pushHistory()
  })

  graph.on('cell:added', ({cell}) => {
    if (isUpdatingFromStore) return

    if (cell.isNode()) {
      const data = cell.getData()
      if (data?.binding?.pointId) {
        bindNodeData(cell)
      }
      applyNodeAnimation(cell)
    }

    syncGraphToStore()
    editorStore.pushHistory()
  })

  graph.on('cell:removed', () => {
    if (isUpdatingFromStore) return
    syncGraphToStore()
    editorStore.pushHistory()
  })

  graph.on('cell:removed', ({ cell }) => {
    if (cell.isNode()) {
      const data = cell.getData()
      const generator = PointIdGenerator.getInstance()

      if (data?.pointId) {
        generator.release(data.pointId)
      }
      if (data?.binding?.pointId) {
        generator.release(data.binding.pointId)
      }
    }
  })

  graph.on('selection:changed', ({selected}) => {
    if (selected && selected.length > 0) {
      const cell = selected[0]
      editorStore.setSelected(cell.id)
    } else {
      editorStore.setSelected(null)
    }
  })

  graph.on('cell:click', ({cell}) => {
    console.log('点击了元素:', cell.id)
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

  // ---------- 监听 store 的 graphData 变化，重新加载画布 ----------
  watch(
      () => editorStore.graphData,
      (newData) => {
        const currentData = graph!.toJSON()
        const newDataStr = JSON.stringify(newData)
        const currentDataStr = JSON.stringify(currentData)
        if (newDataStr === currentDataStr) return

        isUpdatingFromStore = true
        loadGraphData(newData)
        if (editorStore.selectedId) {
          const cell = graph!.getCellById(editorStore.selectedId)
          if (cell) {
            graph!.select(cell)
          }
        }
        nextTick(() => {
          isUpdatingFromStore = false
        })
      },
      {deep: true}
  )

  dataService = new MockDataService()

  graph.on('cell:change:data', ({cell}) => {
    if (cell.isNode()) {
      const data = cell.getData()
      const currentPointId = nodeDataSubscriptions.get(cell.id)
      const newPointId = data?.binding?.pointId
      if (currentPointId !== newPointId) {
        bindNodeData(cell)
      }
    }
  })
});

// ===================== 5. 辅助函数 =====================

function applyNodeAnimation(node: any) {
  const data = node.getData()
  if (data?.animation) {
    animationService?.setAnimation(node.id, data.animation)
  }
}

/**
 * 为节点绑定数据源
 */
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
    node.trigger('change:data', {current: node})
  })

  nodeDataSubscriptions.set(node.id, binding.pointId)
}

/**
 * 取消节点的数据订阅
 */
function unbindNodeData(nodeId: string) {
  if (nodeDataSubscriptions.has(nodeId)) {
    const pointId = nodeDataSubscriptions.get(nodeId)!
    dataService?.unsubscribe(pointId)
    nodeDataSubscriptions.delete(nodeId)
  }
}

function unbindAllNodes() {
  for (const [_nodeId, pointId] of nodeDataSubscriptions) {
    dataService?.unsubscribe(pointId)
  }
  nodeDataSubscriptions.clear()
}

function syncGraphToStore() {
  if (!graph) return
  const data = graph.toJSON()
  const nodes = data.cells.filter(
      (cell: any) => !('source' in cell && 'target' in cell)
  )
  const edges = data.cells.filter(
      (cell: any) => 'source' in cell && 'target' in cell
  )
  editorStore.setGraphData({nodes, edges})
}

function loadGraphData(data: GraphData) {
  if (!graph) return
  const g = graph

  g.batchUpdate(() => {
    g.clearCells()
    g.fromJSON(data)
  })

  const generator = PointIdGenerator.getInstance()
  if (graph) {
    generator.initFromNodes(graph.getNodes())
  }
}

function batchAddNodes(nodes: any[]) {
  if (!graph) return
  const g = graph
  g.batchUpdate(() => {
    for (const nodeConfig of nodes) {
      g.addNode(nodeConfig)
    }
  })
}

function batchAddEdges(edges: any[]) {
  if (!graph) return
  const g = graph
  g.batchUpdate(() => {
    for (const edgeConfig of edges) {
      g.addEdge(edgeConfig)
    }
  })
}

// ===================== 5. 组件卸载前清理 =====================
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null

  unbindAllNodes()
  dataService?.disconnect()

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
