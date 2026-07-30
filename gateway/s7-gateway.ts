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
 * 前后端 WebSocket 协议：
 * - 前端 → 网关：
 *   { action: 'configure', config: { host?, port?, rack?, slot?, pollInterval? } }
 *   { action: 'subscribe', topic: 'DB1,REAL0' }
 *   { action: 'unsubscribe', topic: 'DB1,REAL0' }
 * - 网关 → 前端：
 *   { type: 'status', connected: boolean, message?: string }
 *   { topic, value, timestamp, quality }
 *
 * pointId 约定：nodes7 地址字符串，如 DB1,REAL0 / DB1,INT4 / DB1,WORD6 / DB1,X0.0 / MB0 / MW0 / MR0。
 */
import { WebSocketServer, WebSocket } from 'ws'
import NodeS7 from 'nodes7'

const PORT = Number(process.env.GATEWAY_S7_PORT || 19101)
const PATH = '/s7'

interface DeviceConfig {
  host: string
  port: number
  rack: number
  slot: number
  pollInterval: number
}

/** 会话：一个 WebSocket 连接 + 一个 nodes7 连接 */
interface Session {
  ws: WebSocket
  conn: any
  config: DeviceConfig | null
  points: Set<string>
  added: Set<string>
  timer: ReturnType<typeof setInterval> | null
  connecting: boolean
  connected: boolean
  reading: boolean
}

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

/** 建立到设备的 S7 连接 */
function connectDevice(s: Session) {
  if (!s.config || s.connecting || s.connected) return
  s.connecting = true
  const conn = new NodeS7({ silent: true })
  s.conn = conn
  const params = {
    host: s.config.host,
    port: s.config.port,
    rack: s.config.rack,
    slot: s.config.slot,
    doNotOptimize: true, // 每个点独立读取，便于仿真按长度编码
  }
  conn.initiateConnection(params, (err: any) => {
    s.connecting = false
    if (err) {
      console.error(`[s7-gateway] 连接设备失败: ${err}`)
      send(s.ws, { type: 'status', connected: false, message: `连接失败: ${err}` })
      return
    }
    s.connected = true
    console.log(`[s7-gateway] 已连接设备 ${s.config!.host}:${s.config!.port} (rack=${s.config!.rack} slot=${s.config!.slot})`)
    send(s.ws, { type: 'status', connected: true, message: '设备已连接' })
    // 连接成功后补发已订阅但尚未添加的点
    for (const p of s.points) {
      if (!s.added.has(p)) {
        conn.addItems(p)
        s.added.add(p)
      }
    }
    ensurePolling(s)
  })
}

/** 启动周期轮询 */
function ensurePolling(s: Session) {
  if (s.timer || !s.config) return
  const interval = Math.max(200, s.config.pollInterval || 1000)
  s.timer = setInterval(() => {
    if (!s.connected || !s.conn || s.reading) return
    s.reading = true
    const t = Date.now()
    s.conn.readAllItems((bad: any, values: Record<string, any>) => {
      s.reading = false
      for (const pointId of s.points) {
        const v = values ? values[pointId] : undefined
        if (v === undefined) {
          send(s.ws, { topic: pointId, value: null, timestamp: t, quality: 'bad' })
        } else {
          send(s.ws, { topic: pointId, value: v, timestamp: t, quality: 'good' })
        }
      }
    })
  }, interval)
}

function stopPolling(s: Session) {
  if (s.timer) {
    clearInterval(s.timer)
    s.timer = null
  }
}

function closeDevice(s: Session) {
  stopPolling(s)
  if (s.conn) {
    try {
      s.conn.dropConnection()
    } catch {
      /* 忽略 */
    }
    s.conn = null
  }
  s.connected = false
  s.added.clear()
}

const wss = new WebSocketServer({ port: PORT, path: PATH })

wss.on('connection', (ws) => {
  const session: Session = {
    ws,
    conn: null,
    config: null,
    points: new Set(),
    added: new Set(),
    timer: null,
    connecting: false,
    connected: false,
    reading: false,
  }
  console.log('[s7-gateway] 前端已接入，等待 configure')

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
        port: Number(c.port) || 102,
        rack: Number(c.rack) || 0,
        slot: Number(c.slot) || 2,
        pollInterval: Number(c.pollInterval) || 1000,
      }
      console.log(`[s7-gateway] 收到设备配置: ${session.config.host}:${session.config.port} rack=${session.config.rack} slot=${session.config.slot}`)
      connectDevice(session)
    } else if (msg.action === 'subscribe' && msg.topic) {
      session.points.add(msg.topic)
      if (session.connected && session.conn && !session.added.has(msg.topic)) {
        session.conn.addItems(msg.topic)
        session.added.add(msg.topic)
      }
      ensurePolling(session)
    } else if (msg.action === 'unsubscribe' && msg.topic) {
      session.points.delete(msg.topic)
      if (session.connected && session.conn && session.added.has(msg.topic)) {
        session.conn.removeItems(msg.topic)
        session.added.delete(msg.topic)
      }
    }
  })

  ws.on('close', () => {
    console.log('[s7-gateway] 前端断开，关闭设备会话')
    closeDevice(session)
  })

  ws.on('error', (err) => {
    console.error('[s7-gateway] WebSocket 错误:', err.message)
  })
})

wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[s7-gateway] 端口 ${PORT} 已被占用，请更换 GATEWAY_S7_PORT`)
  } else {
    console.error('[s7-gateway] 服务错误:', err.message)
  }
})

console.log(`[s7-gateway] S7 网关已启动: ws://0.0.0.0:${PORT}${PATH}`)
console.log('[s7-gateway] 前端连接后发送 { action:"configure", config:{host,port,rack,slot,pollInterval} } 指定设备')
