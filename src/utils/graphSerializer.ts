import type { Graph } from '@antv/x6'

export interface SerializedGraphData {
  nodes: any[]
  edges: any[]
}

/**
 * serializeGraph - 将 X6 Graph 序列化为 { nodes, edges } 结构
 *
 * 消除 X6Canvas.vue（2处）和 WorkflowToolbar.vue（2处）中重复的
 * graph.toJSON() + cells 过滤 + position 归一化逻辑。
 *
 * @param graph - X6 Graph 实例
 * @returns 归一化的 { nodes, edges } 数据
 */
export function serializeGraph(graph: Graph): SerializedGraphData {
  const raw = graph.toJSON()
  const nodes = raw.cells
    .filter((cell: any) => !('source' in cell && 'target' in cell))
    .map((node: any) => ({
      ...node,
      x: node.position?.x ?? node.x ?? 0,
      y: node.position?.y ?? node.y ?? 0,
    }))
  const edges = raw.cells.filter(
    (cell: any) => 'source' in cell && 'target' in cell
  )
  return { nodes, edges }
}

/**
 * isEdge - 判断 cell 是否为边
 */
export function isEdge(cell: any): boolean {
  return 'source' in cell && 'target' in cell
}
