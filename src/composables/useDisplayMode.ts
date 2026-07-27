import { computed } from 'vue'
import { useEditorStore } from '@/stores/editor'

/**
 * useDisplayMode - 节点显示模式 composable
 *
 * 供节点组件读取当前全局显示模式（图标模式 / 极简模式）。
 * 模式切换由工具栏触发 store.setDisplayMode()，所有节点组件自动响应。
 *
 * 模式语义：
 * - 'icon'（图标模式）：节点以紧凑图标卡片展示 → isMinimal = true
 * - 'full'（极简/默认模式）：节点完整渲染 → isMinimal = false
 *
 * @returns { displayMode, isMinimal }
 *
 * @example
 * const { isMinimal } = useDisplayMode()
 * // 模板中: <NodeMinimalView v-if="isMinimal" ... /> <div v-else>完整视图</div>
 */
export function useDisplayMode() {
  const editorStore = useEditorStore()

  const displayMode = computed(() => editorStore.displayMode)
  const isMinimal = computed(() => editorStore.displayMode === 'icon')

  return { displayMode, isMinimal }
}
