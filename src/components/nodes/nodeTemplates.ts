// ========== 节点模板注册表（nodeTemplates）==========
// 所属层级：画布节点组件层的“配置中心”，配合 registry.ts（形状注册）使用
//
// 用途：
//   1. 用配置驱动代替原 Sidebar.vue 中 484 行的 if-else 分支链，
//      每种节点类型的「显示信息 + 尺寸 + 默认数据」集中在一条配置中
//   2. 新增节点类型只需在 nodeTemplates 数组中追加一项，无需改动任何分支逻辑
//   3. buildNodeConfig() 负责把模板转换成 X6 可用的节点配置（形状/尺寸/样式/data），
//      供组件库拖拽创建节点时调用
//
// 数据绑定约定（v3 起）：
//   新建节点不注入 pointId/binding —— 旧演示时代的默认点ID（sensor.temp 等）已移除，
//   点组一律由用户在属性面板「数据绑定」页录入（演示模式缺省点组由绑定模型保障）。
//
// 分组说明：
//   - 基础节点：矩形 / 圆形 / 卡片
//   - WCS 设备节点：堆垛机 / 输送机 / AGV / 穿梭车 / 分拣机 / 提升机 / 机械手 / 货架
//   - IoT 监控节点：仪表盘 / 折线图 / 指示灯
// ============================================================

/**
 * 节点模板定义
 *
 * 将原 Sidebar.vue 中 484 行的 if-else 链重构为配置驱动：
 * 每个节点类型的「显示信息 + 尺寸 + 默认数据」集中在一条配置中，
 * 新增节点类型只需在 nodeTemplates 数组中追加一项，无需改动任何分支逻辑。
 */
export interface NodeTemplate {
  /** X6 节点形状名称（需已在 registry.ts 中注册） */
  type: string
  /** 显示名称 */
  label: string
  /** 图标 */
  icon: string
  /** 所属分组（组件库分类展示，如 基础 / WCS 设备 / IoT 监控） */
  group: string
  /** 节点宽度 */
  width: number
  /** 节点高度 */
  height: number
  /** X6 原生形状样式（仅 rect/circle 使用），接收 label 用于文本 */
  attrs?: (label: string) => Record<string, any>
  /** 连接桩配置（仅 rect 使用） */
  ports?: Record<string, any>
  /**
   * 默认数据（不含 pointId/binding，新建节点不注入数据绑定）。
   * 可为静态对象（工厂会深拷贝避免共享引用），
   * 或函数（每次拖拽返回全新对象，适用于含随机/动态数据的节点）。
   */
  data?: Record<string, any> | ((item: NodeTemplate) => Record<string, any>)
  /**
   * 复杂数据构建器（如货架：初始货格需随机生成）。
   * 返回完整 data（不含 binding）。优先级高于 data。
   */
  buildData?: () => Record<string, any>
}

/** 矩形连接桩（上下两个可吸附连接点） */
const rectPorts = {
  groups: {
    top: {
      position: 'top',
      attrs: {
        circle: { r: 4, magnet: true, stroke: '#31d0c6', strokeWidth: 2, fill: '#fff' },
      },
    },
    bottom: {
      position: 'bottom',
      attrs: {
        circle: { r: 4, magnet: true, stroke: '#31d0c6', strokeWidth: 2, fill: '#fff' },
      },
    },
  },
  items: [
    { id: 'top', group: 'top' },
    { id: 'bottom', group: 'bottom' },
  ],
}

/** 原生形状通用样式工厂 */
const nativeAttrs = (extra: Record<string, any>) => (label: string) => ({
  body: { fill: '#fff', stroke: '#333', ...extra },
  label: { text: label, fill: '#333', fontSize: 14 },
})

/** 货架默认维度：单深位（排=1）、6 列、4 层 */
const RACK_ROWS = 1
const RACK_COLS = 6
const RACK_FLOORS = 4

/**
 * 货架货位状态生成函数（无闭包、自包含，仅用于初始货格）。
 *
 * v3 起不再作为 binding 转换函数注入，仅供 buildData 生成初始 floorGrids。
 */
const rackTransform = (_raw: any) => {
  const rows = 1
  const cols = 6
  const floors = 4
  const newGrids = Array.from({ length: floors }, () =>
    Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => {
        const rand = Math.random()
        const status = rand < 0.3 ? 'empty' : rand < 0.6 ? 'occupied' : 'reserved'
        return { status }
      })
    )
  )
  return { floorGrids: newGrids }
}

export const nodeTemplates: NodeTemplate[] = [
  // ===== 基础节点（无数据绑定） =====
  {
    type: 'rect', label: '矩形', icon: '▭',
    group: '基础',
    width: 120, height: 60,
    attrs: nativeAttrs({ rx: 6, ry: 6 }),
    ports: rectPorts,
  },
  {
    type: 'circle', label: '圆形', icon: '◯',
    group: '基础',
    width: 120, height: 60,
    attrs: nativeAttrs({ rx: '50%' }),
  },
  {
    type: 'custom-card', label: '卡片节点', icon: '📋',
    group: '基础',
    width: 160, height: 80,
    data: (item) => ({ title: item.label, icon: item.icon, status: '正常' }),
  },

  // ===== WCS 设备节点 =====
  {
    type: 'stacker-node', label: '堆垛机', icon: '🏗️',
    group: 'WCS 设备',
    width: 200, height: 130,
    data: { name: '堆垛机-01', lane: 'A01', position: '05-12-03', status: 'idle', isMoving: false, progress: 0 },
  },
  {
    type: 'conveyor-node', label: '输送机', icon: '⚡',
    group: 'WCS 设备',
    width: 220, height: 80,
    data: { name: '输送线-01', direction: 'left', isRunning: false, status: 'idle' },
  },
  {
    type: 'agv-node', label: 'AGV', icon: '🤖',
    group: 'WCS 设备',
    width: 160, height: 120,
    data: { name: 'AGV-01', battery: 85, isMoving: false, status: 'idle' },
  },
  {
    type: 'shuttle-node', label: '穿梭车', icon: '🚗',
    group: 'WCS 设备',
    width: 200, height: 100,
    data: { name: '穿梭车-01', position: 50, status: 'idle' },
  },
  {
    type: 'sorter-node', label: '分拣机', icon: '📦',
    group: 'WCS 设备',
    width: 240, height: 160,
    // 函数形式：确保每个节点获得全新的 chutes 数组，避免共享引用
    data: () => ({
      name: '分拣机-01',
      speed: 60,
      status: 'idle',
      chutes: [
        { label: 'A区', count: 0, active: false },
        { label: 'B区', count: 0, active: false },
        { label: 'C区', count: 0, active: false },
        { label: 'D区', count: 0, active: false },
      ],
    }),
  },
  {
    type: 'elevator-node', label: '提升机', icon: '🔼',
    group: 'WCS 设备',
    width: 120, height: 160,
    data: { name: '提升机-01', maxLevel: 6, currentLevel: 1, position: 0, status: 'idle' },
  },
  {
    type: 'robot-node', label: '机械手', icon: '🦾',
    group: 'WCS 设备',
    width: 150, height: 130,
    data: { name: '机械手-01', jointAngle: 0, isOpen: false, status: 'idle' },
  },
  {
    type: 'rack-node', label: '货架', icon: '🏛️',
    group: 'WCS 设备',
    width: 240, height: 150,
    /**
     * 货架三维模型：
     * - rows  排（深度方向）：单深位 = 1，双深位 = 2
     * - cols  列（宽度方向）
     * - floors 层（高度方向）
     * 库位编号规则：排_列_层（如 1_3_2）。默认单深位。
     */
    buildData: () => {
      const rows = RACK_ROWS
      const cols = RACK_COLS
      const floors = RACK_FLOORS
      // 初始货位占用随机生成，保证与运行期更新形状一致
      const initial = rackTransform(0)
      return {
        name: '货架-A01',
        rows,
        cols,
        floors,
        floorGrids: initial.floorGrids,
      }
    },
  },

  // ===== IoT 节点 =====
  {
    type: 'gauge-node', label: '仪表盘', icon: '📊',
    group: 'IoT 监控',
    width: 200, height: 180,
    data: { title: '温度', unit: '°C', value: 50 },
  },
  {
    type: 'chart-node', label: '折线图', icon: '📈',
    group: 'IoT 监控',
    width: 260, height: 160,
    // 函数形式：确保每个节点获得全新的 history 数组
    data: () => ({ title: '实时曲线', history: Array(20).fill(0) }),
  },
  {
    type: 'indicator-node', label: '指示灯', icon: '💡',
    group: 'IoT 监控',
    width: 130, height: 70,
    // 设备状态直接用主点转换后的 value 驱动（on/off/warning/error），不再单独存 status
    data: { label: '设备状态', value: 'off' },
  },
]

/**
 * 根据模板构建 X6 节点配置
 *
 * 统一处理：尺寸设置、原生形状样式、data 构建。
 * 不注入 pointId/binding —— 数据绑定由用户在属性面板录入（v3 起，
 * 旧演示时代的默认点ID 已移除）。
 *
 * @param item 节点模板
 * @returns 可直接传给 graph.createNode() 的配置对象
 */
export function buildNodeConfig(item: NodeTemplate): Record<string, any> {
  const config: Record<string, any> = {
    shape: item.type,
    width: item.width,
    height: item.height,
  }

  // 原生形状（rect/circle）的样式与连接桩
  if (item.attrs) config.attrs = item.attrs(item.label)
  if (item.ports) config.ports = item.ports

  // 构建节点数据：复杂构建器优先；否则静态 data 深拷贝 / 函数 data 返回全新对象
  if (item.buildData) {
    config.data = item.buildData()
  } else if (item.data) {
    config.data =
      typeof item.data === 'function'
        ? item.data(item)
        : structuredClone(item.data)
  }

  return config
}
