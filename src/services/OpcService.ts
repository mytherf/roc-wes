import type { IDataService, DataPoint, DataCallback } from './DataService'

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
 * OPC UA 数据服务
 *
 * OPC UA（opc.tcp:// 二进制协议）浏览器无法直接连接，需经 WebSocket 网关桥接。
 * 支持两种网关（订阅协议一致：{ action, topic } 订阅/取消，网关回推 { topic, value, timestamp, quality }）：
 * - 内置演示网关（mock/server.ts startOpcServer，ws://localhost:8085/opc）：生成模拟数据，忽略设备配置；
 * - 独立真实网关（gateway/opc-gateway.ts，ws://localhost:19102/opc）：连接后需发送
 *   { action:'configure', config } 指定设备参数，网关据此通过 node-opcua 连接真实服务器 / 仿真服务端。
 *
 * 连接建立后本服务会自动发送 configure（演示网关将忽略），再重订阅数据点。
 */
export class OpcService implements IDataService {
    private ws: WebSocket | null = null
    private url: string
    private config: OpcDeviceConfig
    private callbacks: Map<string, DataCallback[]> = new Map()
    private reconnectTimer: number | null = null
    private reconnectDelay = 3000
    private isConnected_ = false

    constructor(url: string, config: OpcDeviceConfig = {}) {
        this.url = url
        this.config = config
        this.connect()
    }

    private connect() {
        try {
            this.ws = new WebSocket(this.url)
            this.ws.onopen = () => {
                console.log('[OPC UA] 已连接网关')
                this.isConnected_ = true
                // 先下发设备配置（真实网关据此连接设备；演示网关忽略此消息）
                this.sendConfigure()
                // 重新订阅之前的所有数据点
                for (const [pointId] of this.callbacks) {
                    this.sendSubscribe(pointId)
                }
            }
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    // 网关状态消息（设备连接结果等）
                    if (data.type === 'status') {
                        if (data.connected) {
                            console.log('[OPC UA] 设备已连接:', data.message || '')
                        } else {
                            console.warn('[OPC UA] 设备未连接:', data.message || '')
                        }
                        return
                    }
                    const pointId = data.topic || data.id || data.pointId
                    if (pointId && this.callbacks.has(pointId)) {
                        const point: DataPoint = {
                            id: pointId,
                            value: data.value ?? data.data,
                            timestamp: data.timestamp || Date.now(),
                            quality: data.quality || 'good',
                        }
                        for (const cb of this.callbacks.get(pointId) || []) {
                            cb(point)
                        }
                    }
                } catch (e) {
                    console.warn('[OPC UA] 解析数据失败:', e)
                }
            }
            this.ws.onclose = () => {
                console.log('[OPC UA] 断开连接，尝试重连...')
                this.isConnected_ = false
                this.scheduleReconnect()
            }
            this.ws.onerror = (error) => {
                console.error('[OPC UA] 错误:', error)
                this.ws?.close()
            }
        } catch (e) {
            console.error('[OPC UA] 连接失败:', e)
            this.scheduleReconnect()
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null
            this.connect()
        }, this.reconnectDelay)
    }

    private sendConfigure() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'configure', config: this.config }))
        }
    }

    private sendSubscribe(pointId: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'subscribe', topic: pointId }))
        }
    }

    private sendUnsubscribe(pointId: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'unsubscribe', topic: pointId }))
        }
    }

    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)
        this.sendSubscribe(pointId)
    }

    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        this.sendUnsubscribe(pointId)
    }

    isConnected(): boolean {
        return this.isConnected_
    }

    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        this.ws?.close()
        this.ws = null
        this.isConnected_ = false
        this.callbacks.clear()
    }
}
