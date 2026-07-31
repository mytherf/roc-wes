/**
 * 独立 Modbus 网关服务（WebSocket ↔ Modbus TCP）
 *
 * 浏览器无法直连 Modbus TCP（裸 TCP 协议），本服务作为桥接：
 *   浏览器(ModbusService) ──WebSocket──> 本网关 ──Modbus TCP──> 真实 PLC / 仿真从站
 *
 * 每个 WebSocket 连接对应一个设备会话：前端连上后发送 configure 指定设备参数
 * （host/port/unitId/pollInterval），网关据此建立到设备的 Modbus TCP 连接，
 * 并按订阅的数据点周期轮询、推送 { topic, value, timestamp, quality }。
 *
 * 启动：npm run gateway   （默认监听 ws://0.0.0.0:19100/modbus，可用环境变量 GATEWAY_PORT 覆盖）
 *
 * 通用 WebSocket 会话/轮询骨架由 gateway-shared.ts 的 startGateway 提供，
 * 本文件仅负责 Modbus 特定的配置解析与设备适配（modbus-adapter.ts）。
 *
 * pointId 约定：holding:N / input:N / coil:N / discrete:N（N 为 Modbus 地址）。
 */
import { startGateway } from './gateway-shared'
import { createModbusAdapter, type ModbusDeviceConfig } from './modbus-adapter'

const PORT = Number(process.env.GATEWAY_PORT || 19100)
const PATH = '/modbus'

startGateway<ModbusDeviceConfig>({
  port: PORT,
  path: PATH,
  tag: 'modbus-gateway',
  portEnvName: 'GATEWAY_PORT',
  parseConfig: (c: any) => ({
    host: c.host || '127.0.0.1',
    port: Number(c.port) || 502,
    unitId: Number(c.unitId) || 1,
    pollInterval: Number(c.pollInterval) || 1000,
  }),
  describeConfig: (cfg) => `${cfg.host}:${cfg.port} unitId=${cfg.unitId}`,
  createAdapter: createModbusAdapter,
})

console.log('[modbus-gateway] 前端连接后发送 { action:"configure", config:{host,port,unitId,pollInterval} } 指定设备')
