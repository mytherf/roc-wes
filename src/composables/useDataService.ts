// ========== 数据服务管理 Composable（数据绑定的“总调度”）==========
// 用途：把“节点绑定数据”这件事集中管理起来——
//   1. 按配置选择正确的数据服务（演示模式 IPC/WebSocket/HTTP/MQTT/SSE/工业协议 IPC）
//   2. 缓存服务实例（同一数据源只建一条连接，不重复浪费）
//   3. 订阅数据并把最新值写入节点 data.value（同时触发节点事件规则）
//   4. 清理：解绑节点时取消订阅，组件卸载时断开全部连接
// 什么是 Composable？Vue 3 中把可复用的逻辑抽成函数，名字以 use 开头。

import type { Graph, Node } from '@antv/x6'
import type { DataBindingConfig, IDataService } from '@/services/DataService'
import { WebSocketService } from '@/services/WebSocketService'
import { HttpPollingService } from '@/services/HttpPollingService'
import { SseService } from '@/services/SseService'
import { MqttService } from '@/services/MqttService'
import { IpcGatewayService } from '@/services/IpcGatewayService'
import { buildDeviceConfig, isDemoSource } from '@/platform/deviceConfig'
import { useDataSourceStore } from '@/stores/dataSource'
import { evaluateNodeEvents } from '@/services/NodeEventService'

/** 工业协议类型：WebView 无法直连（原生 TCP），统一走 Rust 原生网关（IPC） */
const INDUSTRIAL_TYPES = new Set(['s7', 'opc', 'modbus'])

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
 * - 具名数据服务：按 `${sourceType}:${sourceUrl}` 缓存，避免同一数据源重复创建连接。
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
  // 存储节点 ID → 数据点 ID 的映射，用于清理
  const nodeDataSubscriptions = new Map<string, string>()

  /**
   * 根据 sourceType 和 sourceUrl 获取或创建数据服务实例
   * - 无 sourceUrl：返回 null（未绑定数据源的节点不接收任何数据）
   * - 演示模式数据源与工业协议：Rust 原生网关（IPC）
   * - 其余真实地址：按类型路由到 WebSocket / HTTP 轮询 / SSE / MQTT 服务
   * - sourceConfig：协议特定的设备连接参数（如 Modbus 的 host/port/unitId），传给对应服务
   */
  function getDataService(sourceType: string, sourceUrl?: string, sourceConfig?: Record<string, any>): IDataService | null {
    if (!sourceUrl) {
      // 未绑定数据源 → 不提供任何数据服务（节点保持静态值）
      return null
    }
    const key = serviceKey(sourceType, sourceUrl, sourceConfig)
    if (!dataServiceMap.has(key)) {
      // 工业协议（S7 / OPC UA / Modbus）与所有演示模式数据源
      //（含 WebSocket / HTTP / SSE / MQTT）统一由 Rust 原生网关接管——
      // 演示数据由桌面端内置 DemoAdapter 生成（不依赖本地端口），
      // 工业设备由 Rust 原生 TCP 直连，前端经 invoke + event IPC 通信
      if (isDemoSource(sourceType, sourceUrl, sourceConfig) || INDUSTRIAL_TYPES.has(sourceType)) {
        const service = new IpcGatewayService(key, buildDeviceConfig(sourceType, sourceUrl, sourceConfig), sourceType.toUpperCase())
        dataServiceMap.set(key, service)
        return service
      }
      let service: IDataService | null = null
      switch (sourceType) {
        case 'websocket':
          service = new WebSocketService(sourceUrl)
          break
        case 'http':
          service = new HttpPollingService(sourceUrl, sourceConfig?.interval)
          break
        case 'sse':
          service = new SseService(sourceUrl)
          break
        case 'mqtt':
          service = new MqttService(sourceUrl)
          break
        // 工业协议（s7 / opc / modbus）已在上方统一路由到 IpcGatewayService，不会走到这里
        default:
          console.warn(`[useDataService] 不支持的数据源类型: ${sourceType}，不订阅数据`)
          return null
      }
      dataServiceMap.set(key, service)
    }
    return dataServiceMap.get(key)!
  }

  /** 生成数据服务缓存键：类型 + 地址 + 设备配置（区分同地址不同设备） */
  function serviceKey(sourceType: string, sourceUrl: string, sourceConfig?: Record<string, any>): string {
    const cfg = sourceConfig ? JSON.stringify(sourceConfig) : ''
    return `${sourceType}:${sourceUrl}:${cfg}`
  }

  /**
   * 解析数据绑定的转换函数（修复 transform 持久化 bug 的核心）。
   *
   * 背景：binding.transform 是 Function，无法被 JSON.stringify 序列化，
   * 保存工程（graph.toJSON）后会静默丢失。因此持久化依赖字符串字段 transformSource，
   * 运行期在订阅时按需编译为函数并缓存回 binding.transform。
   *
   * @returns 可用的转换函数；无配置或编译失败时返回 undefined
   */
  function resolveTransform(binding: DataBindingConfig): ((raw: any) => any) | undefined {
    if (typeof binding.transform === 'function') return binding.transform
    const src = binding.transformSource?.trim()
    if (!src) return undefined
    try {
      // transformSource 约定为箭头函数源码，参数固定为 raw
      const fn = new Function('raw', `return (${src})(raw)`) as (raw: any) => any
      binding.transform = fn // 缓存，避免每次数据更新重复编译
      return fn
    } catch (e) {
      console.warn(`[useDataService] 转换函数编译失败: ${src}`, e)
      return undefined
    }
  }

  /**
   * 为节点绑定数据源
   * 订阅成功后，数据点更新会自动写入 node.data.value（并附带 _timestamp / _quality）
   */
  function bindNodeData(node: Node) {
    const nodeData = node.getData()
    const binding = nodeData?.binding as DataBindingConfig | undefined
    if (!binding?.pointId) return

    // 先取消旧订阅（避免重复绑定）
    unbindNodeData(node.id)

    // 解析数据源：优先 sourceId（数据源管理实例），回退旧字段 sourceType/sourceUrl
    let sourceType = binding.sourceType
    let sourceUrl = binding.sourceUrl
    let sourceConfig: Record<string, any> | undefined
    if (binding.sourceId) {
      const ds = dataSourceStore.getDataSource(binding.sourceId)
      if (ds) {
        sourceType = ds.type
        sourceUrl = ds.url
        sourceConfig = ds.config
      } else {
        console.warn(`[useDataService] 未找到数据源实例: ${binding.sourceId}，不订阅数据`)
      }
    }

    // 未绑定数据源（无 sourceId 且无旧字段 sourceUrl）→ 不订阅，节点保持静态值
    if (!sourceUrl) {
      return
    }

    // 根据配置获取对应的数据服务
    const service = getDataService(sourceType ?? 'websocket', sourceUrl, sourceConfig)
    if (!service) {
      console.warn('[useDataService] 无法获取数据服务')
      return
    }

    // 记录该节点使用的服务 key（使用解析后的数据源类型、地址与配置，兼容 sourceId 方式）
    nodeServiceKeys.set(node.id, serviceKey(sourceType ?? 'websocket', sourceUrl, sourceConfig))

    // 解析转换函数（运行期 Function 优先，否则从持久化的 transformSource 编译）
    const transform = resolveTransform(binding)

    service.subscribe(binding.pointId, (point) => {
      const currentData = node.getData()
      let newValue = point.value
      if (transform) {
        newValue = transform(point.value)
      }
      const nextData = {
        ...currentData,
        value: newValue,
        _timestamp: point.timestamp,
        _quality: point.quality,
      }
      node.setData(nextData)
      // 评估节点数据变化事件（比较类条件上升沿触发，不会重复告警）
      evaluateNodeEvents(node.id, currentData, nextData)
    })

    nodeDataSubscriptions.set(node.id, binding.pointId)
  }

  /**
   * 若节点的 binding.pointId 与当前已订阅的点 ID 不一致，则重新绑定
   * 用于属性面板修改绑定配置后自动切换数据源（避免每次数据更新都重复订阅）
   */
  function rebindIfChanged(node: Node) {
    const data = node.getData()
    const currentPointId = nodeDataSubscriptions.get(node.id)
    const newPointId = data?.binding?.pointId
    if (currentPointId !== newPointId) {
      bindNodeData(node)
    }
  }

  /**
   * 取消节点的数据订阅
   */
  function unbindNodeData(nodeId: string) {
    if (nodeDataSubscriptions.has(nodeId)) {
      const pointId = nodeDataSubscriptions.get(nodeId)!
      const serviceKey = nodeServiceKeys.get(nodeId)
      if (serviceKey && dataServiceMap.has(serviceKey)) {
        dataServiceMap.get(serviceKey)!.unsubscribe(pointId)
      }
      nodeDataSubscriptions.delete(nodeId)
      nodeServiceKeys.delete(nodeId)
    }
  }

  /**
   * 为画布上所有配置了 binding.pointId 的节点绑定数据
   */
  function bindAllNodes(graph: Graph) {
    for (const node of graph.getNodes()) {
      const nodeData = node.getData()
      if (nodeData?.binding?.pointId) {
        bindNodeData(node)
      }
    }
  }

  /**
   * 取消所有节点的订阅（不断开服务连接，可在重新加载后再次绑定）
   */
  function unbindAllNodes() {
    for (const [nodeId, pointId] of nodeDataSubscriptions) {
      const serviceKey = nodeServiceKeys.get(nodeId)
      if (serviceKey && dataServiceMap.has(serviceKey)) {
        dataServiceMap.get(serviceKey)!.unsubscribe(pointId)
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
