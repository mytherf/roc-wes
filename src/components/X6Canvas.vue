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
import {WebSocketService} from '@/services/WebSocketService'

import {AnimationService} from '@/services/AnimationService'

import { PointIdGenerator } from '@/services/PointIdGenerator'

let animationService: AnimationService | null = null

// 数据服务实例（根据 sourceType + sourceUrl 缓存）
const dataServiceMap = new Map<string, IDataService>()
// 默认数据服务（无 sourceUrl 时的兜底）
let defaultDataService: IDataService | null = null
// 存储节点 ID → 数据服务 key 的映射
const nodeServiceKeys = new Map<string, string>()
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
// 标记是否正在同步节点位置（防止 node:moved 触发 syncGraphToStore）
let isSyncingPosition = false

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
  updateNodePosition,
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
    if (isUpdatingFromStore || isSyncingPosition) return
    syncGraphToStore()
    editorStore.pushHistory()
  })
  graph.on('cell:change', () => {
    if (isUpdatingFromStore || isSyncingPosition) return
    syncGraphToStore()
    editorStore.pushHistory()
  })

  graph.on('cell:added', ({cell}) => {
    console.log('添加了元素:', cell)
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

      if (cell.isNode()) {
        const pos = cell.getPosition()
        editorStore.updateNode(cell.id, { x: pos.x, y: pos.y })
      }
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

  // 位置专用 watcher：仅更新节点位置，避免全量重载
  watch(
      () => editorStore.graphData.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
      (newPositions) => {
        if (!graph || isUpdatingFromStore) return
        isSyncingPosition = true
        for (const pos of newPositions) {
          const cell = graph.getCellById(pos.id)
          if (cell && cell.isNode()) {
            const current = cell.getPosition()
            if (current.x !== pos.x || current.y !== pos.y) {
              cell.setPosition({ x: pos.x || 0, y: pos.y || 0 })
            }
          }
        }
        nextTick(() => {
          isSyncingPosition = false
        })
      },
      { deep: true }
  )

  watch(
      () => editorStore.graphData,
      (newData) => {
        const currentCells = graph!.toJSON().cells
        const currentNodes = currentCells
            .filter((cell: any) => !('source' in cell && 'target' in cell))
            .map((node: any) => ({
              ...node,
              x: node.position?.x ?? node.x ?? 0,
              y: node.position?.y ?? node.y ?? 0,
            }))
        const currentEdges = currentCells.filter(
            (cell: any) => 'source' in cell && 'target' in cell
        )
        const normalized = { nodes: currentNodes, edges: currentEdges }
        const newDataStr = JSON.stringify(newData)
        const currentDataStr = JSON.stringify(normalized)
        if (newDataStr === currentDataStr) return

        isUpdatingFromStore = true
        const prevSelectedId = editorStore.selectedId
        loadGraphData(newData)
        if (prevSelectedId) {
          const cell = graph!.getCellById(prevSelectedId)
          if (cell) {
            graph!.select(cell)
            editorStore.setSelected(prevSelectedId)
          }
        }
        nextTick(() => {
          isUpdatingFromStore = false
        })
      },
      {deep: true}
  )

  defaultDataService = new MockDataService()

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
 * 根据 sourceType 和 sourceUrl 获取或创建数据服务实例
 */
function getDataService(sourceType: string, sourceUrl?: string): IDataService | null {
  if (!sourceUrl) {
    return defaultDataService
  }
  const key = `${sourceType}:${sourceUrl}`
  if (!dataServiceMap.has(key)) {
    if (sourceType === 'websocket') {
      dataServiceMap.set(key, new WebSocketService(sourceUrl))
    } else {
      console.warn(`[X6Canvas] 不支持的数据源类型: ${sourceType}`)
      return defaultDataService
    }
  }
  return dataServiceMap.get(key)!
}

/**
 * 为节点绑定数据源
 */
function bindNodeData(node: any) {
  const nodeData = node.getData()
  const binding = nodeData?.binding as DataBindingConfig | undefined
  if (!binding?.pointId) return

  // 先取消旧订阅
  if (nodeDataSubscriptions.has(node.id)) {
    const oldPointId = nodeDataSubscriptions.get(node.id)!
    const oldServiceKey = nodeServiceKeys.get(node.id)
    if (oldServiceKey && dataServiceMap.has(oldServiceKey)) {
      dataServiceMap.get(oldServiceKey)!.unsubscribe(oldPointId)
    } else {
      defaultDataService?.unsubscribe(oldPointId)
    }
    nodeDataSubscriptions.delete(node.id)
    nodeServiceKeys.delete(node.id)
  }

  // 根据配置获取对应的数据服务
  const service = getDataService(binding.sourceType, binding.sourceUrl)
  if (!service) {
    console.warn('[X6Canvas] 无法获取数据服务')
    return
  }

  // 记录该节点使用的服务 key
  if (binding.sourceUrl) {
    nodeServiceKeys.set(node.id, `${binding.sourceType}:${binding.sourceUrl}`)
  }

  service.subscribe(binding.pointId, (point) => {
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
  })

  nodeDataSubscriptions.set(node.id, binding.pointId)
}

/**
 * 取消节点的数据订阅
 */
function unbindNodeData(nodeId: string) {
  if (nodeDataSubscriptions.has(nodeId)) {
    const pointId = nodeDataSubscriptions.get(nodeId)!
    const serviceKey = nodeServiceKeys.get(nodeId)
    if (serviceKey && dataServiceMap.has(serviceKey)) {
      dataServiceMap.get(serviceKey)!.unsubscribe(pointId)
    } else {
      defaultDataService?.unsubscribe(pointId)
    }
    nodeDataSubscriptions.delete(nodeId)
    nodeServiceKeys.delete(nodeId)
  }
}

function unbindAllNodes() {
  for (const [nodeId, pointId] of nodeDataSubscriptions) {
    const serviceKey = nodeServiceKeys.get(nodeId)
    if (serviceKey && dataServiceMap.has(serviceKey)) {
      dataServiceMap.get(serviceKey)!.unsubscribe(pointId)
    } else {
      defaultDataService?.unsubscribe(pointId)
    }
  }
  nodeDataSubscriptions.clear()
  nodeServiceKeys.clear()
  for (const [, service] of dataServiceMap) {
    service.disconnect()
  }
  dataServiceMap.clear()
  defaultDataService?.disconnect()
}

function syncGraphToStore() {
  if (!graph) return
  const data = graph.toJSON()
  const nodes = data.cells
      .filter((cell: any) => !('source' in cell && 'target' in cell))
      .map((node: any) => ({
        ...node,
        x: node.position?.x ?? node.x ?? 0,
        y: node.position?.y ?? node.y ?? 0,
      }))
  const edges = data.cells.filter(
      (cell: any) => 'source' in cell && 'target' in cell
  )
  editorStore.setGraphData({nodes, edges})
}

function loadGraphData(data: GraphData) {
  if (!graph) return
  const g = graph

  unbindAllNodes()

  const x6Data = {
    cells: [
      ...data.nodes.map(n => ({ ...n, position: { x: n.x || 0, y: n.y || 0 } })),
      ...data.edges,
    ],
  }
  g.batchUpdate(() => {
    g.clearCells()
    g.fromJSON(x6Data)
  })

  const generator = PointIdGenerator.getInstance()
  if (graph) {
    generator.initFromNodes(graph.getNodes())
  }

  for (const node of g.getNodes()) {
    const nodeData = node.getData()
    if (nodeData?.binding?.pointId) {
      bindNodeData(node)
    }
    applyNodeAnimation(node)
  }
}

function updateNodePosition(nodeId: string, x: number, y: number) {
  if (!graph) return
  const cell = graph.getCellById(nodeId)
  if (cell && cell.isNode()) {
    isSyncingPosition = true
    cell.setPosition({ x, y })
    syncGraphToStore()
    nextTick(() => {
      isSyncingPosition = false
    })
  }
}

// ===================== 5. 组件卸载前清理 =====================
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null

  unbindAllNodes()

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
