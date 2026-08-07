// ========== 画布序列化工具 ==========
// X6 画布实例（Graph）无法直接塞进 Pinia store 或持久化文件，
// 需要先转换成纯 JSON 数据（节点数组 + 边数组）。
// 本文件提供统一的序列化/判断函数，供画布组件、工具栏等处复用，
// 避免每个地方都重复写一遍过滤逻辑。

import type { Graph } from '@antv/x6' // X6 的图实例类型

// 序列化后的画布数据结构
export interface SerializedGraphData {
  nodes: any[] // 所有节点
  edges: any[] // 所有边（连线）
}

/**
 * serializeGraph - 将 X6 Graph 序列化为 { nodes, edges } 结构
 *
 * 消除 X6Canvas.vue（2处）和 EditorToolbar.vue（2处）中重复的
 * graph.toJSON() + cells 过滤 + position 归一化逻辑。
 *
 * @param graph - X6 Graph 实例
 * @returns 归一化的 { nodes, edges } 数据
 */
export function serializeGraph(graph: Graph): SerializedGraphData {
  const raw = graph.toJSON() // X6 提供的序列化方法，返回 { cells: [...] }
  // 节点 = 所有 cell 中“不是边”且“不是路线辅助图形”的元素
  // 判断边的方式：边一定带 source 和 target 两个字段
  // 路线辅助图形：带 isRouteOverlay 标记的（路线编辑器在画布上画的辅助元素，不参与业务）
  const nodes = raw.cells
    .filter((cell: any) => !('source' in cell && 'target' in cell) && !cell.data?.isRouteOverlay)
    .map((node: any) => ({
      ...node,
      // 坐标归一化：X6 不同版本可能把坐标放在 position 或直接放在 x/y，统一成 x/y 两个字段
      x: node.position?.x ?? node.x ?? 0,
      y: node.position?.y ?? node.y ?? 0,
    }))
  // 边 = 带 source/target 且不是路线辅助图形的 cell
  const edges = raw.cells.filter(
    (cell: any) => 'source' in cell && 'target' in cell && !cell.data?.isRouteOverlay
  )
  return { nodes, edges }
}

/**
 * isEdge - 判断 cell 是否为边
 * @param cell X6 的节点或边对象
 * @returns true 表示是边（连线），false 表示是节点
 */
export function isEdge(cell: any): boolean {
  return 'source' in cell && 'target' in cell
}
