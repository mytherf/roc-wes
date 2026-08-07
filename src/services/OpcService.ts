// ========== OPC UA 数据服务（浏览器环境）==========
// OPC UA 是工业自动化领域的统一数据交换标准（跨厂商互操作）。
// 其二进制协议（opc.tcp://）浏览器无法直接连接，通过 WebSocket 网关桥接；
// Tauri 桌面端改用 Rust 原生网关（见 IpcGatewayService）。

import { GatewayService } from './GatewayService'

/**
 * OPC UA 设备连接参数（由「数据源管理」界面配置，随数据源持久化）
 */
export interface OpcDeviceConfig {
    /** OPC UA 端点 URL（如 opc.tcp://127.0.0.1:4840），优先于 host/port */
    endpoint?: string
    /** 服务器主机地址（IP / 域名），未填 endpoint 时与 port 拼接 */
    host?: string
    /** OPC UA 端口（默认 4840） */
    port?: number
    /** 轮询间隔毫秒（默认 1000） */
    pollInterval?: number
    /** 演示模式：true 使用内置模拟网关（不连真实设备），false 使用独立真实网关 */
    demo?: boolean
}

/**
 * OPC UA 数据服务（浏览器环境）
 *
 * OPC UA（opc.tcp:// 二进制协议）浏览器无法直接连接。
 * - Tauri 桌面运行时：由 useDataService 路由到 IpcGatewayService（Rust 原生网关，IPC），
 *   不会使用本类；
 * - 纯浏览器环境：仍可经外部 WebSocket 网关桥接（订阅协议：{ action, topic } 订阅/取消，
 *   网关回推 { topic, value, timestamp, quality }）。原内置演示网关与 Node 真实网关
 *   已随 Tauri 迁移移除，浏览器场景需自备兼容网关。
 *
 * 连接/重连/订阅逻辑统一由基类 GatewayService 实现。
 */
export class OpcService extends GatewayService {
    constructor(url: string, config: OpcDeviceConfig = {}) {
        super(url, config, 'OPC UA')
    }
}
