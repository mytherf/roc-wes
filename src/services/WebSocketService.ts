// ========== WebSocket 数据服务 ==========
// WebSocket 是“全双工长连接”：建立一次连接后，服务器可以随时主动推送数据，
// 延迟低、开销小，适合高频实时数据（如设备遥测）。
// 本服务特点：自动重连（断线后 3 秒自动重试）、多主题订阅。

import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * WebSocket 数据服务
 * 支持多主题订阅，自动重连
 */
export class WebSocketService implements IDataService {
    private ws: WebSocket | null = null // 当前连接实例
    private url: string // 服务器地址
    private callbacks: Map<string, DataCallback[]> = new Map() // 主题 → 回调列表
    private reconnectTimer: number | null = null // 重连定时器
    private reconnectDelay = 3000 // 重连间隔（毫秒）
    private isConnected_ = false // 连接状态（前缀 _ 避免与方法名冲突）

    constructor(url: string) {
        this.url = url
        this.connect() // 创建即尝试连接
    }

    // 建立 WebSocket 连接并绑定各类事件处理
    private connect() {
        try {
            this.ws = new WebSocket(this.url)
            // 连接成功：标记状态，并重新订阅之前所有主题（重连场景必需）
            this.ws.onopen = () => {
                console.log('[WebSocket] 已连接')
                this.isConnected_ = true
                // 重新订阅之前的所有主题
                for (const [topic] of this.callbacks) {
                    this.sendSubscribe(topic)
                }
            }
            // 收到服务器消息：解析 JSON 并分发给对应主题的回调
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    // 兼容多种消息格式：topic / id / pointId 都能当主题标识
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
            // 连接关闭：标记断开并安排自动重连
            this.ws.onclose = () => {
                console.log('[WebSocket] 断开连接，尝试重连...')
                this.isConnected_ = false
                this.scheduleReconnect()
            }
            // 出错：关闭连接（会触发 onclose → 重连）
            this.ws.onerror = (error) => {
                console.error('[WebSocket] 错误:', error)
                this.ws?.close()
            }
        } catch (e) {
            // 构造函数级别的失败（如非法 URL）
            console.error('[WebSocket] 连接失败:', e)
            this.scheduleReconnect()
        }
    }

    // 安排一次重连（保证同时只有一个重连定时器）
    private scheduleReconnect() {
        if (this.reconnectTimer) return // 已有定时器在排队，不再重复安排
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null
            this.connect() // 重新连接
        }, this.reconnectDelay)
    }

    // 向服务器发送订阅指令（仅在连接打开时有效）
    private sendSubscribe(topic: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'subscribe', topic }))
        }
    }

    // 向服务器发送退订指令
    private sendUnsubscribe(topic: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'unsubscribe', topic }))
        }
    }

    // 订阅：登记回调并通知服务器
    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)
        this.sendSubscribe(pointId)
    }

    // 退订：移除回调并通知服务器
    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        this.sendUnsubscribe(pointId)
    }

    isConnected(): boolean {
        return this.isConnected_
    }

    // 断开：取消重连计划、关闭连接、清空状态
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