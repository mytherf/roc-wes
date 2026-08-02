import type { Graph, Node } from '@antv/x6'

/**
 * 路线航点
 */
export interface RouteWaypoint {
  x: number
  y: number
  type?: 'waypoint' | 'station'
  stationName?: string
}

/**
 * 分段配置
 */
export interface RouteSegmentConfig {
  speed?: number
  direction: 'forward' | 'backward' | 'both'
  action?: {
    dwell: number
    event?: string
  }
}

/**
 * 路线配置（存储在 node.data.route）
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
 * 单个节点的路线运动状态
 */
interface RouteMotionState {
  node: Node
  config: RouteConfig
  /** 当前所在线段索引（从 waypoint[i] → waypoint[i+1]） */
  segmentIndex: number
  /** 当前线段上的进度比例 0~1 */
  segmentProgress: number
  /** 上一帧时间戳 */
  lastTime: number
  /** 是否正在移动 */
  moving: boolean
  /** 站点停顿状态 */
  dwelling: boolean
  dwellUntil: number
}

/**
 * 路线运动服务
 *
 * 驱动 AGV 节点沿预设航点路线移动。
 * 支持：分段速度、贝塞尔平滑、站点停顿。
 * 使用单一 requestAnimationFrame 循环统一调度所有路线动画。
 */
export class RouteService {
  private graph: Graph
  private motions: Map<string, RouteMotionState> = new Map()
  private frameId: number | null = null
  /** 运动状态变化回调（用于更新节点 data.isMoving 等） */
  onStateChange?: (nodeId: string, moving: boolean, angle: number) => void
  /** 站点到达事件回调 */
  onStationArrive?: (nodeId: string, stationName: string, eventName?: string) => void

  constructor(graph: Graph) {
    this.graph = graph
  }

  /**
   * 启动路线运动
   */
  startRoute(nodeId: string, config: RouteConfig) {
    this.stopRoute(nodeId)

    if (config.points.length < 2) return

    const cell = this.graph.getCellById(nodeId)
    if (!cell?.isNode()) return

    const node = cell as Node

    // 将节点放到第一个航点位置
    const size = node.getSize()
    node.setPosition({
      x: config.points[0].x - size.width / 2,
      y: config.points[0].y - size.height / 2,
    })

    this.motions.set(nodeId, {
      node,
      config: { ...config, points: [...config.points], segments: config.segments ? [...config.segments] : [] },
      segmentIndex: 0,
      segmentProgress: 0,
      lastTime: performance.now(),
      moving: true,
      dwelling: false,
      dwellUntil: 0,
    })

    this.onStateChange?.(nodeId, true, this.calcAngle(config.points[0], config.points[1]))
    this.ensureLoop()
  }

  /**
   * 停止路线运动
   */
  stopRoute(nodeId: string) {
    const state = this.motions.get(nodeId)
    if (!state) return

    state.moving = false
    this.motions.delete(nodeId)
    this.onStateChange?.(nodeId, false, 0)

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

  private ensureLoop() {
    if (this.frameId !== null) return

    const tick = (now: number) => {
      for (const [nodeId, state] of this.motions) {
        this.updateMotion(nodeId, state, now)
      }
      if (this.motions.size > 0) {
        this.frameId = requestAnimationFrame(tick)
      } else {
        this.frameId = null
      }
    }
    this.frameId = requestAnimationFrame(tick)
  }

  private stopLoop() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
  }

  /**
   * 获取当前段的有效速度
   */
  private getSegmentSpeed(state: RouteMotionState): number {
    const seg = state.config.segments?.[state.segmentIndex]
    if (seg?.speed && seg.speed > 0) return seg.speed
    return state.config.speed
  }

  /**
   * 更新单个节点的路线运动（基于经过时间，与帧率无关）
   */
  private updateMotion(nodeId: string, state: RouteMotionState, now: number) {
    // 站点停顿中
    if (state.dwelling) {
      if (now < state.dwellUntil) return
      state.dwelling = false
    }

    const dt = (now - state.lastTime) / 1000 // 秒
    state.lastTime = now

    const { config } = state
    const { points } = config

    if (points.length < 2) {
      this.stopRoute(nodeId)
      return
    }

    // 当前线段
    const from = points[state.segmentIndex]
    const to = points[state.segmentIndex + 1] || (config.loop ? points[0] : undefined)
    if (!from || !to) {
      this.stopRoute(nodeId)
      return
    }

    const segLen = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
    if (segLen === 0) {
      this.advanceSegment(nodeId, state)
      return
    }

    // 使用分段速度
    const speed = this.getSegmentSpeed(state)
    const dist = speed * dt
    state.segmentProgress += dist / segLen

    // 如果超出当前线段，前进到下一段（可能跨多段）
    while (state.segmentProgress >= 1) {
      state.segmentProgress -= 1
      const advanced = this.advanceSegment(nodeId, state)
      if (!advanced) return
    }

    // 计算当前位置（贝塞尔或线性）
    const curFrom = points[state.segmentIndex]
    const curTo = points[state.segmentIndex + 1] || (config.loop ? points[0] : undefined)
    if (!curFrom || !curTo) return

    let x: number, y: number
    if (config.smooth) {
      const pos = this.bezierInterpolate(points, state.segmentIndex, state.segmentProgress, config.loop)
      x = pos.x
      y = pos.y
    } else {
      x = curFrom.x + (curTo.x - curFrom.x) * state.segmentProgress
      y = curFrom.y + (curTo.y - curFrom.y) * state.segmentProgress
    }

    // 更新节点位置（居中于航点路径）
    const size = state.node.getSize()
    state.node.setPosition({
      x: x - size.width / 2,
      y: y - size.height / 2,
    })

    // 通知方向角变化
    const angle = this.calcAngle(curFrom, curTo)
    this.onStateChange?.(nodeId, true, angle)
  }

  /**
   * 前进到下一线段，返回是否成功
   */
  private advanceSegment(nodeId: string, state: RouteMotionState): boolean {
    const { points, loop, segments } = state.config

    // 检查到达目标航点是否为站点 → 触发停顿
    const nextIdx = state.segmentIndex + 1
    const targetPoint = points[nextIdx] || (loop ? points[0] : undefined)
    if (targetPoint?.type === 'station') {
      const seg = segments?.[state.segmentIndex]
      const dwell = seg?.action?.dwell || 1000
      state.dwelling = true
      state.dwellUntil = performance.now() + dwell
      this.onStationArrive?.(nodeId, targetPoint.stationName || `站点${nextIdx + 1}`, seg?.action?.event)
    }

    if (nextIdx < points.length - 1) {
      state.segmentIndex++
      return true
    }

    if (loop) {
      state.segmentIndex = 0
      state.segmentProgress = 0
      return true
    }

    // 到达终点，停止
    this.stopRoute(nodeId)
    return false
  }

  /**
   * 贝塞尔曲线插值（Catmull-Rom → Cubic Bezier）
   * 使用相邻4个控制点生成平滑曲线
   */
  private bezierInterpolate(
    points: RouteWaypoint[],
    segIndex: number,
    t: number,
    loop: boolean
  ): { x: number; y: number } {
    const n = points.length
    const getPoint = (i: number): RouteWaypoint => {
      if (loop) return points[((i % n) + n) % n]
      return points[Math.max(0, Math.min(n - 1, i))]
    }

    const p0 = getPoint(segIndex - 1)
    const p1 = getPoint(segIndex)
    const p2 = getPoint(segIndex + 1)
    const p3 = getPoint(segIndex + 2)

    // Catmull-Rom to Bezier conversion (tension = 0.5)
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    // Cubic bezier at parameter t
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
   */
  private calcAngle(from: RouteWaypoint, to: RouteWaypoint): number {
    return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
  }
}
