/**
 * 节点数据变化事件服务
 *
 * 负责节点事件规则的定义、条件评估与动作执行。
 * 事件规则存储在 node.data.events 数组中，由属性面板「事件」标签页配置，
 * 在数据绑定更新写入节点后（useDataService 的订阅回调）自动评估并触发。
 *
 * 触发语义：
 * - 「值变化」条件：每次字段值发生变化都触发。
 * - 比较类条件（大于/小于/等于等）：上升沿触发——仅在从「不满足」变为「满足」时触发一次，
 *   避免数据持续越限时重复告警（类似 PLC 报警的边沿触发）。
 */

/** 事件触发条件类型 */
export type EventCondition = 'changed' | 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'

/** 事件动作类型 */
export type EventActionType = 'console' | 'alert' | 'http'

/** 节点事件规则（存储于 node.data.events） */
export interface NodeEventRule {
  /** 规则唯一 ID */
  id: string
  /** 是否启用 */
  enabled: boolean
  /** 规则名称（可选，用于日志与告警展示） */
  name: string
  /** 监听的数据字段（空字符串表示监听顶层 value 字段） */
  field: string
  /** 触发条件 */
  condition: EventCondition
  /** 阈值（比较类条件使用） */
  threshold: string
  /** 触发的动作类型 */
  actionType: EventActionType
  /** 告警内容（alert 动作） */
  message?: string
  /** HTTP 请求地址（http 动作） */
  url?: string
  /** HTTP 请求方法（http 动作） */
  method?: string
}

/**
 * 记录每条规则上一次的条件匹配状态（key: `${nodeId}:${ruleId}`），
 * 用于比较类条件的上升沿触发判断。
 */
const prevMatchState = new Map<string, boolean>()

/** 创建一条默认事件规则 */
export function createEventRule(): NodeEventRule {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    name: '',
    field: '',
    condition: 'changed',
    threshold: '',
    actionType: 'console',
    message: '',
    url: '',
    method: 'POST',
  }
}

/** 读取节点数据中指定字段的值（field 为空时取顶层 value） */
function getFieldValue(data: any, field: string): any {
  if (!data) return undefined
  if (!field) return data.value
  return data[field]
}

/** 判断单条规则的条件是否满足 */
function matchCondition(rule: NodeEventRule, oldVal: any, newVal: any): boolean {
  const threshold = Number(rule.threshold)
  switch (rule.condition) {
    case 'changed':
      return oldVal !== newVal
    case 'gt':
      return Number(newVal) > threshold
    case 'lt':
      return Number(newVal) < threshold
    case 'gte':
      return Number(newVal) >= threshold
    case 'lte':
      return Number(newVal) <= threshold
    case 'eq':
      return String(newVal) === String(rule.threshold)
    case 'neq':
      return String(newVal) !== String(rule.threshold)
    default:
      return false
  }
}

/** 执行规则配置的动作 */
function executeAction(rule: NodeEventRule, data: any, nodeId: string) {
  const value = getFieldValue(data, rule.field)
  const label = rule.name || rule.id
  switch (rule.actionType) {
    case 'console':
      console.log(`[节点事件] ${label} 触发（节点 ${nodeId}）`, {
        field: rule.field || 'value',
        value,
        condition: rule.condition,
        threshold: rule.threshold,
      })
      break
    case 'alert':
      window.alert(rule.message || `节点事件触发：${label}`)
      break
    case 'http':
      if (rule.url) {
        fetch(rule.url, {
          method: rule.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId,
            rule: label,
            field: rule.field || 'value',
            value,
            timestamp: Date.now(),
          }),
        }).catch((err) => console.warn('[节点事件] HTTP 请求失败:', err))
      } else {
        console.warn(`[节点事件] ${label} 未配置请求地址，跳过 HTTP 动作`)
      }
      break
  }
}

/**
 * 评估节点的全部事件规则（在节点数据更新后调用）
 *
 * @param nodeId  节点 ID
 * @param oldData 更新前的节点数据
 * @param newData 更新后的节点数据（含 events 规则）
 */
export function evaluateNodeEvents(nodeId: string, oldData: any, newData: any) {
  const rules = newData?.events
  if (!Array.isArray(rules) || rules.length === 0) return

  for (const rule of rules) {
    if (!rule || !rule.enabled) continue

    const oldVal = getFieldValue(oldData, rule.field)
    const newVal = getFieldValue(newData, rule.field)
    const matched = matchCondition(rule, oldVal, newVal)

    const stateKey = `${nodeId}:${rule.id}`
    const prev = prevMatchState.get(stateKey) || false
    prevMatchState.set(stateKey, matched)

    // 「值变化」每次变化触发；比较类条件仅上升沿触发
    const shouldFire = rule.condition === 'changed' ? matched : matched && !prev

    if (shouldFire) {
      try {
        executeAction(rule, newData, nodeId)
      } catch (e) {
        console.warn('[节点事件] 动作执行失败:', e)
      }
    }
  }
}
