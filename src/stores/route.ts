import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 路线航点
 */
export interface RouteWaypoint {
  x: number
  y: number
  /** 航点类型：普通航点 or 站点（站点可配置停顿/事件） */
  type?: 'waypoint' | 'station'
  /** 站点名称（type === 'station' 时有效） */
  stationName?: string
}

/**
 * 分段配置（两个相邻航点之间的属性）
 */
export interface RouteSegment {
  /** 该段速度覆盖（不设则用路线默认 speed） */
  speed?: number
  /** 通行方向 */
  direction: 'forward' | 'backward' | 'both'
  /** 到达 to 点时的动作 */
  action?: {
    /** 停顿时长（ms） */
    dwell: number
    /** 触发事件名 */
    event?: string
  }
}

/**
 * 路线定义（独立实体，可被多个节点复用）
 */
export interface RouteDefinition {
  id: string
  name: string
  points: RouteWaypoint[]
  /** 分段配置（长度 = points.length - 1，循环时多一段首尾相连） */
  segments: RouteSegment[]
  /** 默认速度（px/s） */
  speed: number
  /** 是否循环 */
  loop: boolean
  /** 是否贝塞尔平滑 */
  smooth: boolean
}

/**
 * 路线 Store
 *
 * 管理独立的路线实体，与节点解耦。
 * 节点通过 routeId 引用路线，路线可被多个节点复用。
 * 持久化到 localStorage。
 */
export const useRouteStore = defineStore('route', () => {
  const routes = ref<RouteDefinition[]>([])
  const STORAGE_KEY = 'roc-wes-routes'

  // 初始化：从 localStorage 加载
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // 兼容旧格式：补充 segments / smooth 字段
        routes.value = parsed.map((r: any) => ({
          ...r,
          segments: r.segments || [],
          smooth: r.smooth ?? false,
          points: (r.points || []).map((p: any) => ({
            x: p.x,
            y: p.y,
            type: p.type || 'waypoint',
            stationName: p.stationName,
          })),
        }))
      }
    } catch (e) {
      console.warn('[RouteStore] 加载路线数据失败:', e)
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(routes.value))
    } catch (e) {
      console.warn('[RouteStore] 保存路线数据失败:', e)
    }
  }

  // 启动时加载
  loadFromStorage()

  // ---------- 查询 ----------
  const routeList = computed(() => routes.value)

  function getRoute(id: string): RouteDefinition | undefined {
    return routes.value.find(r => r.id === id)
  }

  // ---------- 增删改 ----------
  function createRoute(name: string, points: RouteWaypoint[] = []): RouteDefinition {
    const route: RouteDefinition = {
      id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      points,
      segments: [],
      speed: 80,
      loop: true,
      smooth: false,
    }
    routes.value.push(route)
    saveToStorage()
    return route
  }

  function updateRoute(id: string, updates: Partial<Omit<RouteDefinition, 'id'>>) {
    const idx = routes.value.findIndex(r => r.id === id)
    if (idx === -1) return
    routes.value[idx] = { ...routes.value[idx], ...updates }
    saveToStorage()
  }

  function deleteRoute(id: string) {
    routes.value = routes.value.filter(r => r.id !== id)
    saveToStorage()
  }

  // ---------- 分段管理 ----------

  /** 获取指定段的配置（不存在则返回默认值） */
  function getSegment(routeId: string, segIndex: number): RouteSegment {
    const route = getRoute(routeId)
    if (!route) return { direction: 'forward' }
    return route.segments[segIndex] || { direction: 'forward' }
  }

  /** 更新指定段的配置 */
  function updateSegment(routeId: string, segIndex: number, seg: Partial<RouteSegment>) {
    const route = getRoute(routeId)
    if (!route) return
    const segments = [...route.segments]
    segments[segIndex] = { ...(segments[segIndex] || { direction: 'forward' }), ...seg }
    updateRoute(routeId, { segments })
  }

  /** 确保 segments 数组长度与 points 匹配（增删航点后调用） */
  function syncSegments(routeId: string) {
    const route = getRoute(routeId)
    if (!route) return
    const expectedLen = route.points.length > 1
      ? route.points.length - 1 + (route.loop ? 1 : 0)
      : 0
    const segments = [...route.segments]
    while (segments.length < expectedLen) {
      segments.push({ direction: 'forward' })
    }
    segments.length = expectedLen
    updateRoute(routeId, { segments })
  }

  // ---------- 导入/导出 ----------

  /** 导出所有路线为 JSON 字符串 */
  function exportRoutes(): string {
    return JSON.stringify(routes.value, null, 2)
  }

  /** 从 JSON 字符串导入路线（合并，按 id 去重） */
  function importRoutes(json: string): { added: number; skipped: number } {
    const parsed: RouteDefinition[] = JSON.parse(json)
    if (!Array.isArray(parsed)) throw new Error('格式错误：需要路线数组')
    let added = 0, skipped = 0
    for (const r of parsed) {
      if (!r.id || !r.points) { skipped++; continue }
      if (getRoute(r.id)) { skipped++; continue }
      routes.value.push({
        ...r,
        segments: r.segments || [],
        smooth: r.smooth ?? false,
        points: (r.points || []).map((p: any) => ({
          x: p.x, y: p.y,
          type: p.type || 'waypoint',
          stationName: p.stationName,
        })),
      })
      added++
    }
    saveToStorage()
    return { added, skipped }
  }

  return {
    routes: routeList,
    getRoute,
    createRoute,
    updateRoute,
    deleteRoute,
    getSegment,
    updateSegment,
    syncSegments,
    exportRoutes,
    importRoutes,
    saveToStorage,
  }
})
