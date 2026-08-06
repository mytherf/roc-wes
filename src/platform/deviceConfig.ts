/**
 * 数据源配置 → Rust DeviceConfig 映射（Tauri 桌面运行时）
 *
 * 浏览器时代设备参数经 WS `{action:'configure'}` 发给 Node 网关；
 * 迁移后由本模块把「数据源管理」里保存的 config 直接映射为
 * Rust `gateway_core::config::DeviceConfig`（camelCase），交给 gateway_connect。
 */

import { BUILTIN_MOCK_URLS } from '@/stores/dataSource'
import type { DeviceConfig } from '@/services/IpcGatewayService'

const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'string' ? Number(v) : (v as number)
    return Number.isFinite(n) ? (n as number) : fallback
}

/**
 * 判定某数据源是否为演示模式。
 * 优先读 config.demo；兼容旧数据（地址等于内置模拟地址即视为演示）。
 */
export function isDemoSource(sourceType: string, sourceUrl?: string, sourceConfig?: Record<string, any>): boolean {
    if (typeof sourceConfig?.demo === 'boolean') return sourceConfig.demo
    if (sourceUrl && sourceUrl === (BUILTIN_MOCK_URLS as Record<string, string>)[sourceType]) return true
    return false
}

/**
 * 依据数据源类型与配置构建 Rust DeviceConfig。
 * 演示模式统一映射为 `{ kind:'demo' }`（由 Rust DemoAdapter 生成模拟数据）。
 */
export function buildDeviceConfig(
    sourceType: string,
    sourceUrl?: string,
    sourceConfig?: Record<string, any>
): DeviceConfig {
    const cfg = sourceConfig ?? {}
    const pollIntervalMs = num(cfg.pollInterval, 1000)

    if (isDemoSource(sourceType, sourceUrl, cfg)) {
        return { kind: 'demo', pollIntervalMs }
    }

    switch (sourceType) {
        case 'modbus':
            return {
                kind: 'modbus',
                host: String(cfg.host ?? '127.0.0.1'),
                port: num(cfg.port, 502),
                unitId: num(cfg.unitId, 1),
                pollIntervalMs,
            }
        case 's7':
            return {
                kind: 's7',
                host: String(cfg.host ?? '127.0.0.1'),
                port: num(cfg.port, 102),
                rack: num(cfg.rack, 0),
                slot: num(cfg.slot, 2),
                pollIntervalMs,
            }
        case 'opc':
            return {
                kind: 'opc',
                endpoint: String(cfg.endpoint ?? cfg.url ?? 'opc.tcp://127.0.0.1:4840'),
                pollIntervalMs,
            }
        default:
            // 兜底：未知工业类型按演示处理，避免误连
            return { kind: 'demo', pollIntervalMs }
    }
}
