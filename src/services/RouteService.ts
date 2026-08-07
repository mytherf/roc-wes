// ========== 路线运动服务（驱动节点沿路线移动）==========
// 用途：让 AGV/穿梭车等节点在画布上沿“路线编辑器”配置的航点路径移动，
// 支持分段速度、站点停顿、循环行驶、贝塞尔平滑曲线。
// 实现：与 AnimationService 一样，用单条 requestAnimationFrame 循环
// 统一驱动所有节点的运动，每帧按“经过时间 × 速度”计算新位置。

import type { Graph, Node } from '@antv/x6'

/**
 * 路线航点：路线上的一个关键点
 */
export interface RouteWaypoint {
  x: number // 画布坐标 X
  y: number // 画布坐标 Y
  type?: 'waypoint' | 'station' // 普通航点 or 站点（站点会停顿）
  stationName?: string // 站点名称
}

/**
 * 分段配置：两个相邻航点之间的属性
 */
export interface RouteSegmentConfig {
  speed?: number // 该段速度覆盖（不设则用路线默认速度）
  direction: 'forward' | 'backward' | 'both' // 通行方向
  action?: {
    dwell: number // 到达该段终点时的停顿时长（毫秒）
    event?: string // 触发的节点事件名
  }
}

/**
 * 路线配置（存储在 node.data.route，由路线编辑器生成）
 */
export interface RouteConfig {
  /** 航点列表（画布绝对坐标） */
  points: RouteWaypoint[]
  /** 分段配置 */
  segments?: RouteSegmentConfig[]
  /** 移动速度（像素/秒） */
  speed: number
  /** 是否循环 */
  loop: boolean
  /** 是否贝塞尔平滑 */
  smooth?: boolean
}

/**
 * 单个节点的路线运动状态（动画循环的内部数据结构）
 */
interface RouteMotionState {
  node: Node // 正在移动的 X6 节点
  config: RouteConfig // 该节点使用的路线配置
  /** 当前所在线段索引（从 waypoint[i] → waypoint[i+1]） */
  segmentIndex: number
  /** 当前线段上的进度比例 0~1 */
  segmentProgress: number
  /** 上一帧时间戳（用于计算每帧移动距离） */
  lastTime: number
  /** 是否正在移动 */
  moving: boolean
  /** 站点停顿状态 */
  dwelling: boolean // 是否正在站点停顿中
  dwellUntil: number // 停顿结束的时间戳
}

/**
 * 路线运动服务
 *
 * 驱动 AGV 节点沿预设航点路线移动。
 * 支持：分段速度、贝塞尔平滑、站点停顿。
 * 使用单一 requestAnimationFrame 循环统一调度所有路线动画。
 */
export class RouteService {
  private graph: Graph // X6 画布实例
  private motions: Map<string, RouteMotionState> = new Map() // nodeId → 运动状态
  private frameId: number | null = null // 动画帧循环 ID
  /** 运动状态变化回调（用于更新节点 data.isMoving 等） */
  onStateChange?: (nodeId: string, moving: boolean, angle: number) => void
  /** 站点到达事件回调 */
  onStationArrive?: (nodeId: string, stationName: string, eventName?: string) => void

  constructor(graph: Graph) {
    this.graph = graph
  }

  /**
   * 启动路线运动：把节点放到第一个航点，然后开始沿路径移动
   * @param nodeId 节点 ID
   * @param config 路线配置
   */
  startRoute(nodeId: string, config: RouteConfig) {
    this.stopRoute(nodeId) // 先停掉旧的运动（重复启动时避免冲突）

    if (config.points.length < 2) return // 至少需要 2 个航点才能移动

    const cell = this.graph.getCellById(nodeId)
    if (!cell?.isNode()) return // 不是节点则忽略

    const node = cell as Node

    // 将节点放到第一个航点位置（按节点中心对齐，所以减半宽高）
    const size = node.getSize()
    node.setPosition({
      x: config.points[0].x - size.width / 2,
      y: config.points[0].y - size.height / 2,
    })

    // 登记运动状态（浅拷贝配置，避免外部修改影响运行中数据）
    this.motions.set(nodeId, {
      node,
      config: { ...config, points: [...config.points], segments: config.segments ? [...config.segments] : [] },
      segmentIndex: 0, // 从第 0 段开始
      segmentProgress: 0, // 段内进度从 0 开始
      lastTime: performance.now(),
      moving: true,
      dwelling: false,
      dwellUntil: 0,
    })

    // 通知外部：开始移动 + 初始朝向角（沿第一段方向）
    this.onStateChange?.(nodeId, true, this.calcAngle(config.points[0], config.points[1]))
    this.ensureLoop() // 确保动画循环在运行
  }

  /**
   * 停止路线运动
   */
  stopRoute(nodeId: string) {
    const state = this.motions.get(nodeId)
    if (!state) return

    state.moving = false
    this.motions.delete(nodeId)
    this.onStateChange?.(nodeId, false, 0) // 通知外部：停止移动

    // 没有运动中的节点时停止循环，节省资源
    if (this.motions.size === 0) {
      this.stopLoop()
    }
  }

  /**
   * 停止所有路线运动
   */
  stopAll() {
    for (const [nodeId, state] of this.motions) {
      state.moving = false
      this.onStateChange?.(nodeId, false, 0)
    }
    this.motions.clear()
    this.stopLoop()
  }

  /**
   * 调整速度（像素/秒）
   * @param nodeId 节点 ID
   * @param speed 新速度（最小值限制 10，防止除零/倒退）
   */
  setSpeed(nodeId: string, speed: number) {
    const state = this.motions.get(nodeId)
    if (state) {
      state.config.speed = Math.max(10, speed)
    }
  }

  /**
   * 查询节点是否正在沿路线移动
   */
  isMoving(nodeId: string): boolean {
    return this.motions.has(nodeId)
  }

  /**
   * 销毁服务
   */
  dispose() {
    this.stopAll()
  }

  // ===================== 内部实现 =====================

  // 确保动画循环运行中（只有存在运动节点时才运行）
  private ensureLoop() {
    if (this.frameId !== null) return

    const tick = (now: number) => {
      for (const [nodeId, state] of this.motions) {
        this.updateMotion(nodeId, state, now) // 更新每个节点的位置
      }
      if (this.motions.size > 0) {
        this.frameId = requestAnimationFrame(tick) // 还有节点在动 → 下一帧继续
      } else {
        this.frameId = null
      }
    }
    this.frameId = requestAnimationFrame(tick)
  }

  // 停止动画循环
  private stopLoop() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
  }

  /**
   * 获取当前段的有效速度（优先分段配置，其次路线默认）
   */
  private getSegmentSpeed(state: RouteMotionState): number {
    const seg = state.config.segments?.[state.segmentIndex]
    if (seg?.speed && seg.speed > 0) return seg.speed
    return state.config.speed
  }

  /**
   * 更新单个节点的路线运动（基于经过时间，与帧率无关）
   * 每帧调用一次：计算时间增量 → 按速度推进进度 → 更新节点坐标
   */
  private updateMotion(nodeId: string, state: RouteMotionState, now: number) {
    // 站点停顿中：没到停顿结束时间就原地等待
    if (state.dwelling) {
      if (now < state.dwellUntil) return
      state.dwelling = false // 停顿结束，继续移动
    }

    const dt = (now - state.lastTime) / 1000 // 距上一帧的时间（秒）
    state.lastTime = now

    const { config } = state
    const { points } = config

    if (points.length < 2) {
      this.stopRoute(nodeId)
      return
    }

    // 当前线段：from 是当前航点，to 是下一个航点（循环时最后一段回到起点）
    const from = points[state.segmentIndex]
    const to = points[state.segmentIndex + 1] || (config.loop ? points[0] : undefined)
    if (!from || !to) {
      this.stopRoute(nodeId) // 没有下一段且不循环 → 停止
      return
    }

    // 计算线段长度（两点间距离，勾股定理）
    const segLen = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
    if (segLen === 0) {
      // 两点重合：跳过这一小段直接前进
      this.advanceSegment(nodeId, state)
      return
    }

    // 使用分段速度：本帧移动距离 = 速度 × 时间差，换算成段内进度增量
    const speed = this.getSegmentSpeed(state)
    const dist = speed * dt
    state.segmentProgress += dist / segLen

    // 如果超出当前线段，前进到下一段（可能跨多段）
    while (state.segmentProgress >= 1) {
      state.segmentProgress -= 1
      const advanced = this.advanceSegment(nodeId, state)
      if (!advanced) return // 已停止则结束
    }

    // 计算当前位置（贝塞尔或线性）
    const curFrom = points[state.segmentIndex]
    const curTo = points[state.segmentIndex + 1] || (config.loop ? points[0] : undefined)
    if (!curFrom || !curTo) return

    let x: number, y: number
    if (config.smooth) {
      // 平滑模式：用周围 4 个航点做贝塞尔曲线插值，路径圆滑
      const pos = this.bezierInterpolate(points, state.segmentIndex, state.segmentProgress, config.loop)
      x = pos.x
      y = pos.y
    } else {
      // 直线模式：在当前线段上按进度比例线性插值
      x = curFrom.x + (curTo.x - curFrom.x) * state.segmentProgress
      y = curFrom.y + (curTo.y - curFrom.y) * state.segmentProgress
    }

    // 更新节点位置（居中于航点路径）
    const size = state.node.getSize()
    state.node.setPosition({
      x: x - size.width / 2,
      y: y - size.height / 2,
    })

    // 通知方向角变化（供节点旋转到行进方向）
    const angle = this.calcAngle(curFrom, curTo)
    this.onStateChange?.(nodeId, true, angle)
  }

  /**
   * 前进到下一线段，返回是否成功
   * 到达站点时触发停顿；到达终点（非循环）时停止运动
   */
  private advanceSegment(nodeId: string, state: RouteMotionState): boolean {
    const { points, loop, segments } = state.config

    // 检查到达目标航点是否为站点 → 触发停顿
    const nextIdx = state.segmentIndex + 1
    const targetPoint = points[nextIdx] || (loop ? points[0] : undefined)
    if (targetPoint?.type === 'station') {
      // 站点停顿：读取该段配置的停顿时长（默认 1 秒）
      const seg = segments?.[state.segmentIndex]
      const dwell = seg?.action?.dwell || 1000
      state.dwelling = true
      state.dwellUntil = performance.now() + dwell
      // 通知外部“到达站点”（可触发装卸货等事件）
      this.onStationArrive?.(nodeId, targetPoint.stationName || `站点${nextIdx + 1}`, seg?.action?.event)
    }

    // 不是最后一段 → 移动到下一段
    if (nextIdx < points.length - 1) {
      state.segmentIndex++
      return true
    }

    // 最后一段且开启循环 → 回到第 0 段重新开始
    if (loop) {
      state.segmentIndex = 0
      state.segmentProgress = 0
      return true
    }

    // 到达终点且不循环 → 停止
    this.stopRoute(nodeId)
    return false
  }

  /**
   * 贝塞尔曲线插值（Catmull-Rom → Cubic Bezier）
   * 使用相邻4个控制点生成平滑曲线
   * 原理：先用 Catmull-Rom 样条穿过所有航点（保证曲线经过航点），
   *       再转换成等价的立方贝塞尔形式，方便用参数 t 求值。
   */
  private bezierInterpolate(
    points: RouteWaypoint[],
    segIndex: number,
    t: number,
    loop: boolean
  ): { x: number; y: number } {
    const n = points.length
    // 取点辅助：循环模式用取模环绕；非循环模式夹在 0~n-1 边界（两端重复用端点）
    const getPoint = (i: number): RouteWaypoint => {
      if (loop) return points[((i % n) + n) % n]
      return points[Math.max(0, Math.min(n - 1, i))]
    }

    // 取当前段前后各 2 个控制点（共 4 个）
    const p0 = getPoint(segIndex - 1)
    const p1 = getPoint(segIndex)
    const p2 = getPoint(segIndex + 1)
    const p3 = getPoint(segIndex + 2)

    // Catmull-Rom to Bezier conversion (tension = 0.5)
    // 把 Catmull-Rom 样条的控制点换算成贝塞尔曲线控制点
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    // Cubic bezier at parameter t
    // 三次贝塞尔公式：B(t) = (1-t)³·P1 + 3(1-t)²t·CP1 + 3(1-t)t²·CP2 + t³·P2
    const mt = 1 - t
    const mt2 = mt * mt
    const mt3 = mt2 * mt
    const t2 = t * t
    const t3 = t2 * t

    return {
      x: mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x,
      y: mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y,
    }
  }

  /**
   * 计算两点之间的角度（度）
   * atan2 返回弧度，这里换算成角度（0°=右，90°=下，兼容画布坐标系）
   */
  private calcAngle(from: RouteWaypoint, to: RouteWaypoint): number {
    return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
  }
}
