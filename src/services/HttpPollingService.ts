// ========== HTTP 轮询数据服务 ==========
// 原理：服务器不主动推送，客户端每隔一段时间（默认 2 秒）发一次 HTTP GET 请求，
// 向 `${url}?pointId=xxx` 查询某个数据点的最新值。
// 适合数据变化不频繁、对实时性要求不高的场景（如设备状态、温湿度等）。

import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * HTTP 轮询数据服务
 * 按固定间隔向 `${url}?pointId=xxx` 发起 GET 请求，解析返回的 JSON 数据。
 * 服务端需返回 { id, value, timestamp, quality } 结构（兼容 value/data 字段）。
 */
export class HttpPollingService implements IDataService {
    private url: string // 服务地址
    private interval: number // 轮询间隔（毫秒）
    // 每个点 ID 的回调列表
    private callbacks: Map<string, DataCallback[]> = new Map()
    // 每个点 ID 的轮询定时器
    private timers: Map<string, number> = new Map()
    private connected = true

    constructor(url: string, interval = 2000) {
        this.url = url
        // 防御非法间隔（0 / 负数 / NaN），回退默认 2000ms
        this.interval = Number(interval) > 0 ? Number(interval) : 2000
    }

    // 订阅：注册回调 + 启动该点的轮询定时器
    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)

        if (!this.timers.has(pointId)) {
            // 轮询函数：发请求 → 解析 → 通知所有回调
            const poll = async () => {
                try {
                    // 拼接查询参数：URL 已有 ? 用 &，否则用 ?（处理两种格式的 URL）
                    const sep = this.url.includes('?') ? '&' : '?'
                    // encodeURIComponent 对点 ID 做 URL 编码，防止特殊字符破坏 URL
                    const resp = await fetch(`${this.url}${sep}pointId=${encodeURIComponent(pointId)}`)
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`) // 非 2xx 视为失败
                    const data = await resp.json() // 解析 JSON 响应
                    // 兼容不同字段名：value 或 data 都行
                    const point: DataPoint = {
                        id: data.id || pointId, // 服务端没返回 id 就用请求的点 ID
                        value: data.value ?? data.data,
                        timestamp: data.timestamp || Date.now(),
                        quality: data.quality || 'good',
                    }
                    // 通知所有订阅者
                    for (const cb of this.callbacks.get(pointId) || []) {
                        cb(point)
                    }
                } catch (e) {
                    // 网络失败只记录不崩溃（下次轮询会再试）
                    console.warn('[HTTP] 轮询失败:', e)
                }
            }
            // 立即拉取一次，随后按间隔轮询
            poll()
            const timer = window.setInterval(poll, this.interval)
            this.timers.set(pointId, timer)
        }
    }

    // 退订：移除回调并停止该点的轮询
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

    // 断开：停止所有轮询、清空回调
    disconnect(): void {
        for (const [, timer] of this.timers) {
            clearInterval(timer)
        }
        this.timers.clear()
        this.callbacks.clear()
        this.connected = false
    }
}
