// ========== 节点事件规则编辑 Composable（节点“条件动作”编辑器）==========
// 所属层级：属性面板配套逻辑，从 PropertyPanel.vue 抽取而来
//
// 背景：SCADA 系统里节点可以配置“事件规则”——
// 比如“当温度超过 80 时，指示灯变红”。规则被存在节点 data.events 数组里，
// 运行时由 NodeEventService 执行。本文件负责这些规则的「编辑」部分：
//
//   1. 加载：选中节点变化时，把该节点已配置的规则读入草稿（eventsDraft）
//   2. 编辑：在属性面板里增删规则条目（addEventRule / removeEventRule）
//   3. 提交：草稿变化时自动写回 X6 节点和 Store（无变化则跳过，避免多余写入）
//
// 为什么用“草稿”模式：边改边提交会频繁触发画布同步，
// 草稿 + 深监听的方式保证只在内容真正变化时才提交一次。

import { ref, watch, type Ref } from 'vue'
import type { Graph } from '@antv/x6'
import { useEditorStore } from '@/stores/editor'
import { createEventRule, type NodeEventRule } from '@/services/NodeEventService'

/**
 * 节点事件规则编辑逻辑（从 PropertyPanel.vue 抽取）
 *
 * 负责事件规则草稿的加载、提交与增删，以及相关 watcher：
 * - 选中节点变化 → 重置标签页并重新加载该节点的事件规则；
 * - 草稿变化 → 提交到 X6 节点与 store（无变化时跳过，避免画布重载）。
 *
 * @param getGraph 获取 X6 Graph 实例的函数（来自 PropertyPanel 的 canvasRef）
 * @param activeTab 属性面板当前标签页（切换节点时重置为 'basic'）
 */
export function useNodeEvents(getGraph: () => Graph | null, activeTab: Ref<string>) {
  const editorStore = useEditorStore()

  /** 事件规则草稿（编辑后统一提交到 store 与 X6 节点） */
  const eventsDraft = ref<NodeEventRule[]>([])

  /** 从 X6 节点加载事件规则（以节点数据为准） */
  function loadEventsFromNode(nodeId: string | null) {
    if (!nodeId) {
      eventsDraft.value = []
      return
    }
    const graph = getGraph()
    const node = graph?.getCellById(nodeId)
    const data = node && node.isNode() ? node.getData() : null
    const evs = data?.events
    eventsDraft.value = Array.isArray(evs) ? JSON.parse(JSON.stringify(evs)) : []
  }

  /** 将事件规则提交到 X6 节点与 store（无变化时跳过，避免加载时冗余写入触发画布重载） */
  function commitEvents() {
    const element = editorStore.selectedElement
    if (!element || element.type !== 'node') return
    const nodeId = element.data.id
    const graph = getGraph()
    const node = graph?.getCellById(nodeId)
    if (!node || !node.isNode()) return

    const events = JSON.parse(JSON.stringify(eventsDraft.value)) as NodeEventRule[]
    const nextEvents = events.length ? events : undefined
    const currentEvents = node.getData()?.events

    // 无变化则跳过（含「加载后未编辑」的场景）
    if (JSON.stringify(currentEvents ?? null) === JSON.stringify(nextEvents ?? null)) return

    // 先更新 X6 节点再更新 store（两者同步完成，同步 watcher 不会误判为数据变化）
    // updateData = 顶层整体替换（deep:false）：不能用默认深合并——events 是数组，
    // lodash.merge 按下标合并会残留已删除的规则，且 undefined 被跳过导致规则清不空
    node.updateData({ events: nextEvents })
    const storeNode = editorStore.graphData.nodes.find((n) => n.id === nodeId)
    if (storeNode) {
      editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), events: nextEvents } })
    }
  }

  /** 添加事件规则（field 统一为绑定点ID，默认监听传入的点） */
  function addEventRule(defaultField = '') {
    eventsDraft.value.push(createEventRule(defaultField))
  }

  /** 删除事件规则 */
  function removeEventRule(index: number) {
    eventsDraft.value.splice(index, 1)
  }

  // 选中节点变化时：重置标签页并重新加载事件规则
  watch(
    () => editorStore.selectedId,
    (newId) => {
      activeTab.value = 'basic'
      loadEventsFromNode(newId)
    },
    { immediate: true }
  )

  // 事件草稿变化 → 提交到 X6 节点与 store
  watch(eventsDraft, () => commitEvents(), { deep: true })

  return { eventsDraft, addEventRule, removeEventRule }
}
