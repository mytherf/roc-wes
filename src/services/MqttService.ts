import mqtt from 'mqtt'
import type { IDataService, DataPoint, DataCallback } from './DataService'

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
                for (const cb of this.callbacks.get(topic) || []) {
                    cb(point)
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
