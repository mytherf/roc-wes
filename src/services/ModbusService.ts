import { GatewayService } from './GatewayService'

/**
 * Modbus 设备连接参数（由「数据源管理」界面配置，随数据源持久化）
 */
export interface ModbusDeviceConfig {
    /** 设备主机地址（IP / 域名） */
    host?: string
    /** Modbus TCP 端口（默认 502） */
    port?: number
    /** 从站地址（默认 1） */
    unitId?: number
    /** 轮询间隔毫秒（默认 1000） */
    pollInterval?: number
    /** 演示模式：true 使用内置模拟网关（不连真实设备），false 使用独立真实网关 */
    demo?: boolean
}

/**
 * Modbus 数据服务
 *
 * Modbus（Modbus TCP）为原生 TCP 协议，浏览器无法直接连接，需经 WebSocket 网关桥接。
 * 支持两种网关（订阅协议一致：{ action, topic } 订阅/取消，网关回推 { topic, value, timestamp, quality }）：
 * - 内置演示网关（mock/server.ts startModbusServer，ws://localhost:8086/modbus）：生成模拟数据，忽略设备配置；
 * - 独立真实网关（gateway/modbus-gateway.ts，ws://localhost:19100/modbus）：连接后需发送
 *   { action:'configure', config } 指定设备参数，网关据此通过 modbus-serial 连接真实 PLC / 仿真从站。
 *
 * 连接/重连/订阅逻辑统一由基类 GatewayService 实现。
 */
export class ModbusService extends GatewayService {
    constructor(url: string, config: ModbusDeviceConfig = {}) {
        super(url, config, 'Modbus')
    }
}
