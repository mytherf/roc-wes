import type { Graph, Node, Edge } from '@antv/x6'

/**
 * 校验结果
 */
export interface ValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
}

/**
 * DAG 校验器
 * 检查工作流是否满足 DAG（有向无环图）约束
 * 参考：企业级流程设计器的 DAG 校验兜底策略[reference:0]
 */
export class DagValidator {
    private graph: Graph

    constructor(graph: Graph) {
        this.graph = graph
    }

    /**
     * 执行完整校验
     */
    validate(): ValidationResult {
        const errors: string[] = []
        const warnings: string[] = []

        const nodes = this.graph.getNodes()
        const edges = this.graph.getEdges()

        // 1. 检查是否有开始节点
        const startNodes = nodes.filter((n) => n.shape === 'workflow-start')
        if (startNodes.length === 0) {
            errors.push('工作流必须包含一个开始节点')
        } else if (startNodes.length > 1) {
            errors.push(`工作流只能有一个开始节点，当前有 ${startNodes.length} 个`)
        }

        // 2. 检查是否有结束节点
        const endNodes = nodes.filter((n) => n.shape === 'workflow-end')
        if (endNodes.length === 0) {
            warnings.push('建议包含至少一个结束节点')
        }

        // 3. 检查孤立节点（没有入边和出边的节点）
        const nodeIds = new Set(nodes.map((n) => n.id))
        const hasInEdge = new Set<string>()
        const hasOutEdge = new Set<string>()

        for (const edge of edges) {
            const sourceId = edge.getSourceCellId()
            const targetId = edge.getTargetCellId()
            if (nodeIds.has(sourceId)) hasOutEdge.add(sourceId)
            if (nodeIds.has(targetId)) hasInEdge.add(targetId)
        }

        for (const node of nodes) {
            // 开始节点允许没有入边
            if (node.shape === 'workflow-start') continue
            // 结束节点允许没有出边
            if (node.shape === 'workflow-end') continue

            if (!hasInEdge.has(node.id)) {
                warnings.push(`节点 "${node.id}" 没有入边，可能无法被执行到`)
            }
            if (!hasOutEdge.has(node.id)) {
                warnings.push(`节点 "${node.id}" 没有出边，执行将在此终止`)
            }
        }

        // 4. 检查环（DFS 检测）
        const cycleResult = this.detectCycle()
        if (cycleResult.hasCycle) {
            errors.push(`检测到循环依赖：${cycleResult.cycle.join(' → ')}`)
        }

        // 5. 检查条件节点的分支
        for (const node of nodes) {
            if (node.shape === 'condition-node') {
                const data = node.getData()
                const branches = data?.branches || []
                if (branches.length < 2) {
                    warnings.push(`条件节点 "${node.id}" 的分支数量少于 2，建议至少配置 2 个分支`)
                }
                // 检查出边数量是否匹配分支数量
                const outEdges = edges.filter((e) => e.getSourceCellId() === node.id)
                if (outEdges.length !== branches.length) {
                    warnings.push(
                        `条件节点 "${node.id}" 的出边数量 (${outEdges.length}) 与分支数量 (${branches.length}) 不匹配`
                    )
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        }
    }

    /**
     * 检测图中是否有环（DFS）
     * 参考：DAG 校验的环检测（DFS）策略[reference:1]
     */
    private detectCycle(): { hasCycle: boolean; cycle: string[] } {
        const nodes = this.graph.getNodes()
        const nodeIds = nodes.map((n) => n.id)
        const adjacency = new Map<string, string[]>()

        // 构建邻接表
        for (const node of nodes) {
            adjacency.set(node.id, [])
        }
        for (const edge of this.graph.getEdges()) {
            const sourceId = edge.getSourceCellId()
            const targetId = edge.getTargetCellId()
            if (adjacency.has(sourceId) && adjacency.has(targetId)) {
                adjacency.get(sourceId)!.push(targetId)
            }
        }

        const visited = new Set<string>()
        const recursionStack = new Set<string>()
        const path: string[] = []

        const dfs = (nodeId: string): boolean => {
            if (recursionStack.has(nodeId)) {
                // 找到环
                const cycleStart = path.indexOf(nodeId)
                return true
            }
            if (visited.has(nodeId)) return false

            visited.add(nodeId)
            recursionStack.add(nodeId)
            path.push(nodeId)

            for (const neighbor of adjacency.get(nodeId) || []) {
                if (dfs(neighbor)) {
                    return true
                }
            }

            recursionStack.delete(nodeId)
            path.pop()
            return false
        }

        for (const nodeId of nodeIds) {
            if (!visited.has(nodeId)) {
                path.length = 0
                if (dfs(nodeId)) {
                    return { hasCycle: true, cycle: [...path] }
                }
            }
        }

        return { hasCycle: false, cycle: [] }
    }
}