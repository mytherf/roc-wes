import { defineStore } from 'pinia'
import { ref, computed } from 'vue'


/**
 * 定义节点和边的数据结构（序列化格式）
 * 与 X6 的 JSON 格式一致
 */
export interface GraphData {
    nodes: any[]
    edges: any[]
}

/**
 * 编辑器 Store
 * 负责管理画布数据、当前选中元素、历史记录（撤销/重做）
 */
export const useEditorStore = defineStore(
    'editor',
    () => {
        // ---------- 状态 ----------
        // 画布数据（节点和边的序列化数组）
        const graphData = ref<GraphData>({ nodes: [], edges: [] })
        // 当前选中元素的 ID（节点或边）
        const selectedId = ref<string | null>(null)
        // 历史记录（存储过去的状态快照）
        const history = ref<GraphData[]>([])
        // 当前历史索引（-1 表示无历史）
        const historyIndex = ref<number>(-1)
        // 最大历史步数
        const MAX_HISTORY = 20

        // ---------- 计算属性 ----------
        // 根据 selectedId 获取当前选中的节点或边（仅用于属性面板展示）
        const selectedElement = computed(() => {
            if (!selectedId.value) return null
            // 在节点中查找
            const node = graphData.value.nodes.find(n => n.id === selectedId.value)
            if (node) return { type: 'node', data: node }
            // 在边中查找
            const edge = graphData.value.edges.find(e => e.id === selectedId.value)
            if (edge) return { type: 'edge', data: edge }
            return null
        })

        // ---------- 操作（Actions） ----------
        /**
         * 设置整个画布数据（用于加载、撤销/重做）
         */
        function setGraphData(data: GraphData) {
            graphData.value = JSON.parse(JSON.stringify(data)) // 深拷贝
        }

        /**
         * 更新节点数据（根据 id 更新）
         * @param nodeId 节点 ID
         * @param updates 要更新的字段
         */
        function updateNode(nodeId: string, updates: Record<string, any>) {
            const node = graphData.value.nodes.find(n => n.id === nodeId)
            if (node) {
                Object.assign(node, updates)
                // 如果更新了数据，需要同步到 X6 画布（由监听器负责）
            }
        }

        /**
         * 更新边数据
         */
        function updateEdge(edgeId: string, updates: Record<string, any>) {
            const edge = graphData.value.edges.find(e => e.id === edgeId)
            if (edge) {
                Object.assign(edge, updates)
            }
        }

        /**
         * 设置当前选中元素
         */
        function setSelected(id: string | null) {
            selectedId.value = id
        }

        /**
         * 保存当前状态到历史记录（在每次数据变化后调用）
         */
        function pushHistory() {
            // 如果当前索引不是最新，则删除后面的历史
            if (historyIndex.value < history.value.length - 1) {
                history.value = history.value.slice(0, historyIndex.value + 1)
            }
            // 添加新状态（深拷贝）
            history.value.push(JSON.parse(JSON.stringify(graphData.value)))
            // 如果超出最大步数，移除最早的一条
            if (history.value.length > MAX_HISTORY) {
                history.value.shift()
            }
            // 更新索引到最新
            historyIndex.value = history.value.length - 1
        }

        /**
         * 撤销
         */
        function undo() {
            if (historyIndex.value > 0) {
                historyIndex.value--
                const data = history.value[historyIndex.value]
                setGraphData(data)
                return true
            }
            return false
        }

        /**
         * 重做
         */
        function redo() {
            if (historyIndex.value < history.value.length - 1) {
                historyIndex.value++
                const data = history.value[historyIndex.value]
                setGraphData(data)
                return true
            }
            return false
        }

        /**
         * 清空历史记录（例如新建画布时）
         */
        function clearHistory() {
            history.value = []
            historyIndex.value = -1
        }

        /**
         * 重置画布（清空所有数据）
         */
        function resetGraph() {
            setGraphData({ nodes: [], edges: [] })
            selectedId.value = null
            clearHistory()
        }

        // ---------- 持久化配置 ----------
        // 使用 pinia-plugin-persistedstate 自动保存到 localStorage
        // 仅持久化 graphData 和 selectedId，历史记录不持久化（太大）
        return {
            graphData,
            selectedId,
            selectedElement,
            history,
            historyIndex,
            setGraphData,
            updateNode,
            updateEdge,
            setSelected,
            pushHistory,
            undo,
            redo,
            clearHistory,
            resetGraph,
        }
    },
    {
        // 持久化选项（仅存储 graphData 和 selectedId）
        persist: {
            key: 'scada-editor',
            pick: ['graphData', 'selectedId'],
        },
    }
)