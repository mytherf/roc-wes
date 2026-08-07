// ========== 路线 Store（AGV/穿梭车等移动设备的行驶路线管理）==========
// 什么是“路线”？
//   工业现场里 AGV 小车、穿梭车需要沿固定轨迹移动。路线就是一条轨迹：
//   由一串航点（points）组成，节点（如 AGV）通过 routeId 引用某条路线，
//   运行态动画服务会驱动节点沿路线移动。
// 本文件职责：路线的增删改查、分段配置（每段的速度/方向/停顿）、
// 导入导出，以及持久化（文件落盘：应用配置目录的 routes.json）。

import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { readJsonFile, writeJsonFile } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）

/**
 * 路线航点：路线上的一个关键点（路径的“拐弯处”或“站点”）
 */
export interface RouteWaypoint {
  x: number // 画布坐标 X
  y: number // 画布坐标 Y
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
 * 持久化：文件落盘（应用配置目录的 routes.json）。
 */
export const useRouteStore = defineStore('route', () => {
  const routes = ref<RouteDefinition[]>([])
  const STORAGE_FILE = 'routes.json'

  // 初始化：异步从文件加载
  // 加载时做了“数据兼容”：旧版本可能缺少 segments/smooth 等字段，逐一补齐默认值
  function loadFromStorage() {
    readJsonFile<any[]>(STORAGE_FILE).then(parsed => {
      if (!Array.isArray(parsed)) return
      routes.value = parsed.map((r: any) => ({
        ...r,
        segments: r.segments || [], // 没有分段配置就默认为空数组
        smooth: r.smooth ?? false, // 没有平滑开关就默认为关
        points: (r.points || []).map((p: any) => ({
          x: p.x,
          y: p.y,
          type: p.type || 'waypoint', // 航点类型默认普通航点
          stationName: p.stationName,
        })),
      }))
    }).catch(e => console.warn('[RouteStore] 加载路线数据失败:', e))
  }

  // 保存到文件（每次增删改后调用；内部异步写入，不阻塞调用方）
  function saveToStorage() {
    void writeJsonFile(STORAGE_FILE, toRaw(routes.value))
      .catch(e => console.warn('[RouteStore] 保存路线数据失败:', e))
  }

  // 启动时加载
  loadFromStorage()

  // ---------- 查询 ----------
  const routeList = computed(() => routes.value)

  function getRoute(id: string): RouteDefinition | undefined {
    return routes.value.find(r => r.id === id)
  }

  // ---------- 增删改 ----------
  /** 新建一条路线
   * @param name 路线名称
   * @param points 初始航点列表（可为空，稍后在编辑器里添加）
   * @returns 创建好的路线对象 */
  function createRoute(name: string, points: RouteWaypoint[] = []): RouteDefinition {
    // 生成唯一 id（时间戳 + 随机串）
    const route: RouteDefinition = {
      id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      points,
      segments: [], // 初始无分段配置
      speed: 80, // 默认移动速度 80px/s
      loop: true, // 默认循环行驶
      smooth: false, // 默认直线连接（不平滑）
    }
    routes.value.push(route)
    saveToStorage()
    return route
  }

  // 更新路线：按 id 找到目标，合并新属性（不可变方式）
  function updateRoute(id: string, updates: Partial<Omit<RouteDefinition, 'id'>>) {
    const idx = routes.value.findIndex(r => r.id === id)
    if (idx === -1) return
    routes.value[idx] = { ...routes.value[idx], ...updates }
    saveToStorage()
  }

  // 删除路线：按 id 过滤掉
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

  /** 确保 segments 数组长度与 points 匹配（增删航点后调用）
   * 分段数量规则：N 个航点之间有 N-1 段；若开启循环，首尾相连还会多 1 段 */
  function syncSegments(routeId: string) {
    const route = getRoute(routeId)
    if (!route) return
    // 计算应有的分段数
    const expectedLen = route.points.length > 1
      ? route.points.length - 1 + (route.loop ? 1 : 0)
      : 0
    const segments = [...route.segments]
    // 不够则用默认配置补足
    while (segments.length < expectedLen) {
      segments.push({ direction: 'forward' }) // 默认：正向通行
    }
    // 多余则截断
    segments.length = expectedLen
    updateRoute(routeId, { segments })
  }

  // ---------- 导入/导出 ----------

  /** 导出所有路线为 JSON 字符串 */
  function exportRoutes(): string {
    return JSON.stringify(routes.value, null, 2)
  }

  /** 从 JSON 字符串导入路线（合并，按 id 去重）
   * @param json 路线数组的 JSON 字符串
   * @returns { added: 成功导入数, skipped: 跳过数（格式错误或 id 重复） } */
  function importRoutes(json: string): { added: number; skipped: number } {
    const parsed: RouteDefinition[] = JSON.parse(json)
    if (!Array.isArray(parsed)) throw new Error('格式错误：需要路线数组')
    let added = 0, skipped = 0
    for (const r of parsed) {
      // 基础校验：没有 id 或没有 points 的条目跳过
      if (!r.id || !r.points) { skipped++; continue }
      // 与现有路线 id 冲突的条目跳过（防止覆盖已有数据）
      if (getRoute(r.id)) { skipped++; continue }
      // 规范化后加入列表
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
    return { added, skipped } // 返回统计结果，界面可提示用户
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
