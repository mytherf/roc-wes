import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * SSE（Server-Sent Events）数据服务
 * 通过 EventSource 连接 `${url}?pointId=xxx`，接收服务端推送的数据流。
 * 浏览器在连接断开时会自动重连。
 */
export class SseService implements IDataService {
    private url: string
    private callbacks: Map<string, DataCallback[]> = new Map()
    private sources: Map<string, EventSource> = new Map()
    private connected = true

    constructor(url: string) {
        this.url = url
    }

    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)

        if (!this.sources.has(pointId)) {
            const sep = this.url.includes('?') ? '&' : '?'
            const es = new EventSource(`${this.url}${sep}pointId=${encodeURIComponent(pointId)}`)
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
            es.onerror = () => {
                // EventSource 会自动重连，这里仅记录
                console.warn('[SSE] 连接异常，浏览器将自动重连')
            }
            this.sources.set(pointId, es)
        }
    }

    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        const es = this.sources.get(pointId)
        if (es) {
            es.close()
            this.sources.delete(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    disconnect(): void {
        for (const [, es] of this.sources) {
            es.close()
        }
        this.sources.clear()
        this.callbacks.clear()
        this.connected = false
    }
}
