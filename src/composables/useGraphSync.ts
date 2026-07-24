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
   * 注册画布 → Store 的事件监听
   * 需在 graph 创建后调用（onMounted 内）
   */
  function bindGraphEvents(graph: Graph) {
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
        if (cell.isNode()) {
          const pos = cell.getPosition()
          editorStore.updateNode(cell.id, { x: pos.x, y: pos.y })
        }
      } else {
        editorStore.setSelected(null)
      }
    })
  }

  /**
   * 注册 Store → 画布的 watcher
   * 需在 graph 创建后调用（onMounted 内）
   */
  function bindStoreWatchers() {
    // 位置专用 watcher：仅更新节点位置，避免全量重载
    watch(
      () => editorStore.graphData.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
      (newPositions) => {
        const graph = getGraph()
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

    // 全量 watcher：Store 数据实质变化时重新加载画布
    watch(
      () => editorStore.graphData,
      (newData) => {
        const graph = getGraph()
        if (!graph) return
        // 对比当前画布与 Store 数据，无实质变化则跳过
        const normalized = serializeGraph(graph)
        if (JSON.stringify(newData) === JSON.stringify(normalized)) return

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
    bindGraphEvents,
    bindStoreWatchers,
  }
}
