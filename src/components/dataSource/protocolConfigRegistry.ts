// ========== 数据源协议专属参数注册表（开闭原则扩展点）==========
// 新增一种数据源协议时只需：
//   1. 在 DataSourceType 联合类型中增加标识（stores/dataSource.ts）
//   2. （可选）新建协议专属参数子组件 XxxProtocolConfig.vue
//   3. 在下方 PROTOCOL_CONFIG_REGISTRY 追加一条注册项
// 对话框的类型下拉、专属参数渲染、表单默认值与保存 config 构建
// 全部由本注册表驱动，无需再改动 DataSourceDialog.vue。
//
// 约定：设备/服务地址一律存数据源 url，注册项只负责
// 「无法从地址推导」的协议专属参数（如从站地址、机架槽号、轮询间隔）。

import type { Component } from 'vue'
import type { DataSourceType } from '@/stores/dataSource'
import ModbusProtocolConfig from './ModbusProtocolConfig.vue'
import S7ProtocolConfig from './S7ProtocolConfig.vue'
import OpcProtocolConfig from './OpcProtocolConfig.vue'
import HttpProtocolConfig from './HttpProtocolConfig.vue'

/** 协议注册项 */
export interface ProtocolConfigEntry {
    /** 类型下拉显示名 */
    label: string
    /** 真实设备模式渲染的专属参数子组件（无专属参数的协议不填）；
     *  组件契约：prop `form`（父组件响应式表单，v-model 原地修改专属字段） */
    component?: Component
    /** 专属表单字段的默认值（resetForm 重置 / openEdit 回填兜底共用） */
    formDefaults?: Record<string, number>
    /** 保存时从表单提取协议专属 config（公共字段 demo/profile 由对话框统一写入） */
    buildConfig?: (form: Record<string, any>) => Record<string, any>
}

/** 类型下拉显示顺序（数组顺序即下拉顺序；注册表中未列出的类型不出现在下拉中） */
export const PROTOCOL_TYPE_ORDER: DataSourceType[] = [
    'websocket',
    'mqtt',
    'http',
    'sse',
    's7',
    'opc',
    'modbus',
]

/** 协议专属参数注册表：type → 注册项 */
export const PROTOCOL_CONFIG_REGISTRY: Partial<Record<DataSourceType, ProtocolConfigEntry>> = {
    websocket: { label: 'WebSocket' },
    mqtt: { label: 'MQTT' },
    http: {
        label: 'HTTP 轮询',
        component: HttpProtocolConfig,
        formDefaults: { interval: 2000 },
        buildConfig: (f) => ({ interval: Number(f.interval) || 2000 }),
    },
    sse: { label: 'SSE' },
    s7: {
        label: '西门子 S7',
        component: S7ProtocolConfig,
        formDefaults: { rack: 0, slot: 2, pollInterval: 1000 },
        buildConfig: (f) => ({
            rack: Number(f.rack) || 0,
            slot: Number(f.slot) || 2,
            pollInterval: Number(f.pollInterval) || 1000,
        }),
    },
    opc: {
        label: 'OPC UA',
        component: OpcProtocolConfig,
        formDefaults: { pollInterval: 1000 },
        buildConfig: (f) => ({ pollInterval: Number(f.pollInterval) || 1000 }),
    },
    modbus: {
        label: 'Modbus',
        component: ModbusProtocolConfig,
        formDefaults: { unitId: 1, pollInterval: 1000 },
        buildConfig: (f) => ({
            unitId: Number(f.unitId) || 1,
            pollInterval: Number(f.pollInterval) || 1000,
        }),
    },
}

/** 类型下拉选项（按 PROTOCOL_TYPE_ORDER 顺序） */
export function getProtocolTypes(): DataSourceType[] {
    return PROTOCOL_TYPE_ORDER
}

/** 类型显示名（注册表优先；未注册时原样返回） */
export function getProtocolLabel(type: DataSourceType): string {
    return PROTOCOL_CONFIG_REGISTRY[type]?.label ?? type
}

/** 真实设备模式的专属参数子组件（未注册子组件的协议返回 null，不渲染） */
export function getProtocolConfigComponent(type: DataSourceType): Component | null {
    return PROTOCOL_CONFIG_REGISTRY[type]?.component ?? null
}

/** 全部协议的专属表单字段默认值合并（供 resetForm 使用） */
export function getProtocolFormDefaults(): Record<string, number> {
    return Object.values(PROTOCOL_CONFIG_REGISTRY).reduce<Record<string, number>>(
        (acc, entry) => Object.assign(acc, entry.formDefaults),
        {}
    )
}

/**
 * 构建保存用的数据源 config：
 * 公共字段 demo/profile 由对话框统一写入，协议专属字段按注册项 buildConfig 提取。
 */
export function buildDataSourceConfig(
    type: DataSourceType,
    form: Record<string, any>
): Record<string, any> {
    const config: Record<string, any> = { demo: form.demo }
    if (form.profile) config.profile = form.profile
    const entry = PROTOCOL_CONFIG_REGISTRY[type]
    if (entry?.buildConfig) Object.assign(config, entry.buildConfig(form))
    return config
}
