import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * 西门子 S7 数据服务
 *
 * S7（S7comm）为原生 TCP 协议，浏览器无法直接连接，
 * 因此通过 WebSocket 网关桥接（内置 mock 见 mock/server.ts 的 startS7Server）。
 * 订阅协议与 WebSocket 服务一致：发送 { action, topic } 订阅/取消数据点，
 * 网关周期性回推 { topic, value, timestamp, quality }。
 *
 * 生产环境可将网关替换为真实的 S7-WebSocket 网关（如 snap7 + ws 桥接），
 * 前端代码无需改动。
 */
export class S7Service implements IDataService {
    private ws: WebSocket | null = null
    private url: string
    private callbacks: Map<string, DataCallback[]> = new Map()
    private reconnectTimer: number | null = null
    private reconnectDelay = 3000
    private isConnected_ = false

    constructor(url: string) {
        this.url = url
        this.connect()
    }

    private connect() {
        try {
            this.ws = new WebSocket(this.url)
            this.ws.onopen = () => {
                console.log('[S7] 已连接 PLC 网关')
                this.isConnected_ = true
                // 重新订阅之前的所有数据点
                for (const [pointId] of this.callbacks) {
                    this.sendSubscribe(pointId)
                }
            }
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
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
                    console.warn('[S7] 解析数据失败:', e)
                }
            }
            this.ws.onclose = () => {
                console.log('[S7] 断开连接，尝试重连...')
                this.isConnected_ = false
                this.scheduleReconnect()
            }
            this.ws.onerror = (error) => {
                console.error('[S7] 错误:', error)
                this.ws?.close()
            }
        } catch (e) {
            console.error('[S7] 连接失败:', e)
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
