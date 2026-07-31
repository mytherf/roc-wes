/**
 * 独立 OPC UA 网关服务（WebSocket ↔ OPC UA）
 *
 * 浏览器无法直连 OPC UA（opc.tcp:// 二进制协议），本服务作为桥接：
 *   浏览器(OpcService) ──WebSocket──> 本网关 ──OPC UA──> 真实 OPC UA 服务器 / 仿真服务端
 *
 * 每个 WebSocket 连接对应一个设备会话：前端连上后发送 configure 指定设备参数
 * （endpoint 或 host/port、pollInterval），网关据此用 node-opcua Client 建立会话，
 * 并按订阅的节点（pointId = NodeId 字符串）周期读取、推送 { topic, value, timestamp, quality }。
 *
 * 启动：npm run opc-gateway   （默认监听 ws://0.0.0.0:19102/opc，可用环境变量 GATEWAY_OPC_PORT 覆盖）
 *
 * 通用 WebSocket 会话/轮询骨架由 gateway-shared.ts 的 startGateway 提供，
 * 本文件仅负责 OPC UA 特定的配置解析与设备适配（opc-adapter.ts）。
 *
 * pointId 约定：OPC UA NodeId 字符串，如 ns=2;s=Ramp 或 ns=2;i=1001。
 */
import { startGateway } from './gateway-shared'
import { createOpcAdapter, type OpcDeviceConfig } from './opc-adapter'

const PORT = Number(process.env.GATEWAY_OPC_PORT || 19102)
const PATH = '/opc'

/** 由前端配置解析出 OPC UA 端点 URL（endpoint 优先，否则由 host/port 拼接） */
function resolveEndpoint(c: any): string {
  if (c.endpoint && String(c.endpoint).trim()) return String(c.endpoint).trim()
  const host = c.host || '127.0.0.1'
  const port = Number(c.port) || 4840
  return `opc.tcp://${host}:${port}`
}

startGateway<OpcDeviceConfig>({
  port: PORT,
  path: PATH,
  tag: 'opc-gateway',
  portEnvName: 'GATEWAY_OPC_PORT',
  parseConfig: (c: any) => ({
    endpoint: resolveEndpoint(c),
    pollInterval: Number(c.pollInterval) || 1000,
  }),
  describeConfig: (cfg) => cfg.endpoint,
  createAdapter: createOpcAdapter,
})

console.log('[opc-gateway] 前端连接后发送 { action:"configure", config:{endpoint|host|port,pollInterval} } 指定设备')
