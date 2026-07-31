/**
 * 独立西门子 S7 网关服务（WebSocket ↔ S7comm）
 *
 * 浏览器无法直连西门子 PLC（S7comm 为裸 TCP 协议），本服务作为桥接：
 *   浏览器(S7Service) ──WebSocket──> 本网关 ──S7comm(nodes7)──> 真实 PLC / 仿真服务端
 *
 * 每个 WebSocket 连接对应一个设备会话：前端连上后发送 configure 指定设备参数
 * （host/port/rack/slot/pollInterval），网关据此用 nodes7 建立连接，
 * 并按订阅的数据点（pointId = nodes7 地址）周期读取、推送 { topic, value, timestamp, quality }。
 *
 * 启动：npm run s7-gateway   （默认监听 ws://0.0.0.0:19101/s7，可用环境变量 GATEWAY_S7_PORT 覆盖）
 *
 * 通用 WebSocket 会话/轮询骨架由 gateway-shared.ts 的 startGateway 提供，
 * 本文件仅负责 S7 特定的配置解析与设备适配（s7-adapter.ts）。
 *
 * pointId 约定：nodes7 地址字符串，如 DB1,REAL0 / DB1,INT4 / DB1,WORD6 / DB1,X0.0 / MB0 / MW0 / MR0。
 */
import { startGateway } from './gateway-shared'
import { createS7Adapter, type S7DeviceConfig } from './s7-adapter'

const PORT = Number(process.env.GATEWAY_S7_PORT || 19101)
const PATH = '/s7'

startGateway<S7DeviceConfig>({
  port: PORT,
  path: PATH,
  tag: 's7-gateway',
  portEnvName: 'GATEWAY_S7_PORT',
  parseConfig: (c: any) => ({
    host: c.host || '127.0.0.1',
    port: Number(c.port) || 102,
    rack: Number(c.rack) || 0,
    slot: Number(c.slot) || 2,
    pollInterval: Number(c.pollInterval) || 1000,
  }),
  describeConfig: (cfg) => `${cfg.host}:${cfg.port} rack=${cfg.rack} slot=${cfg.slot}`,
  createAdapter: createS7Adapter,
})

console.log('[s7-gateway] 前端连接后发送 { action:"configure", config:{host,port,rack,slot,pollInterval} } 指定设备')
