/**
 * 数据点定义
 */
export interface DataPoint {
    id: string // 数据点唯一标识
    value: number | string
    timestamp: number
    quality?: 'good' | 'bad' | 'uncertain' // 数据质量
}

/**
 * 数据订阅回调
 */
export type DataCallback = (point: DataPoint) => void

/**
 * 数据服务接口
 * 支持多种数据源：WebSocket、MQTT、HTTP轮询、SSE
 */
export interface IDataService {
    /** 订阅数据点 */
    subscribe(pointId: string, callback: DataCallback): void
    /** 取消订阅 */
    unsubscribe(pointId: string): void
    /** 连接状态 */
    isConnected(): boolean
    /** 断开连接 */
    disconnect(): void
}

/**
 * 数据绑定配置（存储在节点 data 中）
 */
export interface DataBindingConfig {
    /** 数据点 ID（用于订阅） */
    pointId: string
    /** 数据源类型 */
    sourceType: 'websocket' | 'mqtt' | 'http' | 'sse'
    /** 数据源地址 */
    sourceUrl?: string
    /** 数据转换函数（字符串 → 数值） */
    transform?: (raw: any) => number | string
    /** 更新间隔（毫秒，仅 HTTP 轮询有效） */
    interval?: number
}