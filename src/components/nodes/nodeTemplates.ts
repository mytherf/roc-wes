import type { Graph } from '@antv/x6'
import { PointIdGenerator } from '@/services/PointIdGenerator'

/**
 * 节点模板定义
 *
 * 将原 Sidebar.vue 中 484 行的 if-else 链重构为配置驱动：
 * 每个节点类型的「显示信息 + 尺寸 + 默认数据 + 数据绑定」集中在一条配置中，
 * 新增节点类型只需在 nodeTemplates 数组中追加一项，无需改动任何分支逻辑。
 */
export interface NodeTemplate {
  /** X6 节点形状名称（需已在 registry.ts 中注册） */
  type: string
  /** 显示名称 */
  label: string
  /** 图标 */
  icon: string
  /** 预设点ID模板（null/undefined 表示不生成 pointId、不创建数据绑定） */
  pointIdTemplate?: string | null
  /** 节点宽度 */
  width: number
  /** 节点高度 */
  height: number
  /** X6 原生形状样式（仅 rect/circle 使用），接收 label 用于文本 */
  attrs?: (label: string) => Record<string, any>
  /** 连接桩配置（仅 rect 使用） */
  ports?: Record<string, any>
  /**
   * 默认数据（不含 pointId/binding，由工厂自动注入）。
   * 可为静态对象（工厂会深拷贝避免共享引用），
   * 或函数（每次拖拽返回全新对象，适用于含随机/动态数据的节点）。
   */
  data?: Record<string, any> | ((item: NodeTemplate) => Record<string, any>)
  /** 数据绑定转换函数（原始值 → 业务状态），存在 pointIdTemplate 时生效 */
  transform?: (raw: any) => any
  /**
   * 复杂数据构建器（如货架：transform 需闭包引用随机货格）。
   * 接收 pointId，返回完整 data（含 binding）。优先级高于 data/transform。
   */
  buildData?: (pointId: string) => Record<string, any>
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

export const nodeTemplates: NodeTemplate[] = [
  // ===== 基础节点（无数据绑定） =====
  {
    type: 'rect', label: '矩形', icon: '▭',
    width: 120, height: 60,
    attrs: nativeAttrs({ rx: 6, ry: 6 }),
    ports: rectPorts,
  },
  {
    type: 'circle', label: '圆形', icon: '◯',
    width: 120, height: 60,
    attrs: nativeAttrs({ rx: '50%' }),
  },
  {
    type: 'custom-card', label: '卡片节点', icon: '📋',
    pointIdTemplate: 'device.card',
    width: 160, height: 80,
    data: (item) => ({ title: item.label, icon: item.icon, status: '正常' }),
  },

  // ===== WCS 设备节点 =====
  {
    type: 'stacker-node', label: '堆垛机', icon: '🏗️',
    pointIdTemplate: 'device.stacker',
    width: 200, height: 130,
    data: { name: '堆垛机-01', lane: 'A01', position: '05-12-03', status: 'idle', isMoving: false, progress: 0 },
    transform: (raw: any) => {
      const v = Number(raw)
      // 模拟堆垛机状态：0-20 idle, 20-60 running, 60-80 warning, 80-100 error
      if (v < 20) return { status: 'idle', isMoving: false, progress: 0 }
      if (v < 60) return { status: 'running', isMoving: true, progress: ((v - 20) / 40) * 100 }
      if (v < 80) return { status: 'warning', isMoving: false, progress: 0 }
      return { status: 'error', isMoving: false, progress: 0 }
    },
  },
  {
    type: 'conveyor-node', label: '输送机', icon: '⚡',
    pointIdTemplate: 'device.conveyor',
    width: 220, height: 80,
    data: { name: '输送线-01', direction: 'left', isRunning: false, status: 'idle' },
    transform: (raw: any) => {
      const v = Number(raw)
      if (v < 30) return { isRunning: false, status: 'idle' }
      if (v < 70) return { isRunning: true, status: 'running' }
      return { isRunning: false, status: 'error' }
    },
  },
  {
    type: 'agv-node', label: 'AGV', icon: '🤖',
    pointIdTemplate: 'device.agv',
    width: 160, height: 120,
    data: { name: 'AGV-01', battery: 85, isMoving: false, status: 'idle' },
    transform: (raw: any) => {
      const v = Number(raw)
      if (v < 20) return { battery: 20, isMoving: false, status: 'charging' }
      if (v < 40) return { battery: v, isMoving: false, status: 'idle' }
      if (v < 80) return { battery: v, isMoving: true, status: 'running' }
      return { battery: v, isMoving: false, status: 'error' }
    },
  },
  {
    type: 'shuttle-node', label: '穿梭车', icon: '🚗',
    pointIdTemplate: 'device.shuttle',
    width: 200, height: 100,
    data: { name: '穿梭车-01', position: 50, status: 'idle' },
    transform: (raw: any) => {
      const v = Number(raw)
      const pos = v % 100
      if (v < 30) return { position: pos, status: 'idle' }
      if (v < 80) return { position: pos, status: 'running' }
      return { position: pos, status: 'error' }
    },
  },
  {
    type: 'sorter-node', label: '分拣机', icon: '📦',
    pointIdTemplate: 'device.sorter',
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
    transform: (raw: any) => {
      const v = Number(raw)
      const chutes = [
        { label: 'A区', count: Math.floor(v * 0.1), active: v > 20 },
        { label: 'B区', count: Math.floor(v * 0.2), active: v > 40 },
        { label: 'C区', count: Math.floor(v * 0.3), active: v > 60 },
        { label: 'D区', count: Math.floor(v * 0.4), active: v > 80 },
      ]
      return { speed: 30 + v * 0.7, status: v > 90 ? 'error' : v > 10 ? 'running' : 'idle', chutes }
    },
  },
  {
    type: 'elevator-node', label: '提升机', icon: '🔼',
    pointIdTemplate: 'device.elevator',
    width: 120, height: 160,
    data: { name: '提升机-01', maxLevel: 6, currentLevel: 1, position: 0, status: 'idle' },
    transform: (raw: any) => {
      const v = Number(raw)
      const level = Math.floor(((v % 100) / 100) * 6) + 1
      if (v < 30) return { currentLevel: level, position: v, status: 'idle' }
      if (v < 80) return { currentLevel: level, position: v, status: 'running' }
      return { currentLevel: level, position: v, status: 'error' }
    },
  },
  {
    type: 'robot-node', label: '机械手', icon: '🦾',
    pointIdTemplate: 'device.robot',
    width: 150, height: 130,
    data: { name: '机械手-01', jointAngle: 0, isOpen: false, status: 'idle' },
    transform: (raw: any) => {
      const v = Number(raw)
      if (v < 20) return { jointAngle: 0, isOpen: false, status: 'idle' }
      if (v < 40) return { jointAngle: 30, isOpen: false, status: 'idle' }
      if (v < 60) return { jointAngle: 60, isOpen: true, status: 'running' }
      if (v < 80) return { jointAngle: 90, isOpen: true, status: 'running' }
      return { jointAngle: 0, isOpen: false, status: 'error' }
    },
  },
  {
    type: 'rack-node', label: '货架', icon: '🏛️',
    pointIdTemplate: 'device.rack',
    width: 220, height: 280,
    // 复杂构建器：transform 需闭包引用随机生成的货格数据
    buildData: (pointId: string) => {
      const rows = 4
      const cols = 6
      const floors = 6
      // 生成随机货位占用（三维：层×排×列）
      const floorGrids = Array.from({ length: floors }, () =>
        Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => ({
            status: Math.random() > 0.6 ? 'occupied' : 'empty',
          }))
        )
      )
      return {
        name: '货架-A01',
        rows,
        cols,
        floors,
        floorGrids,
        pointId,
        binding: {
          pointId,
          sourceType: 'websocket',
          transform: (_raw: any) => {
            // 模拟货位状态更新
            const newGrids = JSON.parse(JSON.stringify(floorGrids))
            for (let f = 0; f < floors; f++) {
              for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                  const rand = Math.random()
                  if (rand < 0.3) newGrids[f][r][c].status = 'empty'
                  else if (rand < 0.6) newGrids[f][r][c].status = 'occupied'
                  else newGrids[f][r][c].status = 'reserved'
                }
              }
            }
            return { floorGrids: newGrids }
          },
        },
      }
    },
  },

  // ===== IoT 节点 =====
  {
    type: 'gauge-node', label: '仪表盘', icon: '📊',
    pointIdTemplate: 'sensor.temp',
    width: 200, height: 180,
    data: { title: '温度', unit: '°C', min: 0, max: 100, value: 50 },
    transform: (raw: any) => Math.round(raw * 10) / 10,
  },
  {
    type: 'chart-node', label: '折线图', icon: '📈',
    pointIdTemplate: 'sensor.chart',
    width: 260, height: 160,
    // 函数形式：确保每个节点获得全新的 history 数组
    data: () => ({ title: '实时曲线', history: Array(20).fill(0) }),
    transform: (raw: any) => Math.round(raw * 10) / 10,
  },
  {
    type: 'indicator-node', label: '指示灯', icon: '💡',
    pointIdTemplate: 'device.status',
    width: 130, height: 70,
    data: { label: '设备状态', status: 'off' },
    transform: (raw: any) => {
      // 将数值映射为状态字符串
      if (raw > 80) return 'on'
      if (raw > 50) return 'warning'
      if (raw > 20) return 'off'
      return 'error'
    },
  },

  // ===== 工作流节点（无数据绑定） =====
  {
    type: 'workflow-start', label: '开始节点', icon: '▶',
    width: 120, height: 50,
    data: { label: '开始' },
  },
  {
    type: 'workflow-end', label: '结束节点', icon: '■',
    width: 120, height: 50,
    data: { label: '结束' },
  },
  {
    type: 'condition-node', label: '条件判断', icon: '◇',
    width: 200, height: 120,
    data: () => ({
      label: '条件判断',
      branches: [
        { id: 'branch-1', label: '分支 1', expression: '${amount} > 10000' },
        { id: 'branch-2', label: '分支 2', expression: '${amount} <= 10000' },
      ],
    }),
  },
  {
    type: 'timer-node', label: '定时器', icon: '⏱',
    width: 180, height: 100,
    data: { label: '定时器', duration: 5, unit: 'seconds' },
  },
  {
    type: 'http-request-node', label: 'HTTP 请求', icon: '🌐',
    width: 280, height: 150,
    data: { label: 'HTTP 请求', method: 'GET', url: '', body: '', timeout: 30 },
  },
  {
    type: 'custom-code-node', label: '自定义代码', icon: '{ }',
    width: 280, height: 140,
    data: { label: '自定义代码', code: '// 编写你的代码\nreturn { next: null };' },
  },
]

/**
 * 根据模板构建 X6 节点配置
 *
 * 统一处理：尺寸设置、原生形状样式、pointId 生成、data 构建、数据绑定注入。
 *
 * @param item 节点模板
 * @param graph X6 Graph 实例（用于初始化 PointIdGenerator 的已用 ID 集合）
 * @returns 可直接传给 graph.createNode() 的配置对象
 */
export function buildNodeConfig(item: NodeTemplate, graph: Graph): Record<string, any> {
  const config: Record<string, any> = {
    shape: item.type,
    width: item.width,
    height: item.height,
  }

  // 原生形状（rect/circle）的样式与连接桩
  if (item.attrs) config.attrs = item.attrs(item.label)
  if (item.ports) config.ports = item.ports

  // 生成唯一数据点 ID（如模板配置了点ID）
  let pointId: string | null = null
  if (item.pointIdTemplate) {
    const generator = PointIdGenerator.getInstance()
    generator.initFromNodes(graph.getNodes())
    pointId = generator.generate(item.pointIdTemplate)
  }

  // 构建节点数据
  if (item.buildData && pointId) {
    // 复杂节点：完整自定义构建（含 binding）
    config.data = item.buildData(pointId)
  } else if (item.data || pointId) {
    // 常规节点：静态 data 深拷贝 / 函数 data 返回全新对象
    const baseData =
      typeof item.data === 'function'
        ? item.data(item)
        : item.data
          ? structuredClone(item.data)
          : {}
    config.data = { ...baseData }

    // 自动注入 pointId 与数据绑定
    if (pointId) {
      config.data.pointId = pointId
      config.data.binding = {
        pointId,
        sourceType: 'websocket',
        ...(item.transform ? { transform: item.transform } : {}),
      }
    }
  }

  return config
}
