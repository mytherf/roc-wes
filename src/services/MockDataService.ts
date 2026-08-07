// ========== 模拟数据服务 ==========
// 开发/演示阶段没有真实设备时，用本服务“假装”产生实时数据：
// 每隔 1 秒为每个被订阅的点生成一个平滑波动的数值，并通知回调函数。
// 它实现了 IDataService 接口，所以上层代码可以把它和真实协议服务一样使用。

import type { IDataService, DataPoint, DataCallback } from './DataService'

/** 由 pointId 生成稳定的整数哈希（用于相位错开，保证同一点波形稳定）
 * 简单字符串哈希：把字符串每个字符的编码累乘 31 再取整
 * 作用：不同 pointId 得到不同相位 → 各节点波形错开，看起来更真实 */
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
 * @param pointId 数据点 ID（决定波形相位）
 * @param t 当前时间戳（决定波形位置）
 * @returns 一位小数的模拟值
 */
function mockValue(pointId: string, t: number): number {
    const phase = (hashInt(pointId) % 628) / 100 // 0~2π 相位偏移（点不同、波形错开）
    // 50 为基线，30 为正弦振幅，微小随机噪声 ±1，最后四舍五入到 0.1
    return Math.round((50 + 30 * Math.sin(t / 5000 + phase) + (Math.random() - 0.5) * 2) * 10) / 10
}

/**
 * 模拟数据服务（用于开发测试）
 * 定时生成随机数据
 */
export class MockDataService implements IDataService {
    // 每个点 ID 对应的回调函数列表（一个点可能被多个节点订阅）
    private callbacks: Map<string, DataCallback[]> = new Map()
    // 每个点 ID 对应的定时器（setInterval 返回的编号）
    private timers: Map<string, number> = new Map()
    private connected = true // 模拟服务默认“已连接”

    // 订阅：注册回调并启动该点的数据生成定时器
    subscribe(pointId: string, callback: DataCallback): void {
        // 首次订阅该点时先建一个空数组
        if (!this.callbacks.has(pointId)) {
            this.callbacks.set(pointId, [])
        }
        this.callbacks.get(pointId)!.push(callback) // 追加回调

        // 启动模拟数据生成：每个点只启动一个定时器（避免重复）
        if (!this.timers.has(pointId)) {
            const timer = window.setInterval(() => {
                // 构造一个“标准信封”数据点
                const point: DataPoint = {
                    id: pointId,
                    value: mockValue(pointId, Date.now()), // 生成平滑波动值
                    timestamp: Date.now(),
                    quality: 'good',
                }
                // 逐个通知所有订阅了该点的回调
                for (const cb of this.callbacks.get(pointId) || []) {
                    cb(point)
                }
            }, 1000) // 每 1 秒生成一次
            this.timers.set(pointId, timer)
        }
    }

    // 退订：移除回调并停掉该点的定时器（省资源）
    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        if (this.timers.has(pointId)) {
            clearInterval(this.timers.get(pointId)) // 停止定时器
            this.timers.delete(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    // 断开：停掉所有定时器、清空所有回调（应用销毁时调用）
    disconnect(): void {
        for (const [, timer] of this.timers) {
            clearInterval(timer)
        }
        this.timers.clear()
        this.callbacks.clear()
        this.connected = false
    }
}