import { computed, type ComputedRef } from 'vue'
import { useNodeData } from './useNodeData'
import {
  clampIconSize,
  isImageIcon,
  resolveNodeIcon,
} from '@/components/nodes/nodeIcons'

export interface NodeIconState {
  /** 实际生效的图标（data.icon 优先，否则该形状的默认图标） */
  displayIcon: ComputedRef<string>
  /** 图标显示尺寸（px，已规范化到合法区间） */
  iconSize: ComputedRef<number>
  /** 是否为图片图标（data: URL） */
  isImage: ComputedRef<boolean>
}

/**
 * useNodeIcon - 节点图标数据 composable
 *
 * 从 X6 节点 data 中读取 icon / iconSize 字段并做兜底：
 * - icon 未设置 → 使用节点形状的默认图标
 * - iconSize 未设置/越界 → 规范化到 [14, 64]
 *
 * 基于 useNodeData 实现，自动响应 change:data 增量更新
 * （属性面板修改图标后节点立即重渲染）。
 *
 * @param node  X6 节点实例（props.node）
 * @param shape 节点形状名（用于查找默认图标，可传 node.shape）
 */
export function useNodeIcon(node: any, shape: string): NodeIconState {
  const { icon, iconSize } = useNodeData(node, {
    icon: '',
    iconSize: 0,
  })

  const displayIcon = computed(() => resolveNodeIcon(shape, icon.value || undefined))
  const size = computed(() => clampIconSize(iconSize.value || undefined))
  const isImage = computed(() => isImageIcon(displayIcon.value))

  return { displayIcon, iconSize: size, isImage }
}
