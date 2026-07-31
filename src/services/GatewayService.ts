import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * 工业协议网关数据服务基类（S7 / OPC UA / Modbus 共用）
 *
 * 这三种协议均为原生 TCP，浏览器无法直连，需经 WebSocket 网关桥接，
 * 且前后端订阅协议完全一致：
 * - 前端 → 网关：{ action:'configure', config } / { action:'subscribe', topic } / { action:'unsubscribe', topic }
 * - 网关 → 前端：{ type:'status', connected, message } 与 { topic, value, timestamp, quality }
 *
 * 三者实现 95% 相同，仅日志标签与设备配置结构不同，故抽取此基类去重。
 * 子类只需提供日志标签（tag）与设备配置类型，无需重复连接/重连/订阅逻辑。
 *
 * 连接建立后自动下发 configure（演示网关将忽略），再重订阅已登记的数据点。
 */
export class GatewayService implements IDataService {
    protected ws: WebSocket | null = null
    protected url: string
    protected config: Record<string, any>
    /** 日志标签（如 'S7' / 'OPC UA' / 'Modbus'） */
    protected tag: string
    protected callbacks: Map<string, DataCallback[]> = new Map()
    private reconnectTimer: number | null = null
    private reconnectDelay = 3000
    private isConnected_ = false

    constructor(url: string, config: Record<string, any> = {}, tag = 'Gateway') {
        this.url = url
        this.config = config
        this.tag = tag
        this.connect()
    }

    private connect() {
        try {
            this.ws = new WebSocket(this.url)
            this.ws.onopen = () => {
                console.log(`[${this.tag}] 已连接网关`)
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
                            console.log(`[${this.tag}] 设备已连接:`, data.message || '')
                        } else {
                            console.warn(`[${this.tag}] 设备未连接:`, data.message || '')
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
                    console.warn(`[${this.tag}] 解析数据失败:`, e)
                }
            }
            this.ws.onclose = () => {
                console.log(`[${this.tag}] 断开连接，尝试重连...`)
                this.isConnected_ = false
                this.scheduleReconnect()
            }
            this.ws.onerror = (error) => {
                console.error(`[${this.tag}] 错误:`, error)
                this.ws?.close()
            }
        } catch (e) {
            console.error(`[${this.tag}] 连接失败:`, e)
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
