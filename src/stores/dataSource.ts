import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 数据源类型 */
export type DataSourceType = 'websocket' | 'mqtt' | 'http' | 'sse'

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
    /** 数据源地址（如 ws://host:port/path） */
    url: string
    /** 备注说明（可选） */
    description?: string
}

/** 数据源类型显示名 */
export const DATA_SOURCE_TYPE_LABELS: Record<DataSourceType, string> = {
    websocket: 'WebSocket',
    mqtt: 'MQTT',
    http: 'HTTP 轮询',
    sse: 'SSE',
}

/**
 * 数据源管理 Store
 * 负责数据源实例的 CRUD 与持久化（localStorage）。
 */
export const useDataSourceStore = defineStore(
    'dataSource',
    () => {
        // ---------- 状态 ----------
        const dataSources = ref<DataSource[]>([])

        // ---------- 操作（Actions） ----------
        /** 新增数据源，返回生成的实例 */
        function addDataSource(input: Omit<DataSource, 'id'>): DataSource {
            const ds: DataSource = {
                ...input,
                id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            }
            dataSources.value.push(ds)
            return ds
        }

        /** 更新数据源（按 id） */
        function updateDataSource(id: string, updates: Partial<Omit<DataSource, 'id'>>) {
            const idx = dataSources.value.findIndex(d => d.id === id)
            if (idx === -1) return
            dataSources.value[idx] = { ...dataSources.value[idx], ...updates, id }
        }

        /** 删除数据源（按 id） */
        function deleteDataSource(id: string) {
            const idx = dataSources.value.findIndex(d => d.id === id)
            if (idx !== -1) dataSources.value.splice(idx, 1)
        }

        /** 根据 id 获取数据源 */
        function getDataSource(id: string): DataSource | undefined {
            return dataSources.value.find(d => d.id === id)
        }

        return {
            dataSources,
            addDataSource,
            updateDataSource,
            deleteDataSource,
            getDataSource,
        }
    },
    {
        // 持久化到 localStorage
        persist: {
            key: 'roc-wes-datasources',
            pick: ['dataSources'],
        },
    }
)
