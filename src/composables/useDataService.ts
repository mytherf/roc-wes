// ========== 数据服务管理 Composable（数据绑定的“总调度”）==========
// 用途：把“节点绑定数据”这件事集中管理起来——
//   1. 所有数据源（含演示模式与全部协议）统一路由到 Rust 原生网关（IPC）
//   2. 缓存服务实例（同一数据源只建一条会话，不重复浪费）
//   3. 订阅数据并把最新值写入节点 data.value（同时触发节点事件规则）
//   4. 清理：解绑节点时取消订阅，组件卸载时断开全部会话
// 什么是 Composable？Vue 3 中把可复用的逻辑抽成函数，名字以 use 开头。

import type { Graph, Node } from '@antv/x6'
import type { DataBindingConfig, IDataService } from '@/services/DataService'
import { IpcGatewayService } from '@/services/IpcGatewayService'
import { buildDeviceConfig } from '@/platform/deviceConfig'
import { useDataSourceStore } from '@/stores/dataSource'
import { evaluateNodeEvents } from '@/services/NodeEventService'

/**
 * 数据服务管理 Composable
 *
 * 统一封装数据服务的创建、缓存、节点订阅绑定与清理逻辑。
 * 消除 X6Canvas.vue（编辑态）与 RunView.vue（运行态）中重复的
 * dataServiceMap / nodeDataSubscriptions / bindNodeData / unbindNodeData / unbindAllNodes 代码。
 *
 * 设计说明：
 * - 未绑定数据源（无 sourceId 且无旧字段 sourceUrl）的节点不订阅任何数据，保持静态值；
 *   演示/模拟数据须显式创建演示模式数据源并绑定。
 * - 全部协议（演示模式 + 全部真实模式）统一由
 *   Rust 原生网关接管，前端经 invoke + event IPC 通信，WebView 不再直连任何服务。
 * - 具名数据服务：按 `${sourceType}:${sourceUrl}` 缓存，避免同一数据源重复创建会话。
 * - unbindAllNodes 仅取消订阅、不断开连接（支持重载后重新绑定）；
 *   dispose 才断开并清空全部服务（组件卸载时调用）。
 */
export function useDataService() {
  // 数据源管理 Store（用于按 sourceId 解析数据源实例）
  const dataSourceStore = useDataSourceStore()
  // 数据服务实例（根据 sourceType + sourceUrl 缓存）
  const dataServiceMap = new Map<string, IDataService>()
  // 存储节点 ID → 数据服务 key 的映射
  const nodeServiceKeys = new Map<string, string>()
  // 存储节点 ID → 已订阅点 ID 列表的映射（多点绑定，用于清理）
  const nodeDataSubscriptions = new Map<string, string[]>()

  /**
   * 根据数据源配置获取或创建数据服务实例
   * - 全部协议统一路由到 Rust 原生网关（IPC）：演示模式由 DemoAdapter 生成模拟数据，
   *   真实模式由 Rust 原生客户端接管（Web 协议连接外部服务、Modbus/S7/OPC 原生 TCP 直连设备）
   * - 演示模式地址可为空；真实模式地址为空时返回 null（无法建连，节点保持静态值）
   * - sourceConfig：协议特定参数（如 HTTP 的 pollInterval / 演示标志），经 buildDeviceConfig 翻译给 Rust
   */
  function getDataService(sourceType: string, sourceUrl?: string, sourceConfig?: Record<string, any>): IDataService | null {
    if (!sourceUrl && sourceConfig?.demo !== true) {
      // 非演示模式且无地址 → 不提供任何数据服务（节点保持静态值）
      return null
    }
    const key = serviceKey(sourceType, sourceUrl, sourceConfig)
    if (!dataServiceMap.has(key)) {
      const service = new IpcGatewayService(key, buildDeviceConfig(sourceType, sourceUrl, sourceConfig), sourceType.toUpperCase())
      dataServiceMap.set(key, service)
    }
    return dataServiceMap.get(key)!
  }

  /** 生成数据服务缓存键：类型 + 地址 + 设备配置（区分同地址不同设备；演示模式地址可为空） */
  function serviceKey(sourceType: string, sourceUrl?: string, sourceConfig?: Record<string, any>): string {
    const cfg = sourceConfig ? JSON.stringify(sourceConfig) : ''
    return `${sourceType}:${sourceUrl ?? ''}:${cfg}`
  }

  /** 归一化后的绑定点：点 ID + 该点专属转换函数源码 */
  interface ResolvedBindingPoint {
    pointId: string
    transformSource?: string
  }

  /**
   * 归一化绑定点组列表：取 points（点 ID + 转换函数成组，去重去空）。
   * 返回列表首项即主点组（节点渲染值由它驱动）
   */
  function resolveBindingPoints(binding: DataBindingConfig): ResolvedBindingPoint[] {
    const seen = new Set<string>()
    const result: ResolvedBindingPoint[] = []
    ;(binding.points ?? []).forEach((entry) => {
      const pid = (entry?.pointId ?? '').trim()
      if (!pid || seen.has(pid)) return
      seen.add(pid)
      result.push({ pointId: pid, transformSource: entry.transformSource?.trim() || undefined })
    })
    return result
  }

  /** 编译转换函数源码为可调用函数（失败返回 undefined，不中断订阅） */
  function compileTransform(src?: string): ((raw: any) => any) | undefined {
    const s = src?.trim()
    if (!s) return undefined
    try {
      // 约定为箭头函数源码，参数固定为 raw
      return new Function('raw', `return (${s})(raw)`) as (raw: any) => any
    } catch (e) {
      console.warn(`[useDataService] 转换函数编译失败: ${s}`, e)
      return undefined
    }
  }

  /**
   * 为节点绑定数据源（支持多点组：每组 = 点 ID + 转换函数；points[0] 为主点组）
   * - 主点更新写入 node.data.value（并附带 _timestamp / _quality），驱动节点渲染
   * - 所有点（含主点）同步写入 node.data.values[pointId]，供详情/扩展使用
   *   （rawValue 为转换函数应用前的原始值，供详情弹窗对照展示）
   * - 每个点使用自己组内的转换函数
   */
  function bindNodeData(node: Node) {
    const nodeData = node.getData()
    const binding = nodeData?.binding as DataBindingConfig | undefined
    if (!binding) return

    // 归一化点组列表：为空则不订阅
    const points = resolveBindingPoints(binding)
    if (points.length === 0) return

    // 先取消旧订阅（避免重复绑定）
    unbindNodeData(node.id)

    // 解析数据源：仅通过 sourceId 引用「数据源管理」实例
    if (!binding.sourceId) return
    const ds = dataSourceStore.getDataSource(binding.sourceId)
    if (!ds) {
      console.warn(`[useDataService] 未找到数据源实例: ${binding.sourceId}，不订阅数据`)
      return
    }
    const sourceType = ds.type
    const sourceUrl = ds.url
    const sourceConfig = ds.config

    // 根据配置获取对应的数据服务
    const service = getDataService(sourceType, sourceUrl, sourceConfig)
    if (!service) {
      console.warn('[useDataService] 无法获取数据服务')
      return
    }

    // 记录该节点使用的服务 key（类型 + 地址 + 配置）
    nodeServiceKeys.set(node.id, serviceKey(sourceType, sourceUrl, sourceConfig))

    const primaryPointId = points[0].pointId
    for (const p of points) {
      // 每个点编译自己组内的转换函数
      const transform = compileTransform(p.transformSource)
      service.subscribe(p.pointId, (point) => {
        const currentData = node.getData()
        const prevValues = (currentData?.values || {}) as Record<string, any>
        // 每个点先应用自己组内的转换函数（每点独立转换），再写入 values
        const converted = transform ? transform(point.value) : point.value
        const nextData: Record<string, any> = {
          ...currentData,
          values: {
            ...prevValues,
            // rawValue：转换函数应用前的原始值（无转换函数时与 value 相同）
            [p.pointId]: { value: converted, rawValue: point.value, timestamp: point.timestamp, quality: point.quality },
          },
        }
        // 主点：转换后的值写入 data.value 驱动节点渲染（保持既有行为与事件评估）
        if (p.pointId === primaryPointId) {
          nextData.value = converted
          nextData._rawValue = point.value
          nextData._timestamp = point.timestamp
          nextData._quality = point.quality
        }
        node.setData(nextData)
        // 评估节点数据变化事件（比较类条件上升沿触发，不会重复告警）
        evaluateNodeEvents(node.id, currentData, nextData)
      })
    }

    nodeDataSubscriptions.set(node.id, points.map((p) => p.pointId))
  }

  /**
   * 若节点的绑定点列表与当前已订阅的点 ID 列表不一致，则重新绑定
   * 用于属性面板修改绑定配置后自动切换数据源（避免每次数据更新都重复订阅）
   */
  function rebindIfChanged(node: Node) {
    const data = node.getData()
    const currentKey = (nodeDataSubscriptions.get(node.id) || []).join('|')
    const binding = data?.binding as DataBindingConfig | undefined
    const newKey = binding && Array.isArray(binding.points) ? resolveBindingPoints(binding).map((p) => p.pointId).join('|') : ''
    if (currentKey !== newKey) {
      bindNodeData(node)
    }
  }

  /**
   * 取消节点的数据订阅（退订全部绑定点）
   */
  function unbindNodeData(nodeId: string) {
    if (nodeDataSubscriptions.has(nodeId)) {
      const pointIds = nodeDataSubscriptions.get(nodeId)!
      const serviceKey = nodeServiceKeys.get(nodeId)
      const service = serviceKey ? dataServiceMap.get(serviceKey) : undefined
      if (service) {
        for (const pid of pointIds) {
          service.unsubscribe(pid)
        }
      }
      nodeDataSubscriptions.delete(nodeId)
      nodeServiceKeys.delete(nodeId)
    }
  }

  /**
   * 为画布上所有配置了绑定点组的节点绑定数据
   */
  function bindAllNodes(graph: Graph) {
    for (const node of graph.getNodes()) {
      const nodeData = node.getData()
      if (nodeData?.binding?.points?.length) {
        bindNodeData(node)
      }
    }
  }

  /**
   * 取消所有节点的订阅（不断开服务连接，可在重新加载后再次绑定）
   */
  function unbindAllNodes() {
    for (const [nodeId, pointIds] of nodeDataSubscriptions) {
      const serviceKey = nodeServiceKeys.get(nodeId)
      const service = serviceKey ? dataServiceMap.get(serviceKey) : undefined
      if (service) {
        for (const pid of pointIds) {
          service.unsubscribe(pid)
        }
      }
    }
    nodeDataSubscriptions.clear()
    nodeServiceKeys.clear()
  }

  /**
   * 销毁：取消所有订阅并断开全部数据服务（组件卸载时调用）
   */
  function dispose() {
    unbindAllNodes()
    for (const [, service] of dataServiceMap) {
      service.disconnect()
    }
    dataServiceMap.clear()
  }

  return {
    getDataService,
    bindNodeData,
    rebindIfChanged,
    unbindNodeData,
    bindAllNodes,
    unbindAllNodes,
    dispose,
  }
}
