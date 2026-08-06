import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 数据源类型 */
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
    /** 数据源地址（如 ws://host:port/path） */
    url: string
    /** 备注说明（可选） */
    description?: string
    /** 协议特定的设备连接参数（可选，如 Modbus 的 host/port/unitId/pollInterval/demo） */
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
 * 内置模拟服务地址（开发环境随系统自动启动，见 mock/server.ts）
 * websocket / http / sse / mqtt 四项端口需与 mock/server.ts 中的 MOCK_PORTS 保持一致。
 *
 * 注意：s7 / opc / modbus 三项已无对应本地服务——工业协议的演示与真实接入
 * 均已迁移至 Tauri 桌面端 Rust 原生网关（演示模式由 DemoAdapter 生成）。
 * 此处保留这些地址仅用于识别历史数据源的演示模式
 * （地址等于内置模拟地址即视为演示，见 platform/deviceConfig.ts）。
 */
export const BUILTIN_MOCK_URLS: Record<DataSourceType, string> = {
    websocket: 'ws://localhost:8080/ws',
    http: 'http://localhost:8081/api/data',
    sse: 'http://localhost:8082/sse',
    mqtt: 'ws://localhost:8083',
    s7: 'ws://localhost:8084/s7',
    opc: 'ws://localhost:8085/opc',
    modbus: 'ws://localhost:8086/modbus',
}

/**
 * 独立真实设备网关地址（历史遗留的浏览器时代 WS 网关占位地址）。
 * Node 版网关（原 gateway/ 目录）已随 Tauri 迁移移除：桌面端工业协议
 * 经 Rust 原生网关 IPC 直连设备，连接参数取数据源 config（host/port 等），
 * 不使用此地址；此处保留仅为兼容数据源对话框在真实模式下的表单预填。
 */
export const REAL_GATEWAY_URLS: Partial<Record<DataSourceType, string>> = {
    modbus: 'ws://localhost:19100/modbus',
    s7: 'ws://localhost:19101/s7',
    opc: 'ws://localhost:19102/opc',
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
