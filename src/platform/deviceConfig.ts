// ========== 设备配置转换层（数据源配置 → Rust 网关配置）==========
// 背景：工业设备（Modbus/S7/OPC）与演示模式的连接均由 Rust 原生网关负责。
// 前端「数据源管理」里保存的通用配置（host/port/unitId 等）格式与 Rust 的
// DeviceConfig 结构不同，本模块负责把两者互相翻译。

/**
 * 数据源配置 → Rust DeviceConfig 映射
 *
 * 把「数据源管理」里保存的 config 映射为
 * Rust `gateway_core::config::DeviceConfig`（camelCase），交给 gateway_connect。
 */

import { BUILTIN_MOCK_URLS } from '@/stores/dataSource' // 内置演示标识地址表（用于识别演示模式）
import type { DeviceConfig } from '@/services/IpcGatewayService' // Rust 侧设备配置的 TS 类型定义

// 工具函数：把任意值安全地转成数字；
// 用户输入可能是字符串（表单值），转不了或非法时使用 fallback 兜底值
const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'string' ? Number(v) : (v as number)
    return Number.isFinite(n) ? (n as number) : fallback
}

/**
 * 判定某数据源是否为演示模式。
 * 优先读 config.demo（用户显式选择）；
 * 兼容旧数据：地址等于内置演示标识地址即视为演示（历史版本没有 demo 字段）。
 */
export function isDemoSource(sourceType: string, sourceUrl?: string, sourceConfig?: Record<string, any>): boolean {
    // 显式配置了 demo 布尔值 → 直接采信
    if (typeof sourceConfig?.demo === 'boolean') return sourceConfig.demo
    // 旧数据兼容：url 与内置演示标识地址一致 → 视为演示
    if (sourceUrl && sourceUrl === (BUILTIN_MOCK_URLS as Record<string, string>)[sourceType]) return true
    return false
}

/** 支持波形档位的四种 Web 协议（演示模式下 Rust 按其生成特征波形） */
type WebDemoProfile = 'websocket' | 'http' | 'sse' | 'mqtt'
const WEB_DEMO_PROFILES = new Set<string>(['websocket', 'http', 'sse', 'mqtt'])

/**
 * 依据数据源类型与配置构建 Rust DeviceConfig。
 * 演示模式统一映射为 `{ kind:'demo', profile?, pollIntervalMs }`：
 * Rust DemoAdapter 按 profile 生成对应协议的特征波形
 *（websocket=正弦 / http=随机游走 / sse=锯齿 / mqtt=档位）；
 * 工业协议演示省略 profile，由 Rust 侧默认波形兜底。
 * @param sourceType 数据源类型（modbus/s7/opc/...）
 * @param sourceUrl 数据源地址（用于演示模式判断）
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

    // 演示模式：不连接任何真实设备，由 Rust 的 DemoAdapter 定时生成模拟数据
    if (isDemoSource(sourceType, sourceUrl, cfg)) {
        // 四种 Web 协议传递波形档位；工业协议演示省略（Rust 默认波形）
        if (WEB_DEMO_PROFILES.has(sourceType)) {
            return { kind: 'demo', profile: sourceType as WebDemoProfile, pollIntervalMs }
        }
        return { kind: 'demo', pollIntervalMs }
    }

    // 按协议类型分别构造对应的连接参数
    switch (sourceType) {
        // ---- Web 协议真实模式：Rust 原生客户端接管（前端不再直连）----
        case 'websocket':
            return { kind: 'websocket', url: sourceUrl ?? '', pollIntervalMs: num(cfg.pollInterval, 1000) }
        case 'http':
            // 兼容存量数据源的 interval 字段（旧前端 HttpPollingService 轮询间隔）
            return { kind: 'http', url: sourceUrl ?? '', pollIntervalMs: num(cfg.pollInterval ?? cfg.interval, 2000) }
        case 'sse':
            return { kind: 'sse', url: sourceUrl ?? '', pollIntervalMs: num(cfg.pollInterval, 1000) }
        case 'mqtt':
            return { kind: 'mqtt', url: sourceUrl ?? '', pollIntervalMs: num(cfg.pollInterval, 1000) }
        // ---- 工业协议：Rust 原生 TCP 直连 ----
        case 'modbus':
            return {
                kind: 'modbus',
                host: String(cfg.host ?? '127.0.0.1'), // 设备 IP，默认本机
                port: num(cfg.port, 502), // Modbus TCP 默认端口 502
                unitId: num(cfg.unitId, 1), // 从站地址（站号），默认 1
                pollIntervalMs,
            }
        case 's7':
            return {
                kind: 's7',
                host: String(cfg.host ?? '127.0.0.1'),
                port: num(cfg.port, 102), // S7 协议默认端口 102
                rack: num(cfg.rack, 0), // 机架号，默认 0
                slot: num(cfg.slot, 2), // 槽号，默认 2（CPU 通常在此）
                pollIntervalMs,
            }
        case 'opc':
            return {
                kind: 'opc',
                // OPC UA 用 endpoint（端点地址）而非 host/port，默认走 4840 端口
                endpoint: String(cfg.endpoint ?? cfg.url ?? 'opc.tcp://127.0.0.1:4840'),
                pollIntervalMs,
            }
        default:
            // 兜底：未知工业类型按演示处理，避免误连
            return { kind: 'demo', pollIntervalMs }
    }
}
