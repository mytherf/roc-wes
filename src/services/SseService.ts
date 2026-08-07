// ========== SSE 数据服务 ==========
// SSE（Server-Sent Events，服务器推送事件）是一种“单向推送”技术：
// 客户端用 EventSource 发起连接后，服务器可持续推送数据（只能服务器→客户端）。
// 与 WebSocket 相比更轻量，且浏览器在断线时会自动重连，无需自己处理。

import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * SSE（Server-Sent Events）数据服务
 * 通过 EventSource 连接 `${url}?pointId=xxx`，接收服务端推送的数据流。
 * 浏览器在连接断开时会自动重连。
 */
export class SseService implements IDataService {
    private url: string // 服务地址
    private callbacks: Map<string, DataCallback[]> = new Map() // 点 ID → 回调列表
    private sources: Map<string, EventSource> = new Map() // 点 ID → 连接实例
    private connected = true

    constructor(url: string) {
        this.url = url
    }

    // 订阅：注册回调 + 为该点建立 EventSource 连接
    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)

        // 每个点只建一条连接
        if (!this.sources.has(pointId)) {
            // 拼接查询参数（处理 URL 里已有 ? 的情况）
            const sep = this.url.includes('?') ? '&' : '?'
            const es = new EventSource(`${this.url}${sep}pointId=${encodeURIComponent(pointId)}`)
            // 收到消息：解析并通知所有订阅者
            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    const point: DataPoint = {
                        id: data.id || pointId,
                        value: data.value ?? data.data,
                        timestamp: data.timestamp || Date.now(),
                        quality: data.quality || 'good',
                    }
                    for (const cb of this.callbacks.get(pointId) || []) {
                        cb(point)
                    }
                } catch (e) {
                    console.warn('[SSE] 解析数据失败:', e)
                }
            }
            // 连接异常：EventSource 自动重连，这里仅记录日志
            es.onerror = () => {
                // EventSource 会自动重连，这里仅记录
                console.warn('[SSE] 连接异常，浏览器将自动重连')
            }
            this.sources.set(pointId, es)
        }
    }

    // 退订：移除回调并关闭该点的连接
    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        const es = this.sources.get(pointId)
        if (es) {
            es.close() // 关闭 EventSource 连接
            this.sources.delete(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    // 断开：关闭所有连接、清空状态
    disconnect(): void {
        for (const [, es] of this.sources) {
            es.close()
        }
        this.sources.clear()
        this.callbacks.clear()
        this.connected = false
    }
}
