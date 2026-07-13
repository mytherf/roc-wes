import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * WebSocket 数据服务
 * 支持多主题订阅，自动重连
 */
export class WebSocketService implements IDataService {
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
                console.log('[WebSocket] 已连接')
                this.isConnected_ = true
                // 重新订阅之前的所有主题
                for (const [topic] of this.callbacks) {
                    this.sendSubscribe(topic)
                }
            }
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    // 根据数据格式解析
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
                    console.warn('[WebSocket] 解析数据失败:', e)
                }
            }
            this.ws.onclose = () => {
                console.log('[WebSocket] 断开连接，尝试重连...')
                this.isConnected_ = false
                this.scheduleReconnect()
            }
            this.ws.onerror = (error) => {
                console.error('[WebSocket] 错误:', error)
                this.ws?.close()
            }
        } catch (e) {
            console.error('[WebSocket] 连接失败:', e)
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

    private sendSubscribe(topic: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'subscribe', topic }))
        }
    }

    private sendUnsubscribe(topic: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'unsubscribe', topic }))
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