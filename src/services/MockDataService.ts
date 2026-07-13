import type { IDataService, DataPoint, DataCallback } from './DataService'

/**
 * 模拟数据服务（用于开发测试）
 * 定时生成随机数据
 */
export class MockDataService implements IDataService {
    private callbacks: Map<string, DataCallback[]> = new Map()
    private timers: Map<string, number> = new Map()
    private connected = true

    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback)

        // 启动模拟数据生成
        if (!this.timers.has(pointId)) {
            const timer = window.setInterval(() => {
                const point: DataPoint = {
                    id: pointId,
                    value: Math.round((Math.random() * 80 + 20) * 10) / 10,
                    timestamp: Date.now(),
                    quality: 'good',
                }
                for (const cb of this.callbacks.get(pointId) || []) {
                    cb(point)
                }
            }, 1000)
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