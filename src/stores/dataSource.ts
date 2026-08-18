// ========== 数据源 Store（全局数据源管理）==========
// 什么是“数据源”？
//   画布上的每个节点（如仪表、指示灯）都要显示真实数据，这些数据来自哪里？
//   数据源就是数据“来源”的配置，比如一个 WebSocket 服务器、一个 MQTT 主题、
//   一台 Modbus PLC 设备等。节点通过 sourceId 绑定到某个数据源实例，
//   运行时就从这个数据源订阅/轮询数据来驱动节点动画。
// 本文件职责：数据源实例的增删改查 + 类型定义 + 持久化。

import { defineStore } from 'pinia'
import { ref, watch, toRaw, nextTick } from 'vue'
import { readJsonFile, writeJsonFile } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）
import { useProjectStore } from './project' // 多工程：数据源按工程隔离，路径由 project store 提供

/** 数据源类型：目前支持 7 种协议/方式 */
export type DataSourceType = 'websocket' | 'mqtt' | 'http' | 'sse' | 's7' | 'opc' | 'modbus'

/**
 * 数据源实例定义
 * 由「数据源管理」对话框统一创建/维护，
 * 节点的数据绑定通过 sourceId 引用这里配置的实例。
 */
export interface DataSource {
    /** 唯一 ID */
    id: string
    /** 显示名称 */
    name: string
    /** 数据源类型 */
    type: DataSourceType
    /** 数据源地址（如 ws://host:port/path；Modbus/S7 为 主机[:端口]，OPC UA 为端点 URL）；演示模式下为空 */
    url: string
    /** 备注说明（可选） */
    description?: string
    /** 协议特定参数（可选，如 Modbus 的 unitId/pollInterval、演示标志 demo 等；设备地址一律存 url） */
    config?: Record<string, any>
}

/** 数据源类型显示名 */
export const DATA_SOURCE_TYPE_LABELS: Record<DataSourceType, string> = {
    websocket: 'WebSocket',
    mqtt: 'MQTT',
    http: 'HTTP 轮询',
    sse: 'SSE',
    s7: '西门子 S7',
    opc: 'OPC UA',
    modbus: 'Modbus',
}

/**
 * 数据源管理 Store
 * 负责数据源实例的 CRUD 与持久化（文件落盘：当前工程的 datasources.json）。
 */
export const useDataSourceStore = defineStore(
    'dataSource',
    () => {
        // ---------- 状态 ----------
        const dataSources = ref<DataSource[]>([])
        // 数据源列表是否已从文件加载完成（首次加载 / 切换工程完成后置 true）
        // 画布数据绑定（bindAllNodes）在画布加载时同步执行，而数据源列表加载是异步的；
        // 绑定先于加载完成时解析不到 sourceId，需等待 loaded 后再重绑（见 X6Canvas / RunView）
        const loaded = ref(false)

        // ---------- 持久化（文件落盘，替代 pinia-plugin-persistedstate） ----------
        // 数据源按工程隔离：保存在当前工程的 projects/<工程id>/datasources.json
        const STORAGE_FILE = 'datasources.json'
        // 重载抑制标志：切换工程重载数据期间不触发 watch 回写
        let suppressWatch = false

        /** 拼接当前工程内的存储路径 */
        function storagePath(): string {
            return useProjectStore().projectPath(STORAGE_FILE)
        }

        // 初始化：等 project store 就绪后从当前工程文件加载
        void (async () => {
            await useProjectStore().ready
            await loadFromStorage()
        })()

        /** 从当前工程文件加载数据源列表
         * @param resetWhenMissing 文件不存在时是否清空。
         *   切换工程时传 true，避免残留上一工程的数据；
         *   首次初始化不传——默认本就是空列表，
         *   且异步加载晚于外部同步写入时不应覆盖（如测试环境）。 */
        async function loadFromStorage(resetWhenMissing = false) {
            suppressWatch = true
            try {
                const parsed = await readJsonFile<{ dataSources: DataSource[] }>(storagePath())
                if (parsed && Array.isArray(parsed.dataSources)) {
                    dataSources.value = parsed.dataSources
                } else if (resetWhenMissing) {
                    dataSources.value = []
                }
                // 等 watch 回调周期过去再解除抑制，避免重载数据被回写
                await nextTick()
            } finally {
                suppressWatch = false
                // 加载完成（成功 / 失败 / 无文件均置位），供画布数据绑定等待后重试
                loaded.value = true
            }
        }

        /** 切换工程时重载数据源 */
        async function reloadForProject() {
            // 置回未加载：加载完成后再次触发画布补绑（新工程的数据源已变化）
            loaded.value = false
            await loadFromStorage(true)
        }

        /** 立即保存当前数据源到文件（切换工程前由 project store 调用） */
        function saveNow() {
            if (suppressWatch) return
            void writeJsonFile(storagePath(), { dataSources: toRaw(dataSources.value) })
        }

        // 数据源列表变化时自动保存到文件（增删改均走此通道，无需手动调用）
        watch(
            dataSources,
            () => {
                if (suppressWatch) return // 重载期间的整体替换不回写
                void writeJsonFile(storagePath(), { dataSources: toRaw(dataSources.value) })
            },
            { deep: true }
        )

        // ---------- 操作（Actions） ----------
        /** 新增数据源，返回生成的实例
         * @param input 除 id 外的数据源信息（id 由本函数自动生成）
         * @returns 生成完毕（含 id）的数据源对象 */
        function addDataSource(input: Omit<DataSource, 'id'>): DataSource {
            // 生成唯一 id：时间戳 + 随机串，避免重复
            const ds: DataSource = {
                ...input,
                id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            }
            dataSources.value.push(ds) // 追加到响应式数组（界面会自动刷新）
            return ds
        }

        /** 更新数据源（按 id 定位，用新值替换旧值） */
        function updateDataSource(id: string, updates: Partial<Omit<DataSource, 'id'>>) {
            const idx = dataSources.value.findIndex(d => d.id === id) // 找到目标下标
            if (idx === -1) return // 找不到则什么都不做
            // 不可变更新：创建新对象合并旧值+新值，替换数组中的元素
            dataSources.value[idx] = { ...dataSources.value[idx], ...updates, id }
        }

        /** 删除数据源（按 id） */
        function deleteDataSource(id: string) {
            const idx = dataSources.value.findIndex(d => d.id === id)
            if (idx !== -1) dataSources.value.splice(idx, 1) // splice 从数组中移除该元素
        }

        /** 根据 id 获取数据源（供节点绑定/服务层查询使用） */
        function getDataSource(id: string): DataSource | undefined {
            return dataSources.value.find(d => d.id === id)
        }

        return {
            dataSources, // 所有数据源列表（响应式）
            loaded, // 数据源列表加载完成标志（供画布绑定等待后重试）
            addDataSource,
            updateDataSource,
            deleteDataSource,
            getDataSource,
            saveNow,
            reloadForProject,
        }
    }
)
