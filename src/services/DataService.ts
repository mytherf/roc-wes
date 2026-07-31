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
    /** 数据源实例 ID（引用「数据源管理」中创建的实例；为空则使用模拟数据） */
    sourceId?: string
    /** 数据源类型（兼容旧数据；新数据通过 sourceId 解析） */
    sourceType?: 'websocket' | 'mqtt' | 'http' | 'sse' | 's7' | 'opc' | 'modbus'
    /** 数据源地址（兼容旧数据；新数据通过 sourceId 解析） */
    sourceUrl?: string
    /**
     * 转换函数源码（可持久化）。箭头函数字符串，参数固定为 raw，例如：
     * - 简单表达式："(raw) => Math.round(raw * 10) / 10"
     * - 多语句：    "(raw) => { const v = Number(raw); return { status: v > 80 ? 'error' : 'idle' } }"
     * 序列化保存工程时保留此字符串；加载后由 useDataService 在订阅时编译为 transform。
     */
    transformSource?: string
    /**
     * 运行时编译出的数据转换函数（原始值 → 数值/字符串/局部数据对象）。
     * 注意：此字段为 Function，无法被 JSON 序列化，仅作运行期缓存；
     * 持久化与跨会话恢复依赖 transformSource。
     */
    transform?: (raw: any) => number | string | Record<string, any>
    /** 更新间隔（毫秒，仅 HTTP 轮询有效） */
    interval?: number
}