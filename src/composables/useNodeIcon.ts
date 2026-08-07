// ========== 节点图标数据 Composable（节点“脸面”的取数器）==========
// 所属层级：画布节点渲染层的基础工具，供所有节点组件与 NodeIcon 使用
//
// 解决的问题：节点图标有三个细节需要统一处理——
//   1. 兜底：节点没设置图标时，用该形状的默认图标（resolveNodeIcon）
//   2. 尺寸规范：iconSize 越界时夹到合法区间 [14, 64]（clampIconSize）
//   3. 类型判断：判断图标是不是图片（data: URL），以便用 <img> 渲染
//
// 基于 useNodeData 实现，属性面板修改图标后节点立即重渲染。

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
