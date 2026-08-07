// ========== 数据服务层：核心类型与接口定义 ==========
// 这是所有数据服务的“总纲”文件，只定义类型和接口，不写具体实现。
// 它约定了：
// 1. 数据点（DataPoint）长什么样 —— 所有协议最终都统一成这个结构
// 2. 数据服务（IDataService）必须提供哪些能力 —— 订阅/退订/连接判断/断开
// 3. 节点上的数据绑定配置（DataBindingConfig）包含哪些字段

/**
 * 数据点定义：一条实时数据的“标准信封”
 * 无论数据来自 WebSocket/MQTT/HTTP/SSE 还是 Rust 网关，都统一转成这个结构
 */
export interface DataPoint {
    id: string // 数据点唯一标识（pointId，节点用它订阅）
    value: number | string // 数值（传感器读数）或字符串（状态等）
    timestamp: number // 数据产生时间（毫秒时间戳）
    quality?: 'good' | 'bad' | 'uncertain' // 数据质量：好/坏/不确定（工业协议概念）
}

/**
 * 数据订阅回调：每当有新数据到达时，系统调用这个函数
 * @param point 最新的数据点
 */
export type DataCallback = (point: DataPoint) => void

/**
 * 数据服务接口：所有具体协议服务（WebSocket/MQTT/HTTP/SSE）都要实现它
 * 好处：上层（useDataService）只面向接口编程，想换数据源不用改业务代码
 */
export interface IDataService {
    /** 订阅数据点：注册回调，之后每次收到新值都会调用 callback */
    subscribe(pointId: string, callback: DataCallback): void
    /** 取消订阅：不再接收该点数据（节点删除/页面关闭时调用） */
    unsubscribe(pointId: string): void
    /** 连接状态：是否已与数据源建立连接 */
    isConnected(): boolean
    /** 断开连接：释放所有资源 */
    disconnect(): void
}

/**
 * 数据绑定配置（存储在节点 data 中）
 * 画布上每个节点都可以配置“绑定哪个数据点”，字段如下：
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
     * 为什么用字符串？因为函数（Function）无法被 JSON 序列化，
     * 而工程文件（画布 JSON）需要存到 localStorage/导出，所以存源码字符串。
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