import type { IDataService, DataPoint, DataCallback } from './DataService'

/** 由 pointId 生成稳定的整数哈希（用于相位错开，保证同一点波形稳定） */
function hashInt(str: string): number {
    let h = 0
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0
    }
    return Math.abs(h)
}

/**
 * 生成模拟遥测值：平滑正弦波 + 微小噪声（约 20~80）。
 * 相比纯随机数，波形连续、更接近真实传感器读数，便于演示与事件阈值调试。
 */
function mockValue(pointId: string, t: number): number {
    const phase = (hashInt(pointId) % 628) / 100 // 0~2π 相位偏移
    return Math.round((50 + 30 * Math.sin(t / 5000 + phase) + (Math.random() - 0.5) * 2) * 10) / 10
}

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
                    value: mockValue(pointId, Date.now()),
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