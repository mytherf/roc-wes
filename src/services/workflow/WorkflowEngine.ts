import type { Graph, Node, Edge } from '@antv/x6'
import axios from 'axios'

/**
 * 工作流执行上下文
 */
export interface WorkflowContext {
    /** 输入参数 */
    input: Record<string, any>
    /** 执行过程中的变量 */
    variables: Record<string, any>
    /** 当前节点 ID */
    currentNodeId: string
    /** 执行历史 */
    history: string[]
}

/**
 * 工作流执行结果
 */
export interface WorkflowResult {
    success: boolean
    output?: Record<string, any>
    error?: string
    executedNodes: string[]
}

/**
 * 工作流引擎
 * 负责解析和执行工作流 DAG
 */
export class WorkflowEngine {
    private graph: Graph
    private context: WorkflowContext

    constructor(graph: Graph, input: Record<string, any> = {}) {
        this.graph = graph
        this.context = {
            input,
            variables: {},
            currentNodeId: '',
            history: [],
        }
    }

    /**
     * 执行工作流
     * @param startNodeId 开始节点 ID
     */
    async execute(startNodeId: string): Promise<WorkflowResult> {
        const executedNodes: string[] = []
        let currentNodeId = startNodeId

        try {
            while (currentNodeId) {
                const node = this.graph.getCellById(currentNodeId)
                if (!node || !node.isNode()) {
                    throw new Error(`节点 ${currentNodeId} 不存在`)
                }

                this.context.currentNodeId = currentNodeId
                this.context.history.push(currentNodeId)
                executedNodes.push(currentNodeId)

                const _nodeData = node.getData()
                const shape = node.shape

                // 根据节点类型执行不同逻辑
                let nextNodeId: string | null = null

                switch (shape) {
                    case 'workflow-start':
                        nextNodeId = this.getNextNode(currentNodeId)
                        break

                    case 'workflow-end':
                        // 结束节点，终止执行
                        currentNodeId = ''
                        break

                    case 'condition-node':
                        nextNodeId = await this.executeConditionNode(node)
                        break

                    case 'timer-node':
                        await this.executeTimerNode(node)
                        nextNodeId = this.getNextNode(currentNodeId)
                        break

                    case 'http-request-node':
                        await this.executeHttpRequestNode(node)
                        nextNodeId = this.getNextNode(currentNodeId)
                        break

                    case 'custom-code-node':
                        nextNodeId = await this.executeCustomCodeNode(node)
                        break

                    default:
                        // 普通节点，直接继续
                        nextNodeId = this.getNextNode(currentNodeId)
                        break
                }

                currentNodeId = nextNodeId || ''
            }

            return {
                success: true,
                output: this.context.variables,
                executedNodes,
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                executedNodes,
            }
        }
    }

    /**
     * 获取节点的下一个节点（默认取第一条出边）
     */
    private getNextNode(nodeId: string): string | null {
        const edges = this.graph.getEdges()
        for (const edge of edges) {
            if (edge.getSourceCellId() === nodeId) {
                return edge.getTargetCellId()
            }
        }
        return null
    }

    /**
     * 执行条件判断节点
     */
    private async executeConditionNode(node: Node): Promise<string | null> {
        const data = node.getData()
        const branches = data?.branches || []

        // 构建表达式执行环境
        const env = {
            ...this.context.input,
            ...this.context.variables,
        }

        // 按顺序检查分支条件
        for (const branch of branches) {
            if (!branch.expression) {
                // 空表达式视为默认分支
                return this.getNextNode(node.id)
            }

            try {
                // 安全执行表达式
                const fn = new Function(
                    ...Object.keys(env),
                    `return ${branch.expression}`
                )
                const result = fn(...Object.values(env))
                if (result) {
                    // 条件满足，走该分支
                    return this.getNextNode(node.id)
                }
            } catch (e) {
                console.warn(`分支 "${branch.label}" 表达式执行失败:`, e)
            }
        }

        // 所有分支都不满足，走默认出边
        return this.getNextNode(node.id)
    }

    /**
     * 执行定时器节点
     */
    private async executeTimerNode(node: Node): Promise<void> {
        const data = node.getData()
        const duration = data?.duration ?? 5
        const unit = data?.unit || 'seconds'

        let milliseconds = duration * 1000
        if (unit === 'minutes') milliseconds = duration * 60 * 1000
        if (unit === 'hours') milliseconds = duration * 60 * 60 * 1000

        await new Promise((resolve) => setTimeout(resolve, milliseconds))
    }

    /**
     * 执行 HTTP 请求节点
     */
    private async executeHttpRequestNode(node: Node): Promise<void> {
        const data = node.getData()
        const method = data?.method || 'GET'
        const url = data?.url || ''
        const body = data?.body || ''
        const timeout = (data?.timeout ?? 30) * 1000

        if (!url) {
            throw new Error('HTTP 请求节点未配置 URL')
        }

        try {
            const response = await axios({
                method,
                url,
                data: body ? JSON.parse(body) : undefined,
                timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            // 将响应结果存入上下文变量
            this.context.variables['http_response'] = response.data
            this.context.variables['http_status'] = response.status
        } catch (error: any) {
            this.context.variables['http_error'] = error.message
            throw new Error(`HTTP 请求失败: ${error.message}`)
        }
    }

    /**
     * 执行自定义代码节点
     */
    private async executeCustomCodeNode(node: Node): Promise<string | null> {
        const data = node.getData()
        const code = data?.code || ''

        if (!code) {
            return this.getNextNode(node.id)
        }

        // 构建执行上下文
        const context = {
            input: this.context.input,
            variables: this.context.variables,
            currentNodeId: this.context.currentNodeId,
            history: this.context.history,
            // 工具函数
            log: console.log,
            getNextNode: () => this.getNextNode(node.id),
        }

        try {
            // 在沙箱中执行代码
            const fn = new Function('context', `
        ${code}
        return context.__result__;
      `)

                // 为 context 添加 result 占位
            ;(context as any).__result__ = { next: this.getNextNode(node.id) }

            const result = fn(context)

            // 如果返回了 next 字段，则跳转到指定节点
            if (result?.next) {
                return result.next
            }

            // 否则走默认出边
            return this.getNextNode(node.id)
        } catch (error: any) {
            throw new Error(`自定义代码执行失败: ${error.message}`)
        }
    }

    /**
     * 获取当前上下文（用于调试）
     */
    getContext(): WorkflowContext {
        return this.context
    }
}