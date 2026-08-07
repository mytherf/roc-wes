// ========== MQTT 数据服务 ==========
// MQTT 是物联网最常用的“发布/订阅”消息协议，核心概念：
//   - broker（消息代理）：中转站，如 mosquitto、EMQX
//   - topic（主题）：消息的“频道”，如 'sensors/temp'
//   - 发布者往主题发消息，订阅者订阅主题收消息，双方互不认识
// 本项目用 mqtt.js 库（浏览器通过 WebSocket 连接 broker）。
// pointId 直接当作 topic 使用。

import mqtt from 'mqtt' // mqtt.js 客户端库
import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * 判断具体主题（topic）是否匹配订阅过滤器（filter），支持 MQTT 通配符：
 * - `+` 匹配单个层级（如 `sensors/+/temp` 匹配 `sensors/1/temp`）
 * - `#` 匹配零个或多个层级，且只能位于末尾（如 `sensors/#` 匹配 `sensors/1/temp`）
 * 不含通配符时退化为精确匹配。
 */
function topicMatches(filter: string, topic: string): boolean {
    if (filter === topic) return true // 完全相同 → 匹配
    if (!filter.includes('+') && !filter.includes('#')) return false // 无通配符且不相同 → 不匹配
    // 把过滤器和真实主题都按 / 拆成层级数组，逐层比较
    const f = filter.split('/')
    const t = topic.split('/')
    for (let i = 0; i < f.length; i++) {
        if (f[i] === '#') return true // # 匹配剩余全部层级（含零层）
        if (f[i] === '+') {
            if (i >= t.length) return false // 主题层级不足
            continue // + 匹配当前任意单层
        }
        if (f[i] !== t[i]) return false // 普通层级不相等 → 不匹配
    }
    return f.length === t.length // 层级数必须一致
}

/**
 * MQTT 数据服务
 * 通过 mqtt.js 连接 broker（浏览器经 WebSocket，如 ws://localhost:8083），
 * 以 pointId 作为主题（topic）订阅，接收发布的数据。
 */
export class MqttService implements IDataService {
    private client: mqtt.MqttClient // mqtt.js 客户端实例
    private callbacks: Map<string, DataCallback[]> = new Map() // 主题(过滤器) → 回调列表
    private connected = false

    constructor(url: string) {
        // 连接 broker：断线后 3 秒自动重连，连接超时 5 秒
        this.client = mqtt.connect(url, { reconnectPeriod: 3000, connectTimeout: 5000 })

        // 连接成功事件
        this.client.on('connect', () => {
            this.connected = true
            console.log('[MQTT] 已连接')
            // 重连后重新订阅之前的所有主题（否则断线后订阅会丢失）
            for (const [topic] of this.callbacks) {
                this.client.subscribe(topic)
            }
        })

        // 重连中事件（仅记录日志）
        this.client.on('reconnect', () => {
            console.log('[MQTT] 重连中...')
        })

        // 收到消息事件：payload 是二进制 Buffer，转字符串后解析 JSON
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
                    if (topicMatches(filter, topic)) { // 该消息命中此订阅
                        for (const cb of cbs) {
                            cb(point)
                        }
                    }
                }
            } catch (e) {
                console.warn('[MQTT] 解析数据失败:', e)
            }
        })

        // 错误事件（仅记录）
        this.client.on('error', (error) => {
            console.error('[MQTT] 错误:', error)
        })
    }

    // 订阅：登记回调，若已连接则向 broker 发起主题订阅
    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)
        if (this.connected) {
            this.client.subscribe(pointId)
        }
    }

    // 退订：移除回调，若已连接则通知 broker 取消订阅
    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        if (this.connected) {
            this.client.unsubscribe(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    // 断开：end(true) 强制立即断开（不等未完成消息）
    disconnect(): void {
        this.client.end(true)
        this.callbacks.clear()
        this.connected = false
    }
}
