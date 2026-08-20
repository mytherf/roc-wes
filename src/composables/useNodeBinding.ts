// ========== 节点数据绑定模型（PropertyPanel 绑定/事件标签页共享）==========
// 从 PropertyPanel.vue 抽取：点组草稿（点ID + 点名称 + 转换函数 + 备注）、
// 数据源选择、画面点指定、双写提交（X6 节点 + Pinia Store）等绑定核心逻辑。
//
// 由 PropertyPanel 实例化后 provide，绑定标签页（编辑）与事件标签页
// （读取绑定点选项）inject 共享同一份状态，保证两页数据一致。
//
// 协议差异（点ID 只读/助手/分组）不在本模型硬编码——经
// pointIdAssistantRegistry 按数据源类型查询注册项（见 assistantEntry）。

import { ref, reactive, computed, watch, type ComputedRef, type InjectionKey } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useDataSourceStore } from '@/stores/dataSource'
import { getPointIdAssistant, type PointIdAssistantEntry } from '@/components/dataSource/pointIdAssistantRegistry'

/** 绑定点组草稿：点 ID、点名称、转换函数与备注为一组（点组地位平等、全部可删） */
export interface BindingGroupDraft {
  pointId: string
  name: string
  transformSource: string
  remark: string
}

/**
 * 节点数据绑定模型
 *
 * @param getGraph 获取 X6 Graph 实例的函数（来自画布 canvasRef）
 * @param canvasRef X6Canvas 组件实例（bindNodeData/unbindNodeData 订阅管理）
 * @param element 当前选中元素（computed）
 */
export function useNodeBinding(
  getGraph: () => any,
  canvasRef: any,
  element: ComputedRef<any>
) {
  const editorStore = useEditorStore()
  const dataSourceStore = useDataSourceStore()

  // ===================== 数据绑定配置的本地状态 =====================
  // 数据源实例 ID（空字符串 = 未选择；必须选择数据源管理中维护的实例）
  const bindingSourceId = ref('')

  // 点组列表（从零开始，仅添加/导入产生；数据写入 data.values[pointId]，画面点额外驱动 data.value）
  const bindingGroups = ref<BindingGroupDraft[]>([])
  // 画面点草稿：驱动节点画面的点ID（空 = 缺省回落首个点组，不写入存档）
  const displayPointId = ref('')

  /** 当前选中的数据源实例（未选择时为 null） */
  const selectedDataSource = computed(() =>
    bindingSourceId.value ? dataSourceStore.getDataSource(bindingSourceId.value) ?? null : null
  )

  /** 当前数据源类型的点 ID 助手（未注册返回 null，点ID 自由输入、不校验、不分组） */
  const assistantEntry = computed<PointIdAssistantEntry | null>(() =>
    getPointIdAssistant(selectedDataSource.value?.type)
  )

  /** 判断某点ID 是否为当前生效画面点（显式指定或缺省回落首个有效点组） */
  function isDisplayPoint(pointId: string): boolean {
    const pid = pointId.trim()
    if (!pid) return false
    const first = watchFieldOptions.value[0]?.pointId ?? ''
    const eff = displayPointId.value && watchFieldOptions.value.some((o) => o.pointId === displayPointId.value)
      ? displayPointId.value
      : first
    return pid === eff
  }

  /** 是否存在至少一个点ID 非空的点组（驱动绑定状态提示） */
  const hasAnyPoint = computed(() => bindingGroups.value.some((g) => !!g.pointId.trim()))

  /**
   * 监听字段下拉选项：field 统一为绑定点ID，
   * 选项 = 当前节点绑定点组中非空且去重的点ID（保留录入顺序）；
   * 填了点名称时展示为「点ID（名称）」，便于区分。
   */
  const watchFieldOptions = computed(() => {
    const opts: { pointId: string; label: string }[] = []
    const seen = new Set<string>()
    for (const g of bindingGroups.value) {
      const pid = g.pointId.trim()
      if (pid && !seen.has(pid)) {
        seen.add(pid)
        const nm = g.name.trim()
        opts.push({ pointId: pid, label: nm ? `${pid}（${nm}）` : pid })
      }
    }
    return opts
  })

  /** 添加一个空的点组（助手协议的新建后自动打开由绑定标签页负责） */
  function addPointGroup() {
    bindingGroups.value.push({ pointId: '', name: '', transformSource: '', remark: '' })
  }

  /** 删除指定点组（全部可删）并立即同步绑定；删除后画面点无效时自动顺延首个点组（由 updateBinding 回落实现） */
  function removePointGroup(idx: number) {
    bindingGroups.value.splice(idx, 1)
    updateBinding()
  }

  // ===================== 监听选中节点切换，加载绑定配置 =====================
  // 只监听节点 ID（而非 element 深度监听）：updateBinding 会把 binding 写回 store，
  // selectedElement 随之生成新对象，若深度监听会每次击键都把草稿回填一遍
  //（未选数据源时 binding 为 undefined，草稿被清空 → 点ID 无法输入）。
  // 切换选中节点时才需要重新回填草稿。
  watch(
    () => element.value?.data?.id,
    (newId) => {
      const newElement = element.value
      displayPointId.value = ''
      if (!newId || !newElement || newElement.type !== 'node') {
        bindingSourceId.value = ''
        bindingGroups.value = []
        return
      }
      const data = newElement.data
      let binding = data?.binding || {}

      // 如果 store 中没有 binding 点组，尝试从 X6 节点实例直接读取
      if (!binding.points?.length) {
        const graph = getGraph()
        if (graph) {
          const node = graph.getCellById(newElement.data.id)
          if (node && node.isNode()) {
            const nodeData = node.getData()
            if (nodeData?.binding?.points?.length) {
              binding = nodeData.binding
            }
          }
        }
      }

      bindingSourceId.value = binding.sourceId || ''
      // 点组回填：每组 = 点ID + 点名称 + 转换函数 + 备注；无点组时列表为空（点组从零）
      if (Array.isArray(binding.points) && binding.points.length > 0) {
        bindingGroups.value = binding.points.map((p: any) => ({
          pointId: p?.pointId ?? '',
          name: p?.name ?? '',
          transformSource: p?.transformSource ?? '',
          remark: p?.remark ?? '',
        }))
      } else {
        bindingGroups.value = []
      }
      // 画面点回填：仅存档显式指定且仍在点组中时生效，否则空（缺省回落首个点组）
      const dispId = binding.display?.pointId ?? ''
      displayPointId.value = bindingGroups.value.some((g) => g.pointId.trim() === dispId.trim()) ? dispId : ''
    },
    { immediate: true }
  )

  // ===================== 核心方法：更新绑定配置 =====================
  function updateBinding() {
    if (!element.value || element.value.type !== 'node') {
      console.warn('[PropertyPanel] 未选中节点，跳过绑定更新')
      return
    }

    const nodeId = element.value.data.id
    // 有效点组：点ID 非空且去重（保留首个）；点名称、转换函数与备注随组携带
    const validGroups: BindingGroupDraft[] = []
    const seen = new Set<string>()
    for (const g of bindingGroups.value) {
      const pid = g.pointId.trim()
      if (!pid || seen.has(pid)) continue
      seen.add(pid)
      validGroups.push({ pointId: pid, name: g.name.trim(), transformSource: g.transformSource.trim(), remark: g.remark.trim() })
    }

    let binding: any = null

    // 有点组即提交绑定配置，sourceId 允许后补：
    // 点位是用户录入的设计数据，若要求"点组 + 数据源同时具备才写入"，
    // ① 未选数据源时录入的点位只存在于面板草稿，切换选中节点即丢失；
    // ② 切换数据源（先置空再改选）会把已录入的点位整段清空。
    // 无 sourceId 的绑定运行期不会订阅——bindNodeData 解析不到数据源即静默返回，
    // 节点保持静态值，语义安全
    if (validGroups.length > 0) {
      // 画面点：仅当显式指定且有效、且不等于首个点组时写入 display（缺省回落首点，保持存档精简）；
      // 画面点所在组被删/失效时 display 不写入 → 运行期与面板徽标同步顺延首个点组
      const dispId = displayPointId.value.trim()
      const display =
        dispId && validGroups.some((g) => g.pointId === dispId) && dispId !== validGroups[0].pointId
          ? { pointId: dispId }
          : undefined
      binding = {
        points: validGroups.map((g) => ({
          pointId: g.pointId,
          name: g.name || undefined,
          transformSource: g.transformSource || undefined,
          remark: g.remark || undefined,
        })),
        sourceId: bindingSourceId.value || undefined,
        display,
      }
    } else {
      binding = undefined
    }

    // 触发画布重新绑定
    try {
      const graph = getGraph()
      if (!graph) {
        console.warn('[PropertyPanel] canvasRef.graph 未就绪')
        return
      }

      const node = graph.getCellById(nodeId)
      if (!node || !node.isNode()) {
        console.warn('[PropertyPanel] 节点实例未找到')
        return
      }

      // 将 binding 同步写入 X6 节点数据。
      // 必须用 updateData（顶层整体替换，deep:false），不能用默认 setData 深合并——
      // X6 深合并即 lodash.merge：数组按下标逐项合并（删除点组后 points 尾部旧条目残留
      // → 运行期继续订阅已删点位）、undefined 值被跳过（旧字段清不掉），
      // 都会导致画布 binding 与 store 分叉，进而误判"实质变化"触发整画布重建
      node.updateData({ binding })

      // 取消旧订阅
      if (canvasRef?.unbindNodeData) {
        canvasRef.unbindNodeData(nodeId)
      }

      // 仅当绑定有效（点ID + 数据源实例均具备）时才建立新订阅
      if (binding && canvasRef?.bindNodeData) {
        canvasRef.bindNodeData(node)
      }
    } catch (error) {
      console.error('[PropertyPanel] 更新数据绑定时发生错误:', error)
    }

    // 最后更新 store：binding 写入 data.binding（与 X6 节点数据结构一致，
    // 避免画布重载时 fromJSON 用旧 data.binding 覆盖导致 sourceId 丢失）
    const storeNode = editorStore.graphData.nodes.find((n) => n.id === nodeId)
    if (storeNode) {
      editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), binding } })
    }
  }

  return reactive({
    bindingSourceId,
    bindingGroups,
    displayPointId,
    selectedDataSource,
    assistantEntry,
    watchFieldOptions,
    hasAnyPoint,
    isDisplayPoint,
    addPointGroup,
    removePointGroup,
    updateBinding,
  })
}

/** 绑定模型共享类型（provide/inject 契约；reactive 包装后内部 ref 自动解包，
 *  消费方模板内可直接读写 binding.bindingSourceId 等字段） */
export type NodeBindingModel = ReturnType<typeof useNodeBinding>

/** provide/inject 键：PropertyPanel 实例化模型后 provide，绑定/事件标签页 inject */
export const NODE_BINDING_KEY: InjectionKey<NodeBindingModel> = Symbol('node-binding-model')
