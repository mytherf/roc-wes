/**
 * 内置模拟数据服务器
 *
 * 随开发系统（vite dev）自动启动，为四种数据源类型各提供一个可直接连接的模拟服务：
 * - WebSocket ：ws://localhost:8080/ws        （订阅制实时推送，1s/次）
 * - HTTP 轮询 ：http://localhost:8081/api/data?pointId=xxx （请求/响应）
 * - SSE       ：http://localhost:8082/sse?pointId=xxx      （服务端推送流，1s/次）
 * - MQTT      ：ws://localhost:8083（浏览器经 WebSocket 连接 MQTT broker，TCP 1883）
 *
 * 这些服务仅在开发环境由 vite.config.ts 的 mock-servers 插件拉起，不参与生产构建。
 */
import http from 'http'
import net from 'net'
import { WebSocketServer, createWebSocketStream } from 'ws'
import { Aedes } from 'aedes'
import { wsValue, httpValue, sseValue, mqttValue } from './generators.ts'

/** 内置模拟服务端口（避免与 Vite 5173 冲突） */
export const MOCK_PORTS = {
  ws: 8080,
  http: 8081,
  sse: 8082,
  mqttTcp: 1883,
  mqttWs: 8083,
}

/** 内置模拟服务连接地址（供前端数据源管理预置） */
export const BUILTIN_MOCK_URLS = {
  websocket: `ws://localhost:${MOCK_PORTS.ws}/ws`,
  http: `http://localhost:${MOCK_PORTS.http}/api/data`,
  sse: `http://localhost:${MOCK_PORTS.sse}/sse`,
  mqtt: `ws://localhost:${MOCK_PORTS.mqttWs}`,
}

/** 安全监听：端口被占用时仅告警，不中断 dev server */
function safeListen(server: http.Server | net.Server, port: number, label: string) {
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[mock] ${label} 端口 ${port} 已被占用，跳过（可能已有实例在运行）`)
    } else {
      console.error(`[mock] ${label} 启动失败:`, err.message)
    }
  })
  server.listen(port)
}

// ===================== WebSocket 服务 =====================
function startWsServer() {
  const wss = new WebSocketServer({ port: MOCK_PORTS.ws, path: '/ws' })
  // 每个连接订阅的主题集合
  const clientTopics = new Map<any, Set<string>>()

  wss.on('connection', (ws) => {
    clientTopics.set(ws, new Set())
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        const topics = clientTopics.get(ws)
        if (!topics) return
        if (msg.action === 'subscribe' && msg.topic) topics.add(msg.topic)
        else if (msg.action === 'unsubscribe' && msg.topic) topics.delete(msg.topic)
      } catch {
        /* 忽略非 JSON 消息 */
      }
    })
    ws.on('close', () => clientTopics.delete(ws))
  })

  // 每秒向已订阅主题推送正弦波数据
  setInterval(() => {
    const t = Date.now()
    for (const [ws, topics] of clientTopics) {
      if (ws.readyState !== ws.OPEN) continue
      for (const topic of topics) {
        ws.send(
          JSON.stringify({ topic, value: wsValue(topic, t), timestamp: t, quality: 'good' })
        )
      }
    }
  }, 1000)

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[mock] WebSocket 端口 ${MOCK_PORTS.ws} 已被占用，跳过`)
    }
  })
  console.log(`[mock] WebSocket 服务已启动: ${BUILTIN_MOCK_URLS.websocket}`)
}

// ===================== HTTP 轮询服务 =====================
function startHttpServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${MOCK_PORTS.http}`)
    // CORS（前端运行在 5173）
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (url.pathname === '/api/data') {
      const pointId = url.searchParams.get('pointId') || 'default'
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: pointId,
          value: httpValue(pointId),
          timestamp: Date.now(),
          quality: 'good',
        })
      )
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })
  safeListen(server, MOCK_PORTS.http, 'HTTP')
  console.log(`[mock] HTTP 轮询服务已启动: ${BUILTIN_MOCK_URLS.http}?pointId=xxx`)
}

// ===================== SSE 服务 =====================
function startSseServer() {
  // pointId → 该点上所有保持连接的响应流
  const clients = new Map<string, Set<http.ServerResponse>>()

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${MOCK_PORTS.sse}`)
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (url.pathname === '/sse') {
      const pointId = url.searchParams.get('pointId') || 'default'
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write('retry: 3000\n\n')
      if (!clients.has(pointId)) clients.set(pointId, new Set())
      clients.get(pointId)!.add(res)
      req.on('close', () => clients.get(pointId)?.delete(res))
      return
    }
    res.writeHead(404)
    res.end()
  })

  // 每秒向所有连接推送锯齿斜升数据
  setInterval(() => {
    const t = Date.now()
    for (const [pointId, resps] of clients) {
      const data = JSON.stringify({
        id: pointId,
        value: sseValue(pointId, t),
        timestamp: t,
        quality: 'good',
      })
      for (const res of resps) res.write(`data: ${data}\n\n`)
    }
  }, 1000)

  safeListen(server, MOCK_PORTS.sse, 'SSE')
  console.log(`[mock] SSE 服务已启动: ${BUILTIN_MOCK_URLS.sse}?pointId=xxx`)
}

// ===================== MQTT 服务（aedes broker） =====================
async function startMqttServer() {
  // 必须用 createBroker()：它会 await listen() 初始化 persistence 并置 closed=false。
  // 直接 new Aedes() 时 broker 处于 closed 且无 persistence，CONNECT 会被静默丢弃（connack timeout）。
  const broker = await Aedes.createBroker()

  // TCP 服务（原生 MQTT 客户端，1883）
  const tcpServer = net.createServer(broker.handle)
  safeListen(tcpServer, MOCK_PORTS.mqttTcp, 'MQTT-TCP')

  // WebSocket 桥接（浏览器 mqtt.js，8083）
  const httpServer = http.createServer()
  const wss = new WebSocketServer({ server: httpServer })
  wss.on('connection', (conn, req) => {
    const stream = createWebSocketStream(conn)
    broker.handle(stream, req)
  })
  // 防止端口占用等错误以未处理 'error' 事件形式击穿整个 dev server
  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[mock] MQTT-WS 端口 ${MOCK_PORTS.mqttWs} 已被占用，跳过`)
    } else {
      console.error('[mock] MQTT-WS 错误:', err.message)
    }
  })
  safeListen(httpServer, MOCK_PORTS.mqttWs, 'MQTT-WS')

  // 记录客户端订阅的主题，周期性发布离散档位数据
  const topics = new Set<string>()
  broker.on('subscribe', (subscriptions) => {
    for (const s of subscriptions) {
      // 通配符主题不主动发布（演示场景使用具体主题）
      if (!s.topic.includes('#') && !s.topic.includes('+')) topics.add(s.topic)
    }
  })
  setInterval(() => {
    const t = Date.now()
    for (const topic of topics) {
      const payload = JSON.stringify({
        value: mqttValue(topic, t),
        timestamp: t,
        quality: 'good',
      })
      broker.publish(
        { topic, payload, qos: 0, retain: false, cmd: 'publish', dup: false },
        () => {}
      )
    }
  }, 1500)

  console.log(`[mock] MQTT broker 已启动: tcp://localhost:${MOCK_PORTS.mqttTcp}, ${BUILTIN_MOCK_URLS.mqtt}`)
}

// ===================== 统一启动入口（幂等） =====================
let started = false

/**
 * 启动全部内置模拟服务。
 * 幂等：vite dev server 重启时不会重复启动。
 */
export async function startMockServers() {
  if (started) return
  started = true
  try {
    startWsServer()
    startHttpServer()
    startSseServer()
    await startMqttServer()
    console.log('[mock] 全部内置模拟数据服务已启动')
  } catch (e) {
    console.error('[mock] 启动内置模拟服务失败:', e)
  }
}
