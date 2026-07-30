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
 * 前后端 WebSocket 协议：
 * - 前端 → 网关：
 *   { action: 'configure', config: { host, port, unitId, pollInterval } }
 *   { action: 'subscribe', topic: 'holding:100' }
 *   { action: 'unsubscribe', topic: 'holding:100' }
 * - 网关 → 前端：
 *   { type: 'status', connected: boolean, message?: string }
 *   { topic, value, timestamp, quality }
 *
 * pointId 约定：holding:N / input:N / coil:N / discrete:N（N 为 Modbus 地址）。
 */
import { WebSocketServer, WebSocket } from 'ws'
import ModbusSerial from 'modbus-serial'

const PORT = Number(process.env.GATEWAY_PORT || 19100)
const PATH = '/modbus'

interface DeviceConfig {
  host: string
  port: number
  unitId: number
  pollInterval: number
}

/** 会话：一个 WebSocket 连接 + 一个 Modbus 客户端 */
interface Session {
  ws: WebSocket
  client: any
  config: DeviceConfig | null
  points: Set<string>
  timer: ReturnType<typeof setInterval> | null
  connecting: boolean
  connected: boolean
}

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

/** 解析 pointId 并读取一次，返回数值 */
async function readPoint(client: any, pointId: string): Promise<number> {
  const [type, addrStr] = pointId.split(':')
  const addr = parseInt(addrStr, 10)
  if (Number.isNaN(addr)) throw new Error(`非法点地址: ${pointId}`)
  switch (type) {
    case 'holding': {
      const r = await client.readHoldingRegisters(addr, 1)
      return r.data[0]
    }
    case 'input': {
      const r = await client.readInputRegisters(addr, 1)
      return r.data[0]
    }
    case 'coil': {
      const r = await client.readCoils(addr, 1)
      return r.data[0] ? 1 : 0
    }
    case 'discrete': {
      const r = await client.readDiscreteInputs(addr, 1)
      return r.data[0] ? 1 : 0
    }
    default:
      throw new Error(`不支持的点类型: ${type}（支持 holding/input/coil/discrete）`)
  }
}

/** 建立到设备的 Modbus TCP 连接 */
async function connectDevice(s: Session) {
  if (!s.config || s.connecting || s.connected) return
  s.connecting = true
  try {
    const client = new ModbusSerial()
    client.setTimeout(3000)
    await client.connectTCP(s.config.host, { port: s.config.port })
    client.setID(s.config.unitId)
    s.client = client
    s.connected = true
    console.log(`[gateway] 已连接设备 ${s.config.host}:${s.config.port} (unitId=${s.config.unitId})`)
    send(s.ws, { type: 'status', connected: true, message: '设备已连接' })
  } catch (e: any) {
    console.error(`[gateway] 连接设备失败: ${e?.message || e}`)
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
    if (!s.connected || !s.client) return
    const t = Date.now()
    for (const pointId of s.points) {
      try {
        const value = await readPoint(s.client, pointId)
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
  if (s.client) {
    try {
      await s.client.close(() => {})
    } catch {
      /* 忽略关闭错误 */
    }
    s.client = null
  }
  s.connected = false
}

const wss = new WebSocketServer({ port: PORT, path: PATH })

wss.on('connection', (ws) => {
  const session: Session = {
    ws,
    client: null,
    config: null,
    points: new Set(),
    timer: null,
    connecting: false,
    connected: false,
  }
  console.log('[gateway] 前端已接入，等待 configure')

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
        host: c.host || '127.0.0.1',
        port: Number(c.port) || 502,
        unitId: Number(c.unitId) || 1,
        pollInterval: Number(c.pollInterval) || 1000,
      }
      console.log(`[gateway] 收到设备配置: ${session.config.host}:${session.config.port} unitId=${session.config.unitId}`)
      connectDevice(session).then(() => ensurePolling(session))
    } else if (msg.action === 'subscribe' && msg.topic) {
      session.points.add(msg.topic)
      ensurePolling(session)
    } else if (msg.action === 'unsubscribe' && msg.topic) {
      session.points.delete(msg.topic)
    }
  })

  ws.on('close', () => {
    console.log('[gateway] 前端断开，关闭设备会话')
    closeDevice(session)
  })

  ws.on('error', (err) => {
    console.error('[gateway] WebSocket 错误:', err.message)
  })
})

wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[gateway] 端口 ${PORT} 已被占用，请更换 GATEWAY_PORT`)
  } else {
    console.error('[gateway] 服务错误:', err.message)
  }
})

console.log(`[gateway] Modbus 网关已启动: ws://0.0.0.0:${PORT}${PATH}`)
console.log('[gateway] 前端连接后发送 { action:"configure", config:{host,port,unitId,pollInterval} } 指定设备')
