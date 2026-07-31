/**
 * 工业协议网关共享框架（Modbus / S7 / OPC UA 共用）
 *
 * 三个网关的 WebSocket 服务骨架完全一致（连接会话管理、configure/subscribe/unsubscribe
 * 消息协议、周期轮询推送、错误与端口占用处理），仅「设备适配层」不同。
 * 本模块抽取公共骨架为 startGateway 工厂，各协议只需实现 DeviceAdapter 适配器，
 * 消除三处约 150 行的重复脚手架。
 *
 * 前后端 WebSocket 协议（保持不变）：
 * - 前端 → 网关：{ action:'configure', config } / { action:'subscribe', topic } / { action:'unsubscribe', topic }
 * - 网关 → 前端：{ type:'status', connected, message } 与 { topic, value, timestamp, quality, error? }
 */
import { WebSocketServer, WebSocket } from 'ws'

/** 单个数据点的一次读取结果 */
export interface PointResult {
  value: any
  quality: 'good' | 'bad'
  /** quality 为 bad 时的错误描述（统一补全，便于前端诊断） */
  error?: string
}

/**
 * 设备适配器：封装具体协议的连接、读取与断开。
 * 由 startGateway 在收到 configure 时创建，每个 WebSocket 会话独立一个实例。
 */
export interface DeviceAdapter {
  /** 设备是否已就绪（未就绪时轮询跳过，避免推送无意义的 bad 帧） */
  isReady(): boolean
  /** 订阅一个数据点（部分协议需向设备登记，如 S7 的 addItems） */
  addPoint?(pointId: string): void
  /** 取消订阅一个数据点 */
  removePoint?(pointId: string): void
  /** 读取本轮所有数据点，返回 pointId → 结果 的映射 */
  readAll(points: string[]): Promise<Record<string, PointResult>>
  /** 断开设备连接、释放资源 */
  disconnect(): void
}

/** startGateway 配置项（C 为协议特定的设备配置类型，须含 pollInterval） */
export interface GatewayOptions<C extends { pollInterval: number }> {
  /** 监听端口 */
  port: number
  /** WebSocket 路径（如 /modbus） */
  path: string
  /** 日志标签 */
  tag: string
  /** 端口被占用时提示用户可覆盖的环境变量名 */
  portEnvName: string
  /** 将前端原始 config 归一化为协议配置 */
  parseConfig: (raw: any) => C
  /** 生成配置的可读描述（用于日志） */
  describeConfig: (config: C) => string
  /** 创建设备适配器；onStatus 用于回推设备连接结果 */
  createAdapter: (config: C, onStatus: (connected: boolean, message?: string) => void) => DeviceAdapter
}

/** 向 WebSocket 发送 JSON 消息（仅在 OPEN 状态） */
export function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

/** 单个 WebSocket 连接对应的会话 */
interface Session<C> {
  ws: WebSocket
  config: C | null
  adapter: DeviceAdapter | null
  points: Set<string>
  timer: ReturnType<typeof setInterval> | null
}

/**
 * 启动一个工业协议网关服务。
 */
export function startGateway<C extends { pollInterval: number }>(opts: GatewayOptions<C>) {
  const { port, path, tag, portEnvName, parseConfig, describeConfig, createAdapter } = opts

  const wss = new WebSocketServer({ port, path })

  wss.on('connection', (ws) => {
    const session: Session<C> = {
      ws,
      config: null,
      adapter: null,
      points: new Set(),
      timer: null,
    }
    console.log(`[${tag}] 前端已接入，等待 configure`)

    /** 设备连接状态回推 */
    const onStatus = (connected: boolean, message?: string) =>
      send(ws, { type: 'status', connected, message })

    /** 启动周期轮询（幂等；设备未就绪时本轮跳过） */
    function ensurePolling() {
      if (session.timer || !session.config || !session.adapter) return
      const interval = Math.max(200, session.config.pollInterval || 1000)
      session.timer = setInterval(async () => {
        const adapter = session.adapter
        if (!adapter || !adapter.isReady()) return
        const t = Date.now()
        let results: Record<string, PointResult> = {}
        try {
          results = await adapter.readAll([...session.points])
        } catch (e: any) {
          // 整体读取异常：下方按点回退为 bad
          console.error(`[${tag}] 读取异常:`, e?.message || e)
        }
        for (const pointId of session.points) {
          const r = results[pointId]
          if (r && r.quality === 'good') {
            send(ws, { topic: pointId, value: r.value, timestamp: t, quality: 'good' })
          } else {
            send(ws, { topic: pointId, value: null, timestamp: t, quality: 'bad', error: r?.error })
          }
        }
      }, interval)
    }

    function stopPolling() {
      if (session.timer) {
        clearInterval(session.timer)
        session.timer = null
      }
    }

    ws.on('message', (raw) => {
      let msg: any
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.action === 'configure') {
        // 重新 configure：先关闭旧适配器
        stopPolling()
        session.adapter?.disconnect()
        session.config = parseConfig(msg.config || {})
        console.log(`[${tag}] 收到设备配置: ${describeConfig(session.config)}`)
        session.adapter = createAdapter(session.config, onStatus)
        // 将已订阅的点登记到新适配器
        for (const p of session.points) session.adapter.addPoint?.(p)
        ensurePolling()
      } else if (msg.action === 'subscribe' && msg.topic) {
        session.points.add(msg.topic)
        session.adapter?.addPoint?.(msg.topic)
        ensurePolling()
      } else if (msg.action === 'unsubscribe' && msg.topic) {
        session.points.delete(msg.topic)
        session.adapter?.removePoint?.(msg.topic)
      }
    })

    ws.on('close', () => {
      console.log(`[${tag}] 前端断开，关闭设备会话`)
      stopPolling()
      session.adapter?.disconnect()
      session.adapter = null
    })

    ws.on('error', (err) => {
      console.error(`[${tag}] WebSocket 错误:`, err.message)
    })
  })

  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[${tag}] 端口 ${port} 已被占用，请更换 ${portEnvName}`)
    } else {
      console.error(`[${tag}] 服务错误:`, err.message)
    }
  })

  console.log(`[${tag}] 网关已启动: ws://0.0.0.0:${port}${path}`)
}
