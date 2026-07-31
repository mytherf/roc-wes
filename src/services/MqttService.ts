import mqtt from 'mqtt'
import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * 判断具体主题（topic）是否匹配订阅过滤器（filter），支持 MQTT 通配符：
 * - `+` 匹配单个层级（如 `sensors/+/temp` 匹配 `sensors/1/temp`）
 * - `#` 匹配零个或多个层级，且只能位于末尾（如 `sensors/#` 匹配 `sensors/1/temp`）
 * 不含通配符时退化为精确匹配。
 */
function topicMatches(filter: string, topic: string): boolean {
    if (filter === topic) return true
    if (!filter.includes('+') && !filter.includes('#')) return false
    const f = filter.split('/')
    const t = topic.split('/')
    for (let i = 0; i < f.length; i++) {
        if (f[i] === '#') return true // # 匹配剩余全部层级（含零层）
        if (f[i] === '+') {
            if (i >= t.length) return false // 主题层级不足
            continue // + 匹配当前任意单层
        }
        if (f[i] !== t[i]) return false
    }
    return f.length === t.length
}

/**
 * MQTT 数据服务
 * 通过 mqtt.js 连接 broker（浏览器经 WebSocket，如 ws://localhost:8083），
 * 以 pointId 作为主题（topic）订阅，接收发布的数据。
 */
export class MqttService implements IDataService {
    private client: mqtt.MqttClient
    private callbacks: Map<string, DataCallback[]> = new Map()
    private connected = false

    constructor(url: string) {
        this.client = mqtt.connect(url, { reconnectPeriod: 3000, connectTimeout: 5000 })

        this.client.on('connect', () => {
            this.connected = true
            console.log('[MQTT] 已连接')
            // 重连后重新订阅之前的所有主题
            for (const [topic] of this.callbacks) {
                this.client.subscribe(topic)
            }
        })

        this.client.on('reconnect', () => {
            console.log('[MQTT] 重连中...')
        })

        this.client.on('message', (topic, payload) => {
            try {
                const data = JSON.parse(payload.toString())
                const point: DataPoint = {
                    id: topic,
                    value: data.value ?? data.data ?? data,
                    timestamp: data.timestamp || Date.now(),
                    quality: data.quality || 'good',
                }
                // 收到的 topic 为具体主题；遍历所有订阅过滤器（可能含通配符）进行匹配分发
                for (const [filter, cbs] of this.callbacks) {
                    if (topicMatches(filter, topic)) {
                        for (const cb of cbs) {
                            cb(point)
                        }
                    }
                }
            } catch (e) {
                console.warn('[MQTT] 解析数据失败:', e)
            }
        })

        this.client.on('error', (error) => {
            console.error('[MQTT] 错误:', error)
        })
    }

    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)
        if (this.connected) {
            this.client.subscribe(pointId)
        }
    }

    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        if (this.connected) {
            this.client.unsubscribe(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    disconnect(): void {
        this.client.end(true)
        this.callbacks.clear()
        this.connected = false
    }
}
