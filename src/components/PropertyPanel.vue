<template>
  <div class="property-panel">
    <h3>属性面板</h3>

    <!-- 未选中任何元素 -->
    <div v-if="!element && !canvasSelected" class="empty">请选择一个元素</div>

    <!-- ====== 画布属性（点击画布空白处） ====== -->
    <div v-else-if="canvasSelected">
      <div class="field">
        <label>类型</label>
        <span>画布</span>
      </div>
      <div class="field">
        <label>节点数量</label>
        <span>{{ nodeCount }}</span>
      </div>
      <div class="field">
        <label>连线数量</label>
        <span>{{ edgeCount }}</span>
      </div>

      <div class="section-divider">画布设置</div>

      <div class="field">
        <label>背景颜色</label>
        <input type="color" class="color-input" v-model="canvasBgColor" @input="updateCanvasBackground" />
      </div>

      <div class="field checkbox-field">
        <label class="checkbox-label">
          <input type="checkbox" v-model="canvasGridVisible" @change="updateGridVisible" />
          <span>显示网格</span>
        </label>
      </div>

      <div class="field">
        <label>网格大小</label>
        <input type="number" min="1" v-model.number="canvasGridSize" @input="updateGridSize" :disabled="!canvasGridVisible" />
      </div>

      <div class="field">
        <label>网格类型</label>
        <select v-model="canvasGridType" @change="updateGridType" :disabled="!canvasGridVisible">
          <option value="dot">点状</option>
          <option value="mesh">网格线</option>
          <option value="fixedDot">固定点</option>
          <option value="doubleMesh">双层网格</option>
        </select>
      </div>
    </div>

    <!-- 已选中元素 -->
    <div v-else-if="element">
      <!-- ====== 节点：三个标签页 ====== -->
      <template v-if="element.type === 'node'">
        <!-- 标签栏 -->
        <div class="panel-tabs">
          <div class="panel-tab" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础</div>
          <div class="panel-tab" :class="{ active: activeTab === 'binding' }" @click="activeTab = 'binding'">绑定</div>
          <div class="panel-tab" :class="{ active: activeTab === 'route' }" @click="activeTab = 'route'">路线</div>
          <div class="panel-tab" :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">事件</div>
        </div>

        <!-- ====== 基础属性 tab ====== -->
        <div v-show="activeTab === 'basic'">
          <div class="field">
            <label>ID</label>
            <span class="id-value" :title="element.data.id">{{ element.data.id }}</span>
          </div>
          <div class="field">
            <label>类型</label>
            <span>节点</span>
          </div>
          <div class="field">
            <label>标签</label>
            <input v-model="element.data.label" @input="updateNodeLabel" />
          </div>

          <!-- 设备名称（货架、堆垛机等 WCS 设备节点） -->
          <div v-if="element.data.name !== undefined" class="field">
            <label>名称</label>
            <input v-model="element.data.name" @input="updateNodeName" />
          </div>

          <!-- 货架维度属性：排/列/层 -->
          <template v-if="element.data.rows !== undefined">
            <div class="field">
              <label>排 (rows)</label>
              <input type="number" min="1" v-model.number="element.data.rows" @input="updateNodeDataField('rows')" />
            </div>
          </template>
          <template v-if="element.data.cols !== undefined">
            <div class="field">
              <label>列 (cols)</label>
              <input type="number" min="1" v-model.number="element.data.cols" @input="updateNodeDataField('cols')" />
            </div>
          </template>
          <template v-if="element.data.floors !== undefined">
            <div class="field">
              <label>层 (floors)</label>
              <input type="number" min="1" v-model.number="element.data.floors" @input="updateNodeDataField('floors')" />
            </div>
          </template>

          <!-- 自定义数据（卡片节点等） -->
          <template v-if="element.data.data">
            <div class="field">
              <label>标题</label>
              <input v-model="element.data.data.title" @input="updateNodeData" />
            </div>
            <div class="field">
              <label>状态</label>
              <select v-model="element.data.data.status" @change="updateNodeData">
                <option value="正常">正常</option>
                <option value="告警">告警</option>
                <option value="故障">故障</option>
                <option value="停止">停止</option>
              </select>
            </div>
          </template>

          <!-- 位置（一行两列） -->
          <div class="section-divider">位置</div>
          <div class="field-row">
            <div class="field">
              <label>X</label>
              <input type="number" v-model.number="posX" @input="onPositionInput" />
            </div>
            <div class="field">
              <label>Y</label>
              <input type="number" v-model.number="posY" @input="onPositionInput" />
            </div>
          </div>

          <!-- 尺寸（一行两列） -->
          <div class="section-divider">大小</div>
          <div class="field-row">
            <div class="field">
              <label>宽度</label>
              <input type="number" min="40" v-model.number="nodeWidth" @input="onSizeInput" />
            </div>
            <div class="field">
              <label>高度</label>
              <input type="number" min="40" v-model.number="nodeHeight" @input="onSizeInput" />
            </div>
          </div>

        </div>

        <!-- ====== 路线 tab（所有节点通用） ====== -->
        <div v-show="activeTab === 'route'">
          <div class="field checkbox-field">
            <label class="checkbox-label">
              <input type="checkbox" v-model="routeEnabled" @change="onRouteEnabledChange" />
              <span>启用路线运动</span>
            </label>
          </div>

          <template v-if="routeEnabled">
            <div class="field">
              <label>选择路线</label>
              <select v-model="nodeRouteId" @change="onRouteSelect">
                <option value="">未设置</option>
                <option v-for="r in routeStore.routes" :key="r.id" :value="r.id">{{ r.name }}（{{ r.points.length }} 航点）</option>
              </select>
            </div>

            <div class="field">
              <label>移动速度 <span class="hint">({{ routeSpeed }} px/s)</span></label>
              <input type="range" min="20" max="300" step="10" v-model.number="routeSpeed" @input="onRouteSpeedChange" />
            </div>

            <div class="route-actions">
              <button class="route-btn" :class="{ running: routeMoving }" @click="toggleRouteMove" :disabled="!nodeRouteId">
                {{ routeMoving ? '⏹ 停止' : '▶ 运行' }}
              </button>
            </div>
          </template>

          <div v-else class="route-disabled-hint">
            勾选「启用路线运动」后可为节点绑定路线并控制运动。
          </div>
        </div>

        <!-- ====== 数据绑定 tab ====== -->
        <div v-show="activeTab === 'binding'">
          <div class="field">
            <label>数据源 <span class="hint">（不选则使用模拟数据）</span></label>
            <select v-model="bindingSourceId" @change="updateBinding">
              <option value="">模拟数据</option>
              <option
                v-for="ds in dataSourceStore.dataSources"
                :key="ds.id"
                :value="ds.id"
              >{{ ds.name }}（{{ typeLabel(ds.type) }}）</option>
            </select>
          </div>
          <div v-if="selectedDataSource" class="source-info">
            <div class="source-url" :title="selectedDataSource.url">{{ selectedDataSource.url }}</div>
            <div v-if="selectedDataSource.description" class="source-desc">{{ selectedDataSource.description }}</div>
          </div>
          <div class="field">
            <label>点ID <span class="hint">（填写即启用数据绑定）</span></label>
            <input v-model="bindingPointId" @input="updateBinding" placeholder="例如: sensor.temp.001" />
          </div>
          <div class="field">
            <label>转换函数 (可选)</label>
            <input v-model="bindingTransform" @input="updateBinding" placeholder="(raw) => Math.round(raw)" />
          </div>
          <div class="binding-status">
            <span v-if="bindingPointId.trim()" class="status-active">✅ 已启用数据绑定</span>
            <span v-else class="status-inactive">⏸ 未启用（请填写点ID）</span>
          </div>
        </div>

        <!-- ====== 事件 tab ====== -->
        <div v-show="activeTab === 'events'">
          <div v-if="eventsDraft.length === 0" class="empty-hint">暂无事件规则，点击下方按钮添加。</div>

          <div v-for="(rule, idx) in eventsDraft" :key="rule.id" class="event-rule">
            <div class="rule-header">
              <label class="checkbox-label">
                <input type="checkbox" v-model="rule.enabled" />
                <span>启用</span>
              </label>
              <button class="rule-remove" @click="removeEventRule(idx)">删除</button>
            </div>
            <div class="field">
              <label>规则名称</label>
              <input v-model="rule.name" placeholder="例如：温度越限告警" />
            </div>
            <div class="field">
              <label>监听字段 <span class="hint">（留空监听 value）</span></label>
              <input v-model="rule.field" placeholder="value" />
            </div>
            <div class="field">
              <label>触发条件</label>
              <select v-model="rule.condition">
                <option value="changed">值变化</option>
                <option value="gt">大于 (&gt;)</option>
                <option value="lt">小于 (&lt;)</option>
                <option value="gte">大于等于 (≥)</option>
                <option value="lte">小于等于 (≤)</option>
                <option value="eq">等于 (=)</option>
                <option value="neq">不等于 (≠)</option>
              </select>
            </div>
            <div v-if="rule.condition !== 'changed'" class="field">
              <label>阈值</label>
              <input v-model="rule.threshold" placeholder="例如：80" />
            </div>
            <div class="field">
              <label>触发动作</label>
              <select v-model="rule.actionType">
                <option value="console">控制台日志</option>
                <option value="alert">弹出告警</option>
                <option value="http">HTTP 请求</option>
              </select>
            </div>
            <div v-if="rule.actionType === 'alert'" class="field">
              <label>告警内容</label>
              <input v-model="rule.message" placeholder="例如：设备温度越限！" />
            </div>
            <template v-if="rule.actionType === 'http'">
              <div class="field">
                <label>请求地址</label>
                <input v-model="rule.url" placeholder="http://localhost:8080/api/alarm" />
              </div>
              <div class="field">
                <label>请求方法</label>
                <select v-model="rule.method">
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
            </template>
          </div>

          <button class="add-event-btn" @click="addEventRule">＋ 添加事件规则</button>
        </div>
      </template>

      <!-- ====== 边：仅基础属性 ====== -->
      <template v-else-if="element.type === 'edge'">
        <div class="field">
          <label>ID</label>
          <span class="id-value" :title="element.data.id">{{ element.data.id }}</span>
        </div>
        <div class="field">
          <label>类型</label>
          <span>连线</span>
        </div>
        <div class="field">
          <label>标签</label>
          <input v-model="element.data.label" @input="updateEdgeLabel" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useNodeEvents } from '@/composables/useNodeEvents'
import {
  useDataSourceStore,
  DATA_SOURCE_TYPE_LABELS,
  type DataSourceType,
} from '@/stores/dataSource'

// ===================== 依赖注入 =====================
const editorStore = useEditorStore()
const dataSourceStore = useDataSourceStore()

const props = defineProps<{
  canvasRef: any
}>()

// ===================== 辅助方法：获取 Graph 实例 =====================
// canvasRef.graph 现在是一个 ref（来自 X6Canvas 的 defineExpose），需要读取 .value
function getGraph(): any {
  const g = props.canvasRef?.graph
  // 如果是 ref，取 .value；否则直接返回（兼容旧写法）
  return g?.value !== undefined ? g.value : g
}

// ===================== 当前选中元素 =====================
const element = computed(() => editorStore.selectedElement)

// ===================== 画布属性（点击空白处时展示） =====================
// 是否选中画布本身
const canvasSelected = computed(() => editorStore.canvasSelected)
// 画布统计信息（来源于 store 的 graphData，随数据变化自动更新）
const nodeCount = computed(() => editorStore.graphData.nodes.length)
const edgeCount = computed(() => editorStore.graphData.edges.length)

// 画布设置的本地状态（与 X6Canvas 的初始配置保持一致）
const canvasBgColor = ref('#f8fafc')
const canvasGridVisible = ref(true)
const canvasGridSize = ref(10)
const canvasGridType = ref<'dot' | 'mesh' | 'fixedDot' | 'doubleMesh'>('dot')

// 选中画布时，从 Graph 实例同步可读的当前状态（如网格大小）
watch(
    () => editorStore.canvasSelected,
    (selected) => {
      if (!selected) return
      const graph = getGraph()
      if (graph) {
        canvasGridSize.value = graph.getGridSize()
      }
    },
    { immediate: true }
)

/** 更新画布背景颜色 */
function updateCanvasBackground() {
  getGraph()?.drawBackground({ color: canvasBgColor.value })
}

/** 切换网格显隐 */
function updateGridVisible() {
  const graph = getGraph()
  if (!graph) return
  canvasGridVisible.value ? graph.showGrid() : graph.hideGrid()
}

/** 更新网格大小 */
function updateGridSize() {
  const graph = getGraph()
  if (!graph) return
  canvasGridSize.value = Math.max(canvasGridSize.value || 1, 1)
  graph.setGridSize(canvasGridSize.value)
}

/** 更新网格类型 */
function updateGridType() {
  getGraph()?.drawGrid({ type: canvasGridType.value })
}

// ===================== 标签页状态（基础属性 / 数据绑定 / 路线 / 事件） =====================
type PanelTab = 'basic' | 'binding' | 'route' | 'events'
const activeTab = ref<PanelTab>('basic')

// ===================== 数据绑定配置的本地状态 =====================
// 数据源实例 ID（空字符串 = 使用模拟数据）
const bindingSourceId = ref('')
const bindingPointId = ref('')
const bindingTransform = ref('')

/** 数据源类型显示名 */
function typeLabel(type: DataSourceType): string {
  return DATA_SOURCE_TYPE_LABELS[type] ?? type
}

/** 当前选中的数据源实例（未选择时为 null） */
const selectedDataSource = computed(() =>
  bindingSourceId.value ? dataSourceStore.getDataSource(bindingSourceId.value) ?? null : null
)

let isUpdatingFromWatch = false

// ===================== 事件规则（逻辑抽取至 useNodeEvents composable） =====================
const { eventsDraft, addEventRule, removeEventRule } = useNodeEvents(getGraph, activeTab)

// ===================== 位置与尺寸独立管理（绕过 store 响应式链） =====================
const posX = ref(0)
const posY = ref(0)
const nodeWidth = ref(0)
const nodeHeight = ref(0)
let positionRafId: number | null = null
let lastSyncedNodeId: string | null = null

// ===================== 监听选中元素变化，加载绑定配置 =====================
watch(
    () => element.value,
    (newElement) => {
      if (newElement && newElement.type === 'node') {
        const data = newElement.data
        let binding = data?.binding || {}

        // 如果 store 中没有 binding 数据，尝试从 X6 节点实例直接读取
        if (!binding.pointId) {
          const graph = getGraph()
          if (graph) {
            const node = graph.getCellById(newElement.data.id)
            if (node && node.isNode()) {
              const nodeData = node.getData()
              if (nodeData?.binding?.pointId) {
                binding = nodeData.binding
              }
            }
          }
        }

        bindingSourceId.value = binding.sourceId || ''
        bindingPointId.value = binding.pointId || ''
        bindingTransform.value =
          binding.transformSource || (binding.transform ? binding.transform.toString() : '')
      } else {
        bindingPointId.value = ''
      }
    },
    { immediate: true, deep: true }
)

watch(
    () => editorStore.selectedId,
    (newId) => {
      if (newId && newId !== lastSyncedNodeId) {
        lastSyncedNodeId = newId
        syncPositionFromCanvas()
        startPositionPolling()
      } else if (!newId) {
        lastSyncedNodeId = null
        stopPositionPolling()
      }
    },
    { immediate: true }
)

onBeforeUnmount(() => {
  stopPositionPolling()
})

// ===================== 核心方法：更新绑定配置 =====================
function updateBinding() {
  if (!element.value || element.value.type !== 'node') {
    console.warn('[PropertyPanel] 未选中节点，跳过绑定更新')
    return
  }

  if (isUpdatingFromWatch) return

  const nodeId = element.value.data.id
  const pointId = bindingPointId.value.trim()

  let binding: any = null

  if (pointId) {
    binding = { pointId }
    // 引用数据源实例（未选择则使用模拟数据，不写入 sourceId）
    if (bindingSourceId.value) {
      binding.sourceId = bindingSourceId.value
    }
    const transformSrc = bindingTransform.value.trim()
    if (transformSrc) {
      // transformSource：可持久化源码（保存工程不丢失）；transform：运行期编译缓存
      binding.transformSource = transformSrc
      try {
        binding.transform = new Function('raw', `return (${transformSrc})(raw)`)
      } catch (e) {
        console.warn('[PropertyPanel] 转换函数无效:', e)
      }
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

    // 将 binding 同步写入 X6 节点数据（含 transform，保证重新绑定时不丢失）
    const currentData = node.getData() || {}
    node.setData({
      ...currentData,
      binding,
    })

    // 取消旧订阅
    if (props.canvasRef.unbindNodeData) {
      props.canvasRef.unbindNodeData(nodeId)
    }

    // 如果有点ID，则绑定新订阅
    if (pointId && props.canvasRef.bindNodeData) {
      props.canvasRef.bindNodeData(node)
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

// ===================== 其他属性更新方法 =====================
function updateNodeLabel() {
  if (!element.value || element.value.type !== 'node') return
  editorStore.updateNode(element.value.data.id, { label: element.value.data.label })
}

function updateNodeName() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const newName = element.value.data.name

  const storeNode = editorStore.graphData.nodes.find(n => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), name: newName } })
  }

  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      const currentData = node.getData() || {}
      node.setData({ ...currentData, name: newName })
    }
  }
}

function updateNodeData() {
  if (!element.value || element.value.type !== 'node') return
  editorStore.updateNode(element.value.data.id, { data: element.value.data.data })
}

/** 同步货架等节点的 data 子字段（rows/cols/floors）到 store 和 X6 节点 */
function updateNodeDataField(field: string) {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const newValue = element.value.data[field]

  // 通过 updateNode 不可变更新 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), [field]: newValue } })
  }

  // 同步更新 X6 节点 data
  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      const currentData = node.getData() || {}
      node.setData({ ...currentData, [field]: newValue })
    }
  }
}

function updateEdgeLabel() {
  if (!element.value || element.value.type !== 'edge') return
  editorStore.updateEdge(element.value.data.id, { label: element.value.data.label })
}

function onPositionInput() {
  if (!element.value || element.value.type !== 'node') return
  const id = element.value.data.id
  const x = posX.value || 0
  const y = posY.value || 0

  if (props.canvasRef?.updateNodePosition) {
    props.canvasRef.updateNodePosition(id, x, y)
  }
}

function onSizeInput() {
  if (!element.value || element.value.type !== 'node') return
  const id = element.value.data.id
  const w = Math.max(nodeWidth.value || 40, 40)
  const h = Math.max(nodeHeight.value || 40, 40)

  if (props.canvasRef?.updateNodeSize) {
    props.canvasRef.updateNodeSize(id, w, h)
  }
}

function syncPositionFromCanvas() {
  const graph = getGraph()
  if (!graph || !editorStore.selectedId) return
  const cell = graph.getCellById(editorStore.selectedId)
  if (cell && cell.isNode()) {
    const pos = cell.getPosition()
    if (posX.value !== Math.round(pos.x) || posY.value !== Math.round(pos.y)) {
      posX.value = Math.round(pos.x)
      posY.value = Math.round(pos.y)
    }
    const size = cell.getSize()
    if (nodeWidth.value !== Math.round(size.width) || nodeHeight.value !== Math.round(size.height)) {
      nodeWidth.value = Math.round(size.width)
      nodeHeight.value = Math.round(size.height)
    }
  }
}

function startPositionPolling() {
  stopPositionPolling()
  const poll = () => {
    syncPositionFromCanvas()
    positionRafId = requestAnimationFrame(poll)
  }
  poll()
}

function stopPositionPolling() {
  if (positionRafId !== null) {
    cancelAnimationFrame(positionRafId)
    positionRafId = null
  }
}

// ===================== 路线配置（所有节点通用） =====================
import { useRouteStore } from '@/stores/route'

const routeStore = useRouteStore()

const routeEnabled = ref(false)
const nodeRouteId = ref('')
const routeSpeed = ref(80)
const routeMoving = ref(false)

/** 启用/禁用路线功能 */
function onRouteEnabledChange() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeEnabled = routeEnabled.value
  if (!routeEnabled.value) {
    // 禁用时停止运动
    if (data.isMoving) {
      props.canvasRef?.toggleRouteMovement?.(element.value.data.id)
    }
  }
  node.setData(data, { deep: false })

  // 同步到 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeEnabled: routeEnabled.value } })
  }
}

/** 从选中节点同步路线配置到本地状态 */
function syncRouteFromNode() {
  const graph = getGraph()
  if (!graph || !element.value || element.value.type !== 'node') {
    routeEnabled.value = false
    nodeRouteId.value = ''
    return
  }
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return
  const data = node.getData() || {}
  routeEnabled.value = data.routeEnabled ?? false
  nodeRouteId.value = data.routeId || ''
  // 速度：优先节点覆盖，否则取路线默认
  const route = data.routeId ? routeStore.getRoute(data.routeId) : null
  routeSpeed.value = data.routeSpeed ?? route?.speed ?? 80
  routeMoving.value = data.isMoving ?? false
}

// 选中元素变化时同步路线状态
watch(() => element.value?.data?.id, () => {
  syncRouteFromNode()
}, { immediate: true })

function onRouteSelect() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeId = nodeRouteId.value || null
  // 设置路线时同步默认速度
  const route = nodeRouteId.value ? routeStore.getRoute(nodeRouteId.value) : null
  if (route) {
    data.routeSpeed = route.speed
    routeSpeed.value = route.speed
  }
  node.setData(data, { deep: false })

  // 同步到 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeId: data.routeId, routeSpeed: data.routeSpeed } })
  }
}

function onRouteSpeedChange() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeSpeed = routeSpeed.value
  node.setData(data, { deep: false })

  // 如果正在移动，实时更新速度
  props.canvasRef?.updateRouteConfig?.(element.value.data.id, { speed: routeSpeed.value })
}

function toggleRouteMove() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(nodeId)
  if (!node?.isNode()) return

  const data = node.getData() || {}
  const isCurrentlyMoving = data.isMoving ?? false

  if (isCurrentlyMoving) {
    // 停止
    props.canvasRef?.toggleRouteMovement?.(nodeId)
  } else {
    // 启动：从 route store 获取路线，写入 node.data.route 供 X6Canvas 使用
    const route = nodeRouteId.value ? routeStore.getRoute(nodeRouteId.value) : null
    if (route && route.points.length >= 2) {
      // 将路线配置写入节点 data（供 RouteService 使用）
      const updatedData = { ...data, route: { points: route.points, segments: route.segments, speed: routeSpeed.value, loop: route.loop, smooth: route.smooth } }
      node.setData(updatedData, { deep: false })
      props.canvasRef?.toggleRouteMovement?.(nodeId)
    }
  }

  setTimeout(() => {
    const n = graph.getCellById(nodeId)
    routeMoving.value = n?.getData()?.isMoving ?? false
  }, 50)
}

</script>

<style scoped>
/* ===================== 面板整体样式 ===================== */
.property-panel {
  width: 240px;
  min-width: 200px;
  flex-shrink: 0;
  height: 100%;
  background: var(--panel-bg);
  padding: 18px;
  border-left: 1px solid var(--border-color);
  box-sizing: border-box;
  overflow-y: auto;
}
.property-panel h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.empty {
  color: var(--text-muted);
  text-align: center;
  margin-top: 40px;
  font-size: 13px;
}

/* ===================== 字段样式 ===================== */
.field {
  margin-bottom: 14px;
}
.field-row {
  display: flex;
  gap: 10px;
}
.field-row .field {
  flex: 1;
  min-width: 0;
}
.field label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.field .hint {
  font-weight: normal;
  color: var(--text-muted);
  font-size: 11px;
}
/* ID 值：缩小字体并强制单行显示（标准 UUID 可完整单行展示，超长时省略号，完整值见 title 提示） */
.field .id-value {
  display: block;
  max-width: 100%;
  font-size: 10px;
  line-height: 1.4;
  letter-spacing: -0.5px;
  color: var(--text-secondary);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.field input,
.field select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 12px;
  box-sizing: border-box;
  min-width: 0;
  background: var(--panel-bg);
  color: var(--text-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field input:focus,
.field select:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.field input:disabled,
.field select:disabled {
  background: var(--statusbar-bg);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* ===================== 画布属性区块样式 ===================== */
.section-divider {
  margin: 18px 0 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.field .color-input {
  padding: 2px;
  height: 32px;
  cursor: pointer;
}
.checkbox-field .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 0;
  color: var(--text-primary);
  font-size: 12px;
}
.checkbox-field .checkbox-label input[type='checkbox'] {
  width: auto;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}

/* ===================== 标签页栏 ===================== */
.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 14px;
  gap: 2px;
}
.panel-tab {
  flex: 1;
  text-align: center;
  padding: 8px 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.panel-tab:hover {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.panel-tab.active {
  color: var(--color-primary);
  font-weight: 600;
  border-bottom-color: var(--color-primary);
}

/* ===================== 事件规则 ===================== */
.empty-hint {
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
  padding: 16px 0;
}
.event-rule {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px;
  margin-bottom: 12px;
  background: var(--statusbar-bg);
}
.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rule-header .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.rule-header .checkbox-label input[type='checkbox'] {
  width: auto;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}
.rule-remove {
  border: none;
  background: none;
  color: var(--color-danger);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.rule-remove:hover {
  background: rgba(239, 68, 68, 0.08);
}
.event-rule .field {
  margin-bottom: 8px;
}
.add-event-btn {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--panel-bg);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}
.add-event-btn:hover {
  background: var(--color-primary-light);
}
.binding-status {
  margin-top: 8px;
  font-size: 12px;
}
.status-active {
  color: var(--color-success);
}
.status-inactive {
  color: var(--text-muted);
}
/* 数据源信息展示 */
.source-info {
  margin: -4px 0 12px;
  padding: 8px 10px;
  background: var(--color-primary-light);
  border: 1px solid var(--color-primary-ring);
  border-radius: var(--radius-md);
}
.source-url {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-primary);
  word-break: break-all;
}
.source-desc {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

/* ===================== 响应式适配 ===================== */
@media (max-width: 768px) {
  .property-panel {
    width: 200px;
    padding: 12px;
  }
  .field label {
    font-size: 10px;
  }
  .field input,
  .field select {
    font-size: 11px;
    padding: 4px 8px;
  }
}
@media (max-width: 480px) {
  .property-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 220px;
    height: 100%;
    z-index: 100;
    box-shadow: var(--shadow-lg);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    border-left: none;
  }
  .property-panel:hover {
    transform: translateX(0);
  }
}

/* ===================== AGV 路线配置 ===================== */
.route-actions {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.route-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--statusbar-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.route-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.route-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.route-btn.running {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: #fff;
}
.route-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.route-disabled-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 16px 0;
  text-align: center;
  line-height: 1.6;
}
input[type='range'] {
  width: 100%;
  height: 4px;
  accent-color: var(--color-primary);
  cursor: pointer;
}
</style>
