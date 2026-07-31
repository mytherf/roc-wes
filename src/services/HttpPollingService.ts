import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * HTTP 轮询数据服务
 * 按固定间隔向 `${url}?pointId=xxx` 发起 GET 请求，解析返回的 JSON 数据。
 * 服务端需返回 { id, value, timestamp, quality } 结构（兼容 value/data 字段）。
 */
export class HttpPollingService implements IDataService {
    private url: string
    private interval: number
    private callbacks: Map<string, DataCallback[]> = new Map()
    private timers: Map<string, number> = new Map()
    private connected = true

    constructor(url: string, interval = 2000) {
        this.url = url
        // 防御非法间隔（0 / 负数 / NaN），回退默认 2000ms
        this.interval = Number(interval) > 0 ? Number(interval) : 2000
    }

    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)

        if (!this.timers.has(pointId)) {
            const poll = async () => {
                try {
                    const sep = this.url.includes('?') ? '&' : '?'
                    const resp = await fetch(`${this.url}${sep}pointId=${encodeURIComponent(pointId)}`)
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                    const data = await resp.json()
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
                    console.warn('[HTTP] 轮询失败:', e)
                }
            }
            // 立即拉取一次，随后按间隔轮询
            poll()
            const timer = window.setInterval(poll, this.interval)
            this.timers.set(pointId, timer)
        }
    }

    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        if (this.timers.has(pointId)) {
            clearInterval(this.timers.get(pointId))
            this.timers.delete(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    disconnect(): void {
        for (const [, timer] of this.timers) {
            clearInterval(timer)
        }
        this.timers.clear()
        this.callbacks.clear()
        this.connected = false
    }
}
