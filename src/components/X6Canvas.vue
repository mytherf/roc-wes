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
// getTeleport() 返回一个 Vue 组件，用于承载所有 Vue 节点。
const TeleportContainer = getTeleport()

// ===================== 2. 响应式引用与实例变量 =====================
// 画布容器的 DOM 引用
const containerRef = ref<HTMLDivElement | null>(null)

// X6 Graph 实例（全局存储，方便后续操作）
let graph: Graph | null = null

// Dnd 拖拽实例（用于侧边栏拖拽）
let dnd: Dnd | null = null

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
// 父组件（App.vue）可以通过 ref 获取到这些实例，用于侧边栏交互。
defineExpose({
  graph,
  dnd,
  bindNodeData,        // 暴露 bindNodeData 方法给父组件
  unbindNodeData,
})


// ===================== 4. 组件挂载后初始化画布 =====================
onMounted(() => {
  // 4.1 确保容器存在
  if (!containerRef.value) return

  // 4.2 创建 Graph 实例
  graph = new Graph({
    container: containerRef.value, // DOM 容器
    autoResize: true,
    grid: true,                    // 显示网格，便于对齐
    background: {color: '#f5f5f5'}, // 浅灰背景
    panning: true,

    // ===== 性能优化配置 =====
    // 启用虚拟渲染：只渲染可视区域内的节点和边[reference:4][reference:5]
    virtual: {
      enabled: true,
      margin: 150, // 缓冲区边距（像素），防止快速滚动时出现空白[reference:6]
    },
    // 滚轮缩放
    mousewheel: {
      enabled: true,
      zoomAtMousePosition: true,
      minScale: 0.2,
      maxScale: 3,
    },

    // ---------- 连线配置（Connecting） ----------
    connecting: {
      // 允许连接到节点（非连接桩也可）
      allowNode: true,
      // 允许连接到连接桩（Port）
      allowPort: true,
      // 不允许从空白处拖出连线（必须从节点开始）
      allowBlank: false,
      // 自动吸附：距离节点 20px 内自动吸附到节点边缘
      snap: {
        radius: 20,
      },
      // 自定义创建边（Edge）的样式
      createEdge: () => {
        return graph!.createEdge({
          shape: 'edge',
          attrs: {
            line: {
              stroke: '#1890ff',      // 蓝色主线
              strokeWidth: 2,
              targetMarker: {
                name: 'block',        // 箭头形状
                width: 12,
                height: 8,
              },
            },
          },
        })
      },
      // 校验连线是否合法（防止自连、重复连接）
      validateConnection: ({sourceCell, targetCell}) => {
        // 不能连接自己
        if (sourceCell === targetCell) return false
        // 不允许重复连接（两个节点之间只能有一条边）
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
  if (!graph) {
    console.error('graph 未初始化')
    return
  }

  // 创建AnimationService
  animationService = new AnimationService(graph)

  // 4.3 注册核心插件（功能增强）

  // ===== 注册 Scroller 插件（可滚动无限画布） =====
  // Scroller 与虚拟渲染配合使用，提供最佳的大规模图渲染性能
  // graph.use(
  //     new Scroller({
  //       enabled: true,
  //       pannable: true,        // 允许拖拽平移画布
  //       autoResize: true,      // 自动调整画布大小
  //       pageVisible: false,     // 显示分页标记
  //       pageBreak: false,
  //       minVisibleWidth: 800,
  //       minVisibleHeight: 600,
  //     })
  // )

  // Selection: shift + 框选 + 多选
  graph.use(
      new Selection({
        enabled: true,        // 启用选择
        multiple: true,       // 允许多选（Ctrl+点击）
        rubberband: true,     // 启用框选（拖动鼠标画框）
        movable: true,        // 选中后可拖动移动
        strict: false,        // 非严格模式（部分包含即选中）
        showNodeSelectionBox: true, // 显示选中框
        modifiers: ['shift'],
      })
  )

  // Clipboard: 复制/剪切/粘贴
  graph.use(
      new Clipboard({
        enabled: true,
        useLocalStorage: false, // 不存入 localStorage，仅内存
      })
  )

  // Keyboard: 快捷键支持
  graph.use(
      new Keyboard({
        enabled: true,
        global: true, // 全局快捷键（即使焦点不在画布上也能生效）
      })
  )

  // 4.4 注册快捷键
  // Ctrl+C: 复制选中的节点/边
  graph.bindKey('ctrl+c', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.copy(cells)
    }
  })

  // Ctrl+V: 粘贴，偏移 20px 防止重叠
  graph.bindKey('ctrl+v', () => {
    if (!graph!.isClipboardEmpty()) {
      graph!.paste({offset: {dx: 20, dy: 20}})
    }
  })

  // Delete / Backspace: 删除选中的元素
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

  // Ctrl+A: 全选所有节点和边
  graph.bindKey('ctrl+a', () => {
    const allCells = graph!.getCells()
    graph!.select(allCells)
  })

  // 撤销/重做快捷键（Ctrl+Z / Ctrl+Shift+Z）
  graph.bindKey('ctrl+z', () => {
    editorStore.undo()
  })
  graph.bindKey('ctrl+shift+z', () => {
    editorStore.redo()
  })

  // 4.5 创建 Dnd 实例（用于侧边栏拖拽）
  dnd = new Dnd({
    target: graph, // 拖拽的目标画布
    // 拖拽过程中显示的节点样式（可以自定义）
    getDragNode: (node) => {
      // 克隆一个节点，并更改样式以表示正在拖拽
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
    // 节点放置到画布后的回调（可在此调整位置或属性）
    getDropNode: (node) => {
      // 返回一个新的节点作为实际放置到画布上的节点
      return node.clone()
    },
  })

  // 4.6 加载初始示例数据（展示 Hello World 和自定义节点）
  // 如果 store 中有数据，则加载，否则使用默认示例数据
  if (editorStore.graphData.nodes.length > 0) {
    loadGraphData(editorStore.graphData)
  }


  // ---------- 4.6 监听画布事件，同步到 Store ----------
  // 注意：所有修改画布的操作都会触发这些事件，我们需要更新 store，
  // 但同时要避免 store 更新触发重新加载导致循环。
  // 我们通过 isUpdatingFromStore 标志来区分。


  graph.on('node:moved', () => {
    if (isUpdatingFromStore) return
    // 保存当前画布数据到 store
    syncGraphToStore()
    // 记录历史（每次变更都保存快照）
    editorStore.pushHistory()
  })
  graph.on('cell:change', () => {
    if (isUpdatingFromStore) return
    // 保存当前画布数据到 store
    syncGraphToStore()
    // 记录历史（每次变更都保存快照）
    editorStore.pushHistory()
  })
  // 当添加或删除单元格时
  graph.on('cell:added', ({cell}) => {
    if (isUpdatingFromStore) return

    if (cell.isNode()) {
      const data = cell.getData()
      // 监听新增节点，自动绑定数据（仅当节点已有 binding 配置时）
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
  // 监听节点删除，释放点ID
  graph.on('cell:removed', ({ cell }) => {
    if (cell.isNode()) {
      const data = cell.getData()
      const generator = PointIdGenerator.getInstance()

      // 释放主 pointId
      if (data?.pointId) {
        generator.release(data.pointId)
      }
      // 释放 binding 中的 pointId
      if (data?.binding?.pointId) {
        generator.release(data.binding.pointId)
      }
    }
  })

  // 当选中变化时
  graph.on('selection:changed', ({selected}) => {
    // 如果有选中的单元格，更新 store 的 selectedId
    if (selected && selected.length > 0) {
      const cell = selected[0]
      editorStore.setSelected(cell.id)
    } else {
      editorStore.setSelected(null)
    }
  })
  // 4.7 可选：监听画布事件，便于调试
  graph.on('cell:click', ({cell}) => {
    console.log('点击了元素:', cell.id)
  })

  // 监听连线完成事件
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

  // ---------- 4.7 监听 store 的 graphData 变化，重新加载画布 ----------
  // 注意：当 store 数据变化（如撤销、重做、加载）时，更新画布
  watch(
      () => editorStore.graphData,
      (newData) => {
        // 如果新数据与当前画布数据相同，则跳过（避免循环）
        // 我们通过比较 JSON 字符串来判断
        const currentData = graph!.toJSON()
        const newDataStr = JSON.stringify(newData)
        const currentDataStr = JSON.stringify(currentData)
        if (newDataStr === currentDataStr) return

        // 标记正在从 store 更新
        isUpdatingFromStore = true
        // 加载新数据
        loadGraphData(newData)
        // 恢复选中状态
        if (editorStore.selectedId) {
          const cell = graph!.getCellById(editorStore.selectedId)
          if (cell) {
            graph!.select(cell)
          }
        }
        // 重置标志
        nextTick(() => {
          isUpdatingFromStore = false
        })
      },
      {deep: true}
  )

// 初始化数据服务（使用模拟服务，可替换为 WebSocketService）
  dataService = new MockDataService()
  // 或使用 WebSocket: dataService = new WebSocketService('ws://localhost:8080/ws')

  // 监听节点数据变化（当 binding 配置变化时重新绑定）
  graph.on('cell:change:data', ({cell}) => {
    if (cell.isNode()) {
      // 检查 binding 是否变化
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


// 为节点设置动画（示例：在节点数据中配置 animation）
function applyNodeAnimation(node: any) {
  const data = node.getData()
  if (data?.animation) {
    animationService?.setAnimation(node.id, data.animation)
  }
}

/**
 * 为节点绑定数据源
 * 从节点的 data 中读取 binding 配置
 */
function bindNodeData(node: any) {
  const nodeData = node.getData()
  const binding = nodeData?.binding as DataBindingConfig | undefined
  if (!binding?.pointId) return

  // 如果已有订阅，先取消
  if (nodeDataSubscriptions.has(node.id)) {
    dataService?.unsubscribe(nodeDataSubscriptions.get(node.id)!)
    nodeDataSubscriptions.delete(node.id)
  }

  // 订阅数据
  dataService?.subscribe(binding.pointId, (point) => {
    // 更新节点数据
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
    // 触发 Vue 组件更新（通过 change:data 事件）
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

/**
 * 清理所有数据订阅
 */
function unbindAllNodes() {
  for (const [_nodeId, pointId] of nodeDataSubscriptions) {
    dataService?.unsubscribe(pointId)
  }
  nodeDataSubscriptions.clear()
}

/**
 * 将当前画布数据同步到 store
 */
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

/**
 * 加载数据到画布
 */
function loadGraphData(data: GraphData) {
  if (!graph) return

  // TypeScript 无法在 batchUpdate 的回调闭包中保证它不为 null（因为理论上闭包执行时 graph 可能被外部改为 null）
  // 解决方法是在函数开头将 graph 赋值给一个 const 局部变量，这样 TypeScript 可以进行类型收窄
  const g = graph

  g.batchUpdate(() => {
    g.clearCells()
    g.fromJSON(data)
  })

  // g.centerContent()
  // 初始化点ID生成器
  const generator = PointIdGenerator.getInstance()
  if (graph) {
    generator.initFromNodes(graph.getNodes())
  }
}

// 在 X6Canvas.vue 中添加批量操作方法
function batchAddNodes(nodes: any[]) {
  if (!graph) return

  const g = graph
  g.batchUpdate(() => {
    for (const nodeConfig of nodes) {
      g.addNode(nodeConfig)
    }
  })

}

// 批量添加边的示例
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
    graph.dispose() // 释放 X6 资源
    graph = null
  }
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