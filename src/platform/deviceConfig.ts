// ========== 设备配置转换层（数据源配置 → Rust 网关配置）==========
// 背景：全部协议（演示 / Web / 工业设备）的连接均由 Rust 原生网关负责。
// 前端「数据源管理」里保存的通用配置（url、unitId 等）格式与 Rust 的
// DeviceConfig 结构不同，本模块负责把两者互相翻译。
//
// 架构：注册表驱动（开闭原则）——每个协议在 DEVICE_CONFIG_REGISTRY 注册一项
// （真实模式构造器 + 演示模式占位字段），buildDeviceConfig 只负责查表分发；
// 新增协议时仅需追加注册项，无需改动分发逻辑。

/**
 * 数据源配置 → Rust DeviceConfig 映射
 *
 * 把「数据源管理」里保存的 config 映射为
 * Rust `gateway_core::config::DeviceConfig`（camelCase），交给 gateway_connect。
 */

import type { DeviceConfig } from '@/services/IpcGatewayService' // Rust 侧设备配置的 TS 类型定义
import type { DataSourceType } from '@/stores/dataSource'

// 工具函数：把任意值安全地转成数字；
// 用户输入可能是字符串（表单值），转不了或非法时使用 fallback 兜底值
const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'string' ? Number(v) : (v as number)
    return Number.isFinite(n) ? (n as number) : fallback
}

/**
 * 解析「主机[:端口]」形式的设备地址（Modbus / S7 数据源的统一地址字段）。
 * 未带端口时返回协议缺省端口；兼容存量数据源的 config.host / config.port 旧字段。
 */
function parseHostPort(
    addr: string | undefined,
    cfg: Record<string, any>,
    defaultPort: number
): { host: string; port: number } {
    const raw = (addr ?? '').trim()
    if (raw) {
        const idx = raw.lastIndexOf(':')
        if (idx > 0) {
            const port = Number(raw.slice(idx + 1))
            if (Number.isInteger(port) && port > 0) {
                return { host: raw.slice(0, idx).trim(), port }
            }
        }
        return { host: raw, port: defaultPort }
    }
    // 存量兼容：旧数据源把设备地址存在 config.host / config.port
    return { host: String(cfg.host ?? '127.0.0.1'), port: num(cfg.port, defaultPort) }
}

/**
 * 判定某数据源是否为演示模式：仅以 config.demo（用户在数据源对话框中显式选择）为准。
 */
export function isDemoSource(sourceConfig?: Record<string, any>): boolean {
    return sourceConfig?.demo === true
}

/** 演示波形档位（与 Rust `DemoProfile` 一一对应，值为 serde camelCase 串；以波形形状命名，与协议无关） */
export type DemoWave = 'sine' | 'randomWalk' | 'sawtooth' | 'steps'

/** 演示模式可选波形（供数据源对话框下拉；不选则缺省正弦） */
export const DEMO_WAVE_OPTIONS: { value: DemoWave; label: string }[] = [
    { value: 'sine', label: '正弦波（平滑遥测）' },
    { value: 'randomWalk', label: '随机游走（缓慢漂移）' },
    { value: 'sawtooth', label: '锯齿斜升（升满归零）' },
    { value: 'steps', label: '离散档位（阶梯切换）' },
]
const DEMO_WAVES = new Set<string>(['sine', 'randomWalk', 'sawtooth', 'steps'])

/** 校验波形档位值：合法波形名原样返回；其余（含旧版协议名）返回 undefined */
export function normalizeDemoWave(v: unknown): DemoWave | undefined {
    return typeof v === 'string' && DEMO_WAVES.has(v) ? (v as DemoWave) : undefined
}

// ===================== 协议配置注册表 =====================
/** 分布式 Omit：DeviceConfig 是按 protocol 判别的联合，需逐成员裁剪才能保留各协议必填字段 */
type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never

/** 演示模式占位字段类型：各协议联合成员去掉 isMock/pollIntervalMs/profile 后的必填字段 */
type MockPlaceholder = DistributiveOmit<DeviceConfig, 'isMock' | 'pollIntervalMs' | 'profile'>

/**
 * 单个协议的配置转换注册项：
 * - buildReal：真实模式下由数据源地址 + config 构造 Rust DeviceConfig
 * - mockPlaceholder：演示模式下该协议的必填字段占位（地址/设备参数不会被读取，
 *   但 Rust 侧结构校验仍需占位空值）
 */
interface DeviceConfigEntry {
    buildReal(sourceUrl: string | undefined, cfg: Record<string, any>): DeviceConfig
    mockPlaceholder: MockPlaceholder
}

/** Web 类协议注册项工厂：地址即 url，轮询间隔缺省 1000ms */
function urlProtocolEntry(protocol: 'websocket' | 'http' | 'sse' | 'mqtt', defaultPollMs = 1000): DeviceConfigEntry {
    return {
        mockPlaceholder: { protocol, url: '' },
        buildReal: (sourceUrl, cfg) => ({
            protocol,
            url: sourceUrl ?? '',
            pollIntervalMs: num(cfg.pollInterval, defaultPollMs),
        }),
    }
}

/** 按数据源类型注册的协议配置转换项（新增协议在此追加即可） */
const DEVICE_CONFIG_REGISTRY: Partial<Record<DataSourceType, DeviceConfigEntry>> = {
    // ---- Web 协议：Rust 原生客户端接管（前端不再直连）----
    websocket: urlProtocolEntry('websocket'),
    sse: urlProtocolEntry('sse'),
    mqtt: urlProtocolEntry('mqtt'),
    http: {
        mockPlaceholder: { protocol: 'http', url: '' },
        // 兼容存量数据源的 interval 字段（旧前端 HttpPollingService 轮询间隔），缺省 2000ms
        buildReal: (sourceUrl, cfg) => ({
            protocol: 'http',
            url: sourceUrl ?? '',
            pollIntervalMs: num(cfg.pollInterval ?? cfg.interval, 2000),
        }),
    },
    // ---- 工业设备：Rust 原生 TCP 直连（地址统一取数据源 url，与其他协议一致）----
    modbus: {
        mockPlaceholder: { protocol: 'modbus', host: '', port: 502, unitId: 1 },
        buildReal: (sourceUrl, cfg) => {
            const { host, port } = parseHostPort(sourceUrl, cfg, 502) // Modbus TCP 默认端口 502
            return {
                protocol: 'modbus',
                host,
                port,
                unitId: num(cfg.unitId, 1), // 从站地址（站号），默认 1
                pollIntervalMs: num(cfg.pollInterval, 1000),
            }
        },
    },
    s7: {
        mockPlaceholder: { protocol: 's7', host: '', port: 102, rack: 0, slot: 2 },
        buildReal: (sourceUrl, cfg) => {
            const { host, port } = parseHostPort(sourceUrl, cfg, 102) // S7 协议默认端口 102
            return {
                protocol: 's7',
                host,
                port,
                rack: num(cfg.rack, 0), // 机架号，默认 0
                slot: num(cfg.slot, 2), // 槽号，默认 2（CPU 通常在此）
                pollIntervalMs: num(cfg.pollInterval, 1000),
            }
        },
    },
    opc: {
        mockPlaceholder: { protocol: 'opc', endpoint: '' },
        buildReal: (sourceUrl, cfg) => ({
            protocol: 'opc',
            // OPC UA 地址即端点 URL（opc.tcp://...），兼容存量 config.endpoint 旧字段
            endpoint: (sourceUrl ?? '').trim() || String(cfg.endpoint ?? cfg.url ?? 'opc.tcp://127.0.0.1:4840'),
            pollIntervalMs: num(cfg.pollInterval, 1000),
        }),
    },
}

/** 未知类型兜底项：演示占位（websocket），避免误连真实设备 */
const FALLBACK_ENTRY: DeviceConfigEntry = urlProtocolEntry('websocket')

/**
 * 依据数据源类型与配置构建 Rust DeviceConfig。
 * 演示模式不是独立协议：`protocol` 保持数据源原协议类型 + `isMock: true`，
 * 由 Rust 工厂统一路由到 DemoAdapter；
 * 波形优先取用户在数据源配置中选择的 config.profile（任意协议均可指定）；
 * 未选择或非法时省略 profile，由 Rust 侧缺省正弦波兜底（全部协议一致）。
 * @param sourceType 数据源类型（modbus/s7/opc/...）
 * @param sourceUrl 数据源地址（真实模式下的连接地址，演示模式下可为空）
 * @param sourceConfig 数据源管理里保存的设备参数
 * @returns Rust 网关认识的 DeviceConfig 对象
 */
export function buildDeviceConfig(
    sourceType: string,
    sourceUrl?: string,
    sourceConfig?: Record<string, any>
): DeviceConfig {
    const cfg = sourceConfig ?? {} // 配置可能为空，兜底成空对象
    const pollIntervalMs = num(cfg.pollInterval, 1000) // 轮询间隔，默认 1000ms
    const entry = DEVICE_CONFIG_REGISTRY[sourceType as DataSourceType] ?? FALLBACK_ENTRY

    // 演示模式：不连接任何真实设备，由 Rust 的 DemoAdapter 定时生成模拟数据。
    // protocol 保持原协议类型，isMock 标识演示；地址/设备参数不会被读取，
    // 但各协议必填字段仍需占位空值（取注册项的 mockPlaceholder）
    if (isDemoSource(cfg)) {
        // 波形：仅当用户显式选择了合法档位才下发 profile；未选/非法一律省略，
        // 由 Rust 缺省正弦波兜底（全部协议一致）
        const profile = normalizeDemoWave(cfg.profile)
        return { ...entry.mockPlaceholder, isMock: true, pollIntervalMs, ...(profile ? { profile } : {}) }
    }

    // 兜底：未注册的类型按演示处理，避免误连
    if (!DEVICE_CONFIG_REGISTRY[sourceType as DataSourceType]) {
        return { ...FALLBACK_ENTRY.mockPlaceholder, isMock: true, pollIntervalMs }
    }

    // 真实模式：查表分发到协议的构造器
    return entry.buildReal(sourceUrl, cfg)
}
