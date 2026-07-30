import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * Modbus 设备连接参数（由「数据源管理」界面配置，随数据源持久化）
 */
export interface ModbusDeviceConfig {
    /** 设备主机地址（IP / 域名） */
    host?: string
    /** Modbus TCP 端口（默认 502） */
    port?: number
    /** 从站地址（默认 1） */
    unitId?: number
    /** 轮询间隔毫秒（默认 1000） */
    pollInterval?: number
    /** 演示模式：true 使用内置模拟网关（不连真实设备），false 使用独立真实网关 */
    demo?: boolean
}

/**
 * Modbus 数据服务
 *
 * Modbus（Modbus TCP）为原生 TCP 协议，浏览器无法直接连接，需经 WebSocket 网关桥接。
 * 支持两种网关（订阅协议一致：{ action, topic } 订阅/取消，网关回推 { topic, value, timestamp, quality }）：
 * - 内置演示网关（mock/server.ts startModbusServer，ws://localhost:8086/modbus）：生成模拟数据，忽略设备配置；
 * - 独立真实网关（gateway/modbus-gateway.ts，ws://localhost:8100/modbus）：连接后需发送
 *   { action:'configure', config } 指定设备参数，网关据此通过 modbus-serial 连接真实 PLC / 仿真从站。
 *
 * 连接建立后本服务会自动发送 configure（演示网关将忽略），再重订阅数据点。
 */
export class ModbusService implements IDataService {
    private ws: WebSocket | null = null
    private url: string
    private config: ModbusDeviceConfig
    private callbacks: Map<string, DataCallback[]> = new Map()
    private reconnectTimer: number | null = null
    private reconnectDelay = 3000
    private isConnected_ = false

    constructor(url: string, config: ModbusDeviceConfig = {}) {
        this.url = url
        this.config = config
        this.connect()
    }

    private connect() {
        try {
            this.ws = new WebSocket(this.url)
            this.ws.onopen = () => {
                console.log('[Modbus] 已连接网关')
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
                            console.log('[Modbus] 设备已连接:', data.message || '')
                        } else {
                            console.warn('[Modbus] 设备未连接:', data.message || '')
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
                    console.warn('[Modbus] 解析数据失败:', e)
                }
            }
            this.ws.onclose = () => {
                console.log('[Modbus] 断开连接，尝试重连...')
                this.isConnected_ = false
                this.scheduleReconnect()
            }
            this.ws.onerror = (error) => {
                console.error('[Modbus] 错误:', error)
                this.ws?.close()
            }
        } catch (e) {
            console.error('[Modbus] 连接失败:', e)
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
