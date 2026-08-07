// ========== 显示模式 Composable（节点「图标模式 / 完整模式」切换）==========
// 所属层级：画布节点渲染层的基础工具，供所有节点组件与 NodeMinimalView 使用
//
// 用途：
//   1. 无参数调用 → 读取全局显示模式（由工具栏切换，存在 editorStore.displayMode）
//   2. 传入 node 调用 → 优先读取节点级 data.displayMode 覆盖，未设置时回退到全局
//
// 模式语义：
//   - 'icon'（图标模式）：节点只渲染一个图标，画面更简洁 → isMinimal = true
//   - 'full'（完整模式）：节点完整渲染（名称、状态、数值等）→ isMinimal = false
//
// 节点级覆盖通过右键菜单设置 node.data.displayMode = 'icon' | 'full' 实现，
// 设为 undefined 表示跟随全局。监听 change:data 事件实时同步覆盖值。

import { computed, ref, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import type { DisplayMode } from '@/stores/editor'

/**
 * useDisplayMode - 节点显示模式 composable
 *
 * 支持两种用法：
 * 1. 无参数：读取全局显示模式（工具栏切换），向后兼容
 * 2. 传入 node：优先读取节点级 data.displayMode 覆盖，未设置时回退到全局
 *
 * 模式语义：
 * - 'icon'（图标模式）：节点仅渲染图标（纯图标视图）→ isMinimal = true
 * - 'full'（完整/极简模式）：节点完整渲染 → isMinimal = false
 *
 * 节点级覆盖通过右键菜单设置 node.data.displayMode = 'icon' | 'full'，
 * 设为 undefined 则表示跟随全局。
 *
 * @param node - 可选，X6 节点实例（props.node）
 * @returns { displayMode, isMinimal }
 *
 * @example
 * const { isMinimal } = useDisplayMode(props.node)
 * // 模板中: <NodeMinimalView v-if="isMinimal" ... /> <div v-else>完整视图</div>
 */
export function useDisplayMode(node?: any) {
  const editorStore = useEditorStore()

  if (!node) {
    // 无节点参数：纯全局模式（向后兼容）
    const displayMode = computed<DisplayMode>(() => editorStore.displayMode)
    const isMinimal = computed(() => editorStore.displayMode === 'icon')
    return { displayMode, isMinimal }
  }

  // 有节点参数：优先读取节点级覆盖
  const nodeMode = ref<DisplayMode | undefined>(node.getData()?.displayMode)

  const handler = () => {
    const data = node.getData?.()
    nodeMode.value = data?.displayMode
  }
  node.on('change:data', handler)
  onBeforeUnmount(() => {
    node.off('change:data', handler)
  })

  // 有效模式 = 节点覆盖 ?? 全局
  const displayMode = computed<DisplayMode>(() => nodeMode.value ?? editorStore.displayMode)
  const isMinimal = computed(() => displayMode.value === 'icon')

  return { displayMode, isMinimal }
}
