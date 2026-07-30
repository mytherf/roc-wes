import type { Graph } from '@antv/x6'
import { MockDataService } from '@/services/MockDataService'
import type { DataBindingConfig, IDataService } from '@/services/DataService'
import { WebSocketService } from '@/services/WebSocketService'
import { HttpPollingService } from '@/services/HttpPollingService'
import { SseService } from '@/services/SseService'
import { MqttService } from '@/services/MqttService'
import { S7Service } from '@/services/S7Service'
import { OpcService } from '@/services/OpcService'
import { ModbusService } from '@/services/ModbusService'
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
 * - 默认数据服务：当 binding 未指定 sourceUrl 时使用的兜底服务（默认 MockDataService）。
 * - 具名数据服务：按 `${sourceType}:${sourceUrl}` 缓存，避免同一数据源重复创建连接。
 * - unbindAllNodes 仅取消订阅、不断开连接（支持重载后重新绑定）；
 *   dispose 才断开并清空全部服务（组件卸载时调用）。
 */
export function useDataService() {
  // 数据源管理 Store（用于按 sourceId 解析数据源实例）
  const dataSourceStore = useDataSourceStore()
  // 数据服务实例（根据 sourceType + sourceUrl 缓存）
  const dataServiceMap = new Map<string, IDataService>()
  // 默认数据服务（无 sourceUrl 时的兜底）
  let defaultDataService: IDataService | null = null
  // 存储节点 ID → 数据服务 key 的映射
  const nodeServiceKeys = new Map<string, string>()
  // 存储节点 ID → 数据点 ID 的映射，用于清理
  const nodeDataSubscriptions = new Map<string, string>()

  /**
   * 设置默认数据服务（无 sourceUrl 时的兜底）
   * 若不调用，首次获取时自动创建 MockDataService
   */
  function setDefaultService(service: IDataService) {
    defaultDataService = service
  }

  /**
   * 根据 sourceType 和 sourceUrl 获取或创建数据服务实例
   * - 无 sourceUrl：返回默认模拟服务（MockDataService）
   * - 有 sourceUrl：按类型路由到 WebSocket / HTTP 轮询 / SSE / MQTT 服务
   */
  function getDataService(sourceType: string, sourceUrl?: string): IDataService | null {
    if (!sourceUrl) {
      if (!defaultDataService) {
        defaultDataService = new MockDataService()
      }
      return defaultDataService
    }
    const key = `${sourceType}:${sourceUrl}`
    if (!dataServiceMap.has(key)) {
      let service: IDataService | null = null
      switch (sourceType) {
        case 'websocket':
          service = new WebSocketService(sourceUrl)
          break
        case 'http':
          service = new HttpPollingService(sourceUrl)
          break
        case 'sse':
          service = new SseService(sourceUrl)
          break
        case 'mqtt':
          service = new MqttService(sourceUrl)
          break
        case 's7':
          service = new S7Service(sourceUrl)
          break
        case 'opc':
          service = new OpcService(sourceUrl)
          break
        case 'modbus':
          service = new ModbusService(sourceUrl)
          break
        default:
          console.warn(`[useDataService] 不支持的数据源类型: ${sourceType}，回退为模拟数据`)
          if (!defaultDataService) {
            defaultDataService = new MockDataService()
          }
          return defaultDataService
      }
      dataServiceMap.set(key, service)
    }
    return dataServiceMap.get(key)!
  }

  /**
   * 为节点绑定数据源
   * 订阅成功后，数据点更新会自动写入 node.data.value（并附带 _timestamp / _quality）
   */
  function bindNodeData(node: any) {
    const nodeData = node.getData()
    const binding = nodeData?.binding as DataBindingConfig | undefined
    if (!binding?.pointId) return

    // 先取消旧订阅（避免重复绑定）
    unbindNodeData(node.id)

    // 解析数据源：优先 sourceId（数据源管理实例），回退旧字段 sourceType/sourceUrl，否则模拟数据
    let sourceType = binding.sourceType
    let sourceUrl = binding.sourceUrl
    if (binding.sourceId) {
      const ds = dataSourceStore.getDataSource(binding.sourceId)
      if (ds) {
        sourceType = ds.type
        sourceUrl = ds.url
      } else {
        console.warn(`[useDataService] 未找到数据源实例: ${binding.sourceId}，回退为模拟数据`)
      }
    }

    // 根据配置获取对应的数据服务
    const service = getDataService(sourceType ?? 'websocket', sourceUrl)
    if (!service) {
      console.warn('[useDataService] 无法获取数据服务')
      return
    }

    // 记录该节点使用的服务 key（使用解析后的数据源类型与地址，兼容 sourceId 方式）
    if (sourceUrl) {
      nodeServiceKeys.set(node.id, `${sourceType}:${sourceUrl}`)
    }

    service.subscribe(binding.pointId, (point) => {
      const currentData = node.getData()
      let newValue = point.value
      if (binding.transform) {
        newValue = binding.transform(point.value)
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
  function rebindIfChanged(node: any) {
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
      } else {
        defaultDataService?.unsubscribe(pointId)
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
      } else {
        defaultDataService?.unsubscribe(pointId)
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
    defaultDataService?.disconnect()
    defaultDataService = null
  }

  return {
    setDefaultService,
    getDataService,
    bindNodeData,
    rebindIfChanged,
    unbindNodeData,
    bindAllNodes,
    unbindAllNodes,
    dispose,
  }
}
