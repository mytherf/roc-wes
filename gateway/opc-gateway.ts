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
 * 前后端 WebSocket 协议：
 * - 前端 → 网关：
 *   { action: 'configure', config: { endpoint?, host?, port?, pollInterval? } }
 *   { action: 'subscribe', topic: 'ns=2;s=Ramp' }
 *   { action: 'unsubscribe', topic: 'ns=2;s=Ramp' }
 * - 网关 → 前端：
 *   { type: 'status', connected: boolean, message?: string }
 *   { topic, value, timestamp, quality }
 *
 * pointId 约定：OPC UA NodeId 字符串，如 ns=2;s=Ramp 或 ns=2;i=1001。
 * 安全策略：None（本地仿真/内网；生产可按需扩展证书与签名）。
 */
import { WebSocketServer, WebSocket } from 'ws'
import { OPCUAClient, MessageSecurityMode, SecurityPolicy } from 'node-opcua'

const PORT = Number(process.env.GATEWAY_OPC_PORT || 19102)
const PATH = '/opc'

interface DeviceConfig {
  endpoint: string
  pollInterval: number
}

/** 会话：一个 WebSocket 连接 + 一个 OPC UA 客户端/会话 */
interface Session {
  ws: WebSocket
  client: any
  session: any
  config: DeviceConfig | null
  points: Set<string>
  timer: ReturnType<typeof setInterval> | null
  connecting: boolean
  connected: boolean
}

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

/** 由前端配置解析出 OPC UA 端点 URL */
function resolveEndpoint(c: any): string {
  if (c.endpoint && String(c.endpoint).trim()) return String(c.endpoint).trim()
  const host = c.host || '127.0.0.1'
  const port = Number(c.port) || 4840
  return `opc.tcp://${host}:${port}`
}

/** 读取一个节点的值 */
async function readPoint(session: any, pointId: string): Promise<any> {
  const dataValue = await session.readVariableValue(pointId)
  if (dataValue.statusCode && dataValue.statusCode.isNotGood && dataValue.statusCode.isNotGood()) {
    throw new Error(`节点状态异常: ${dataValue.statusCode.toString()}`)
  }
  return dataValue.value?.value
}

/** 建立到设备的 OPC UA 连接 */
async function connectDevice(s: Session) {
  if (!s.config || s.connecting || s.connected) return
  s.connecting = true
  try {
    const client = OPCUAClient.create({
      endpointMustExist: false,
      keepSessionAlive: true,
      securityMode: MessageSecurityMode.None,
      securityPolicy: SecurityPolicy.None,
      connectionStrategy: { initialDelay: 500, maxRetry: 1 },
    })
    await client.connect(s.config.endpoint)
    const session = await client.createSession()
    s.client = client
    s.session = session
    s.connected = true
    console.log(`[opc-gateway] 已连接设备 ${s.config.endpoint}`)
    send(s.ws, { type: 'status', connected: true, message: '设备已连接' })
  } catch (e: any) {
    console.error(`[opc-gateway] 连接设备失败: ${e?.message || e}`)
    send(s.ws, { type: 'status', connected: false, message: `连接失败: ${e?.message || e}` })
  } finally {
    s.connecting = false
  }
}

/** 启动周期轮询 */
function ensurePolling(s: Session) {
  if (s.timer || !s.config) return
  const interval = Math.max(200, s.config.pollInterval || 1000)
  s.timer = setInterval(async () => {
    if (!s.connected || !s.session) return
    const t = Date.now()
    for (const pointId of s.points) {
      try {
        const value = await readPoint(s.session, pointId)
        send(s.ws, { topic: pointId, value, timestamp: t, quality: 'good' })
      } catch (e: any) {
        send(s.ws, { topic: pointId, value: null, timestamp: t, quality: 'bad', error: e?.message })
      }
    }
  }, interval)
}

function stopPolling(s: Session) {
  if (s.timer) {
    clearInterval(s.timer)
    s.timer = null
  }
}

async function closeDevice(s: Session) {
  stopPolling(s)
  try {
    if (s.session) await s.session.close()
  } catch {
    /* 忽略 */
  }
  try {
    if (s.client) await s.client.disconnect()
  } catch {
    /* 忽略 */
  }
  s.session = null
  s.client = null
  s.connected = false
}

const wss = new WebSocketServer({ port: PORT, path: PATH })

wss.on('connection', (ws) => {
  const session: Session = {
    ws,
    client: null,
    session: null,
    config: null,
    points: new Set(),
    timer: null,
    connecting: false,
    connected: false,
  }
  console.log('[opc-gateway] 前端已接入，等待 configure')

  ws.on('message', (raw) => {
    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.action === 'configure') {
      const c = msg.config || {}
      session.config = {
        endpoint: resolveEndpoint(c),
        pollInterval: Number(c.pollInterval) || 1000,
      }
      console.log(`[opc-gateway] 收到设备配置: ${session.config.endpoint}`)
      connectDevice(session).then(() => ensurePolling(session))
    } else if (msg.action === 'subscribe' && msg.topic) {
      session.points.add(msg.topic)
      ensurePolling(session)
    } else if (msg.action === 'unsubscribe' && msg.topic) {
      session.points.delete(msg.topic)
    }
  })

  ws.on('close', () => {
    console.log('[opc-gateway] 前端断开，关闭设备会话')
    closeDevice(session)
  })

  ws.on('error', (err) => {
    console.error('[opc-gateway] WebSocket 错误:', err.message)
  })
})

wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[opc-gateway] 端口 ${PORT} 已被占用，请更换 GATEWAY_OPC_PORT`)
  } else {
    console.error('[opc-gateway] 服务错误:', err.message)
  }
})

console.log(`[opc-gateway] OPC UA 网关已启动: ws://0.0.0.0:${PORT}${PATH}`)
console.log('[opc-gateway] 前端连接后发送 { action:"configure", config:{endpoint|host|port,pollInterval} } 指定设备')
