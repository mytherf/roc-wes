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
 * 绑定点条目：点 ID 与转换函数为一组（属性面板中按组添加/删除）
 */
export interface BindingPointEntry {
    /** 点 ID（用于订阅） */
    pointId: string
    /** 点名称（可选，人类可读标识，不参与订阅） */
    name?: string
    /** 该点专属的转换函数源码（可选） */
    transformSource?: string
    /** 备注（可选，纯说明性文字，不参与订阅与运行逻辑） */
    remark?: string
}

/**
 * 画面驱动配置：指定驱动节点画面（data.value）的点组。
 * 缺省或 pointId 不在 points 中时回落首个点组（旧存档完全兼容）；
 * 后续可扩展多点组合驱动（表达式）等模式。
 */
export interface BindingDisplayConfig {
    /** 驱动画面的点ID（必须是 points 中存在的点ID） */
    pointId: string
}

/**
 * 数据绑定配置（存储在节点 data 中）
 * 画布上每个节点都可以配置“绑定哪个数据点”，字段如下：
 */
export interface DataBindingConfig {
    /**
     * 全部绑定点组列表：每组 = 点 ID + 点名称 + 转换函数 + 备注；点组地位平等、可为空数组，
     * 顺序无隐式语义。全部点数据写入 data.values[pointId]，
     * 画面点（display.pointId，缺省回落首个点组）额外写入 data.value 驱动节点渲染。
     */
    points: BindingPointEntry[]
    /** 数据源实例 ID（引用「数据源管理」中创建的实例；为空则不订阅，节点保持静态值） */
    sourceId?: string
    /** 更新间隔（毫秒，仅 HTTP 轮询有效） */
    interval?: number
    /** 画面驱动配置（可选；缺省回落首个点组） */
    display?: BindingDisplayConfig
}