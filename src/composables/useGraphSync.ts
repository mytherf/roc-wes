// ========== 画布 ↔ Store 双向同步 Composable（编辑器的“神经中枢”）==========
// 所属层级：编辑器核心层，专供 X6Canvas.vue 使用
//
// 用途：把画布（用户拖拽、改属性的图形界面）和 Store（内存数据仓库）
// 两边保持同步，像“双向镜子”一样：
//   - 画布 → Store：用户在画布上移动节点、改尺寸、增删节点时，
//     序列化整个画布写入 Store，并推入历史记录（支持撤销/重做）
//   - Store → 画布：外部程序修改 Store 数据（如导入模板、属性面板改值）时，
//     自动更新画布上的节点（位置/尺寸用轻量更新，结构变化则全量重载）
//
// 关键概念：防循环标志（isUpdatingFromStore 等）——
// 画布和 Store 相互监听，如果不加“我正在更新对方”的标志，
// 就会 A 改 B、B 改 A 无限循环。本文件用多个标志位分别拦截各类循环。

import { nextTick, watch } from 'vue'
import type { Graph } from '@antv/x6'
import type { GraphData } from '@/stores/editor'
import { useEditorStore } from '@/stores/editor'
import { serializeGraph } from '@/utils/graphSerializer'

/**
 * useGraphSync 配置项
 */
export interface GraphSyncOptions {
  /** 获取当前 Graph 实例（graph 在 onMounted 中创建，故用 getter 延迟取值） */
  getGraph: () => Graph | null
  /** Store 数据变化时的全量重载回调（通常为 loadGraphData） */
  onReload: (data: GraphData) => void
  /** 节点被添加到画布后的回调（用于数据绑定、动画等），isUpdatingFromStore 期间不触发 */
  onNodeAdded?: (cell: any) => void
  /** 节点被移除后的回调（用于释放点 ID 等资源） */
  onNodeRemoved?: (cell: any) => void
}

/**
 * 画布 ↔ Store 双向同步 Composable
 *
 * 将 X6Canvas.vue 中分散的同步逻辑（防循环标志、画布事件 → Store、Store → 画布 watcher）
 * 统一封装，降低组件复杂度。
 *
 * - 画布 → Store：监听 node:moved / cell:change / cell:added / cell:removed，
 *   序列化画布并写入 Store，同时推入历史记录。
 * - Store → 画布：位置专用 watcher 仅更新节点坐标（避免全量重载）；
 *   全量 watcher 在数据实质变化时调用 onReload 重新加载画布。
 */
export function useGraphSync(options: GraphSyncOptions) {
  const { getGraph, onReload, onNodeAdded, onNodeRemoved } = options
  const editorStore = useEditorStore()

  // 标记是否正在通过 store 更新画布（防止循环）
  let isUpdatingFromStore = false
  // 标记是否正在同步节点位置（防止 node:moved 触发 syncGraphToStore）
  let isSyncingPosition = false
  // 标记是否正在同步节点尺寸（防止 updateNodeSize 触发重复同步）
  let isSyncingSize = false
  // 标记是否正在拖拽调整大小（期间 cell:change 不推历史，由 node:resized 统一推送）
  let isResizing = false
// 标记是否正在批量调整尺寸（显示模式切换期间，抑制所有自动同步）
  let isSyncSuppressed = false

  /**
   * 设置同步抑制状态（显示模式切换等批量操作期间使用）
   */
  function setSyncSuppressed(suppressed: boolean) {
    isSyncSuppressed = suppressed
  }
  /**
   * 将当前画布数据序列化并写入 Store
   */
  function syncGraphToStore() {
    const graph = getGraph()
    if (!graph) return
    editorStore.setGraphData(serializeGraph(graph))
  }

  /**
   * 更新单个节点位置并同步到 Store（供属性面板等外部调用）
   */
  function updateNodePosition(nodeId: string, x: number, y: number) {
    const graph = getGraph()
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

  /**
   * 更新单个节点尺寸并同步到 Store（供属性面板等外部调用）
   */
  function updateNodeSize(nodeId: string, width: number, height: number) {
    const graph = getGraph()
    if (!graph) return
    const cell = graph.getCellById(nodeId)
    if (cell && cell.isNode()) {
      isSyncingSize = true
      cell.setSize({ width, height })
      syncGraphToStore()
      editorStore.pushHistory()
      nextTick(() => {
        isSyncingSize = false
      })
    }
  }

  /**
   * 注册画布 → Store 的事件监听
   * 需在 graph 创建后调用（onMounted 内）
   */
  function bindGraphEvents(graph: Graph) {
    graph.on('node:moved', () => {
      if (isUpdatingFromStore || isSyncingPosition || isSyncSuppressed) return
      syncGraphToStore()
      editorStore.pushHistory()
    })

    // 节点调整大小开始：标记拖拽中，期间 cell:change 不重复推历史
    graph.on('node:resize', () => {
      isResizing = true
    })

    // 节点调整大小结束：统一同步 + 推历史
    graph.on('node:resized', () => {
      isResizing = false
      if (isUpdatingFromStore || isSyncingSize || isSyncSuppressed) return
      syncGraphToStore()
      editorStore.pushHistory()
    })

    graph.on('cell:change', () => {
      if (isUpdatingFromStore || isSyncingPosition || isSyncingSize || isSyncSuppressed) return
      // 缩放拖拽期间完全跳过同步，避免 store→canvas watcher 反向 setSize 打断拖拽
      // 最终同步由 node:resized 统一处理
      if (isResizing) return
      syncGraphToStore()
      editorStore.pushHistory()
    })

    graph.on('cell:added', ({ cell }) => {
      if (isUpdatingFromStore) return
      if (cell.isNode()) {
        onNodeAdded?.(cell)
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
        onNodeRemoved?.(cell)
      }
    })

    graph.on('selection:changed', ({ selected }) => {
      if (selected && selected.length > 0) {
        const cell = selected[0]
        editorStore.setSelected(cell.id)
      } else {
        editorStore.setSelected(null)
      }
    })

    // 点击画布空白处：选中画布本身，属性面板展示画布属性
    graph.on('blank:click', () => {
      editorStore.selectCanvas()
    })
  }

  /**
   * 注册 Store → 画布的 watcher
   * 需在 graph 创建后调用（onMounted 内）
   */
  function bindStoreWatchers() {
    // 位置/尺寸专用 watcher：仅更新节点坐标和尺寸，避免全量重载
    watch(
      () => editorStore.graphData.nodes.map(n => ({
        id: n.id, x: n.x, y: n.y,
        width: n.size?.width, height: n.size?.height,
      })),
      (newProps) => {
        const graph = getGraph()
        if (!graph || isUpdatingFromStore) return
        isSyncingPosition = true
        isSyncingSize = true
        for (const p of newProps) {
          const cell = graph.getCellById(p.id)
          if (cell && cell.isNode()) {
            const current = cell.getPosition()
            if (current.x !== p.x || current.y !== p.y) {
              cell.setPosition({ x: p.x || 0, y: p.y || 0 })
            }
            if (p.width != null && p.height != null) {
              const size = cell.getSize()
              if (size.width !== p.width || size.height !== p.height) {
                cell.setSize({ width: p.width, height: p.height })
              }
            }
          }
        }
        nextTick(() => {
          isSyncingPosition = false
          isSyncingSize = false
        })
      },
      { deep: true }
    )

    // 全量 watcher：Store 数据实质变化时重新加载画布
    watch(
      () => editorStore.graphData,
      (newData) => {
        const graph = getGraph()
        if (!graph) return
        // 对比当前画布与 Store 数据，无实质变化则跳过
        const normalized = serializeGraph(graph)
        if (isSameGraphData(newData, normalized)) return

        isUpdatingFromStore = true
        const prevSelectedId = editorStore.selectedId
        onReload(newData)
        // 恢复之前的选中状态
        if (prevSelectedId) {
          const cell = graph.getCellById(prevSelectedId)
          if (cell) {
            graph.select(cell)
            editorStore.setSelected(prevSelectedId)
          }
        }
        nextTick(() => {
          isUpdatingFromStore = false
        })
      },
      { deep: true }
    )
  }

  return {
    syncGraphToStore,
    updateNodePosition,
    updateNodeSize,
    bindGraphEvents,
    bindStoreWatchers,
    setSyncSuppressed,
  }
}

/**
 * 运行期遥测字段：由 useDataService 订阅回调直接写入画布节点
 * （node.data.value / _timestamp / _quality，以及点组多点绑定写入的
 * node.data.values[pointId]），并非用户编辑的设计数据。
 * 这些字段在画布侧持续刷新、Store 侧不同步，若参与全量对比，会把任意
 * 属性面板编辑误判为"实质变化"，从而触发整画布重建（见 bindStoreWatchers）：
 * 节点组件被全部销毁重建、画面值回落到 Store 旧快照，表现为"数据丢失"。
 * 对比前剥离这些字段，仅保留设计语义字段参与比较。
 */
const RUNTIME_DATA_KEYS = ['value', '_timestamp', '_quality', 'values']

function stripRuntimeFields(node: any): any {
  const data = node?.data
  if (!data || typeof data !== 'object') return node
  let touched = false
  const cleaned: Record<string, any> = {}
  for (const key of Object.keys(data)) {
    if (RUNTIME_DATA_KEYS.includes(key)) {
      touched = true
      continue
    }
    cleaned[key] = data[key]
  }
  return touched ? { ...node, data: cleaned } : node
}

/**
 * 按 id 排序后逐条对比 nodes/edges，消除 cell 顺序差异导致的误判
 * （导出供单元测试验证运行期字段剥离逻辑）
 */
export function isSameGraphData(a: GraphData, b: GraphData): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false
  const sortById = (arr: any[]) => [...arr].sort((x, y) => String(x.id).localeCompare(String(y.id)))
  const normalizeNodes = (arr: any[]) => sortById(arr).map(stripRuntimeFields)
  return (
      JSON.stringify(normalizeNodes(a.nodes)) === JSON.stringify(normalizeNodes(b.nodes)) &&
      JSON.stringify(sortById(a.edges)) === JSON.stringify(sortById(b.edges))
  )
}
