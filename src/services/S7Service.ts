import { GatewayService } from './GatewayService'

/**
 * 西门子 S7 设备连接参数（由「数据源管理」界面配置，随数据源持久化）
 */
export interface S7DeviceConfig {
    /** PLC 主机地址（IP / 域名） */
    host?: string
    /** S7comm 端口（默认 102） */
    port?: number
    /** 机架号（默认 0） */
    rack?: number
    /** 槽号（S7-300/400 默认 2，S7-1200/1500 通常为 1） */
    slot?: number
    /** 轮询间隔毫秒（默认 1000） */
    pollInterval?: number
    /** 演示模式：true 使用内置模拟网关（不连真实设备），false 使用独立真实网关 */
    demo?: boolean
}

/**
 * 西门子 S7 数据服务（浏览器环境）
 *
 * S7（S7comm）为原生 TCP 协议，浏览器无法直接连接。
 * - Tauri 桌面运行时：由 useDataService 路由到 IpcGatewayService（Rust 原生网关，IPC），
 *   不会使用本类；
 * - 纯浏览器环境：仍可经外部 WebSocket 网关桥接（订阅协议：{ action, topic } 订阅/取消，
 *   网关回推 { topic, value, timestamp, quality }）。原内置演示网关与 Node 真实网关
 *   已随 Tauri 迁移移除，浏览器场景需自备兼容网关。
 *
 * 连接/重连/订阅逻辑统一由基类 GatewayService 实现。
 */
export class S7Service extends GatewayService {
    constructor(url: string, config: S7DeviceConfig = {}) {
        super(url, config, 'S7')
    }
}
