// ========== 节点状态派生 Composable（节点“红绿灯”的统一计算）==========
// 所属层级：画布节点渲染层的基础工具，供所有节点组件使用
//
// 解决的问题：节点状态（idle 待机 / running 运行 / error 故障 / warning 警告等）
// 在每个组件里都要算两样东西——
//   1. statusClass：状态对应的 CSS 类名（如 status-running），决定颜色样式
//   2. statusText：状态对应的中文文案（如“运行中”），显示在界面上
// 本 composable 统一计算，9 个节点组件不再重复写这段逻辑。
//
// 用法：
//   const { statusClass, statusText } = useNodeStatus(statusRef)
//   // 支持自定义 CSS 前缀（如指示灯用 light-）与自定义文案映射

import { computed, type Ref } from 'vue'

export interface StatusOptions {
  /** CSS 类名前缀，默认 'status'，生成 status-idle / status-running 等 */
  prefix?: string
  /** 自定义状态→文案映射，会与默认映射合并 */
  labels?: Record<string, string>
}

const DEFAULT_LABELS: Record<string, string> = {
  idle: '待机',
  running: '运行中',
  error: '故障',
  warning: '警告',
  charging: '充电中',
  on: '开启',
  off: '关闭',
}

/**
 * useNodeStatus - 节点状态派生 composable
 *
 * 消除 9 个节点组件中重复的 statusClass / statusText 计算逻辑。
 *
 * @param status - 响应式状态值（来自 useNodeData 的 status 字段）
 * @param options - 可选配置：CSS 前缀、自定义文案
 * @returns { statusClass, statusText }
 *
 * @example
 * const { status } = useNodeData(props.node, { status: 'idle' })
 * const { statusClass, statusText } = useNodeStatus(status)
 *
 * // 自定义前缀（如指示灯用 light- 前缀）
 * const { statusClass } = useNodeStatus(status, { prefix: 'light' })
 */
export function useNodeStatus(status: Ref<string>, options: StatusOptions = {}) {
  const { prefix = 'status', labels = {} } = options
  const mergedLabels = { ...DEFAULT_LABELS, ...labels }

  const statusClass = computed(() => ({
    [`${prefix}-idle`]: status.value === 'idle',
    [`${prefix}-running`]: status.value === 'running',
    [`${prefix}-error`]: status.value === 'error',
    [`${prefix}-warning`]: status.value === 'warning',
    [`${prefix}-charging`]: status.value === 'charging',
    [`${prefix}-on`]: status.value === 'on',
    [`${prefix}-off`]: status.value === 'off',
  }))

  const statusText = computed(() => mergedLabels[status.value] || '未知')

  return { statusClass, statusText }
}
