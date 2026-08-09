// ========== 编辑器 Store（画布核心状态）==========
// 这是整个编辑器的“大脑”，集中管理：
// 1. 画布数据（所有节点和边的序列化描述）
// 2. 当前选中了哪个元素
// 3. 撤销/重做历史记录
// 4. 各面板的折叠状态、显示模式等 UI 状态
// 说明：X6 画布（X6Canvas.vue）与界面（工具栏/属性面板等）之间
//       不直接通信，都通过这个 store 交换数据。

import { defineStore } from 'pinia'
import {shallowRef, ref, computed, toRaw} from 'vue' // shallowRef 浅响应（只替换整体、不深监听）；toRaw 取出原始对象
import { readJsonFile, writeJsonFile } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）


/**
 * 定义节点和边的数据结构（序列化格式）
 * 与 X6 的 JSON 格式一致
 */
export interface GraphData {
    nodes: any[] // 所有节点（每个节点包含 id/position/data 等字段）
    edges: any[] // 所有连线（每条线包含 source/target 端口引用）
}

/** 节点显示模式：full=完整渲染（「极简」按钮） icon=图标模式（紧凑图标卡片，「图标」按钮） */
export type DisplayMode = 'full' | 'icon'

/**
 * 编辑器 Store
 * 负责管理画布数据、当前选中元素、历史记录（撤销/重做）
 */
export const useEditorStore = defineStore(
    'editor',
    () => {
        // ---------- 状态 ----------
        // 画布数据（节点和边的序列化数组）
        // shallowRef：值始终为普通对象（非 Proxy），整体替换触发更新
        const graphData = shallowRef<GraphData>({ nodes: [], edges: [] })
        // 当前选中元素的 ID（节点或边）
        const selectedId = ref<string | null>(null)
        // 是否选中画布本身（点击画布空白处时为 true）
        const canvasSelected = ref(false)
        // 节点显示模式（默认完整渲染）
        const displayMode = ref<DisplayMode>('full')
        // 底部路线面板是否折叠（折叠后仅显示标题条）
        const bottomCollapsed = ref(false)
        // 路线编辑器是否以浮动窗口形式显示（true 时脱离底部停靠，悬浮在画布之上）
        const routeFloating = ref(false)
        // 左侧组件库面板是否折叠
        const sidebarCollapsed = ref(false)
        // 右侧属性面板是否折叠
        const propertyCollapsed = ref(false)
        // 数据源管理对话框是否打开（放入 store 以便属性面板等兄弟组件跳转打开）
        const dataSourceDialogOpen = ref(false)
        // 历史记录（存储过去的状态快照）
        const history = ref<GraphData[]>([])
        // 当前历史索引（-1 表示无历史）
        const historyIndex = ref<number>(-1)
        // 最大历史步数
        const MAX_HISTORY = 20

        // ---------- 计算属性 ----------
        // 根据 selectedId 获取当前选中的节点或边（仅用于属性面板展示）
        // 返回统一格式 { type: 'node'|'edge', data: {...} }，
        // 并展开 data 字段，方便属性面板直接读取所有属性
        const selectedElement = computed(() => {
            if (!selectedId.value) return null
            const node = graphData.value.nodes.find(n => n.id === selectedId.value)
            if (node) {
                const { data: nodeData, ...rest } = node
                return { type: 'node', data: { ...rest, ...nodeData } }
            }
            const edge = graphData.value.edges.find(e => e.id === selectedId.value)
            if (edge) {
                const { data: edgeData, ...rest } = edge
                return { type: 'edge', data: { ...rest, ...edgeData } }
            }
            return null
        })

        // 是否可撤销（供 UI 按钮禁用状态使用）
        const canUndo = computed(() => historyIndex.value > 0)
        // 是否可重做
        const canRedo = computed(() => historyIndex.value < history.value.length - 1)

        // ---------- 操作（Actions） ----------
        /**
         * 设置整个画布数据（用于加载、撤销/重做）
         * 调用方必须传入全新的普通对象（serializeGraph / JSON.parse / toRaw 均满足）
         */
        function setGraphData(data: GraphData) {
            graphData.value = data
        }

        /**
         * 更新节点数据（根据 id 更新）—— 不可变方式：生成新节点、新数组
         * @param nodeId 节点 ID
         * @param updates 要更新的字段
         */
        function updateNode(nodeId: string, updates: Record<string, any>) {
            const nodes = graphData.value.nodes
            const idx = nodes.findIndex(n => n.id === nodeId)
            if (idx === -1) return
            const newNodes = [...nodes]
            newNodes[idx] = { ...nodes[idx], ...updates }
            graphData.value = { nodes: newNodes, edges: graphData.value.edges }
        }

        /**
         * 更新边数据 —— 不可变方式
         */
        function updateEdge(edgeId: string, updates: Record<string, any>) {
            const edges = graphData.value.edges
            const idx = edges.findIndex(e => e.id === edgeId)
            if (idx === -1) return
            const newEdges = [...edges]
            newEdges[idx] = { ...edges[idx], ...updates }
            graphData.value = { nodes: graphData.value.nodes, edges: newEdges }
        }

        /**
         * 切换节点显示模式
         */
        function setDisplayMode(mode: DisplayMode) {
            displayMode.value = mode
        }

        /**
         * 设置底部面板折叠状态
         */
        function setBottomCollapsed(collapsed: boolean) {
            bottomCollapsed.value = collapsed
        }

        /**
         * 切换底部面板折叠/展开
         */
        function toggleBottomCollapsed() {
            bottomCollapsed.value = !bottomCollapsed.value
        }

        /**
         * 设置路线编辑器浮动窗口模式
         */
        function setRouteFloating(floating: boolean) {
            routeFloating.value = floating
        }

        /**
         * 切换路线编辑器 停靠/浮动 模式
         */
        function toggleRouteFloating() {
            routeFloating.value = !routeFloating.value
        }

        /**
         * 设置左侧组件库面板折叠状态
         */
        function setSidebarCollapsed(collapsed: boolean) {
            sidebarCollapsed.value = collapsed
        }

        /**
         * 切换左侧组件库面板折叠/展开
         */
        function toggleSidebarCollapsed() {
            sidebarCollapsed.value = !sidebarCollapsed.value
        }

        /**
         * 设置右侧属性面板折叠状态
         */
        function setPropertyCollapsed(collapsed: boolean) {
            propertyCollapsed.value = collapsed
        }

        /**
         * 切换右侧属性面板折叠/展开
         */
        function togglePropertyCollapsed() {
            propertyCollapsed.value = !propertyCollapsed.value
        }

        /**
         * 设置数据源管理对话框开关（供工具栏按钮与属性面板跳转使用）
         */
        function setDataSourceDialogOpen(open: boolean) {
            dataSourceDialogOpen.value = open
        }

        /**
         * 设置当前选中元素
         * 选中具体元素（id 非空）时清除「画布选中」状态
         */
        function setSelected(id: string | null) {
            selectedId.value = id
            if (id) canvasSelected.value = false
        }

        /**
         * 选中画布本身（点击画布空白处时调用）
         * 清空元素选中并将画布标记为选中
         */
        function selectCanvas() {
            selectedId.value = null
            canvasSelected.value = true
        }

        /**
         * 保存当前状态到历史记录（在每次数据变化后调用）
         * 数据不可变 → 直接存引用，O(1) 零拷贝
         */
        function pushHistory() {
            // 如果当前索引不是最新，则删除后面的历史
            if (historyIndex.value < history.value.length - 1) {
                history.value = history.value.slice(0, historyIndex.value + 1)
            }
            // 添加新状态（不可变对象，存引用即可）
            history.value.push(graphData.value)
            // 如果超出最大步数，移除最早的一条
            if (history.value.length > MAX_HISTORY) {
                history.value.shift()
            }
            // 更新索引到最新
            historyIndex.value = history.value.length - 1
        }

        /**
         * 撤销：历史索引回退一步，把画布数据恢复到上一个快照
         * @returns 是否撤销成功
         */
        function undo() {
            if (historyIndex.value > 0) {
                historyIndex.value--
                // toRaw：把 Vue 的响应式代理还原成普通对象，
                // 避免把代理对象塞进画布导致 X6 处理异常
                graphData.value = toRaw(history.value[historyIndex.value])
                return true
            }
            return false
        }

        /**
         * 重做：历史索引前进一步，恢复到“撤销前”的状态
         * @returns 是否重做成功
         */
        function redo() {
            if (historyIndex.value < history.value.length - 1) {
                historyIndex.value++
                graphData.value = toRaw(history.value[historyIndex.value])
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

        // ---------- 持久化（文件落盘） ----------
        // 数据保存在「应用配置目录」的 editor.json 中（由 fileStorage 写入）：
        // 容量不受限、不随 WebView2 缓存清理丢失。
        // 仍由工具栏「保存」按钮显式触发；启动时异步从文件恢复。
        const STORAGE_FILE = 'editor.json'

        /**
         * 手动保存当前画布与编辑器状态到文件（由「保存」按钮调用）
         * @returns 是否保存成功
         */
        async function saveToStorage(): Promise<boolean> {
            const payload = {
                graphData: toRaw(graphData.value),
                selectedId: selectedId.value,
                displayMode: displayMode.value,
            }
            const ok = await writeJsonFile(STORAGE_FILE, payload)
            if (!ok) console.error('保存画布到文件失败')
            return ok
        }

        /**
         * 从文件恢复状态（store 初始化时异步调用）
         * 文件 IO 是异步的：加载完成前画布可能已挂载，
         * 届时 setGraphData 会触发 X6Canvas 的全量 watcher 自动重载画布。
         */
        async function loadFromStorage() {
            const parsed = await readJsonFile<any>(STORAGE_FILE)
            if (!parsed) return
            if (parsed.graphData) graphData.value = parsed.graphData
            if ('selectedId' in parsed) selectedId.value = parsed.selectedId
            if (parsed.displayMode) displayMode.value = parsed.displayMode
        }

        /**
         * 重置画布（清空所有数据）
         */
        function resetGraph() {
            setGraphData({ nodes: [], edges: [] })
            selectedId.value = null
            clearHistory()
        }

        // 初始化时异步恢复上次保存的画布
        // （文件读取是异步的，不阻塞启动；若画布已挂载，加载完成后 watcher 自动重载）
        loadFromStorage()
        return {
            graphData,
            selectedId,
            canvasSelected,
            displayMode,
            bottomCollapsed,
            routeFloating,
            sidebarCollapsed,
            propertyCollapsed,
            dataSourceDialogOpen,
            selectedElement,
            canUndo,
            canRedo,
            setGraphData,
            updateNode,
            updateEdge,
            setDisplayMode,
            setBottomCollapsed,
            toggleBottomCollapsed,
            setRouteFloating,
            toggleRouteFloating,
            setSidebarCollapsed,
            toggleSidebarCollapsed,
            setPropertyCollapsed,
            togglePropertyCollapsed,
            setDataSourceDialogOpen,
            setSelected,
            selectCanvas,
            pushHistory,
            undo,
            redo,
            clearHistory,
            resetGraph,
            saveToStorage,
        }
    }
)