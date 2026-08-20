<!-- ══════════════════════════════════════════════════════════════════════
     NodeRouteTab.vue - 属性面板「路线」标签页（所有节点通用）

     为节点绑定路线并控制运动：选择路线、速度、循环执行，
     双按钮四态控制（空闲/运行中/已暂停/已结束）。
     运动状态经画布 cell:change:data 事件实时同步到本地镜像。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div>
    <div class="field checkbox-field">
      <label class="checkbox-label">
        <input type="checkbox" v-model="routeEnabled" @change="onRouteEnabledChange" />
        <span>启用路线运动</span>
      </label>
      <!-- 帮助按钮：路线运动使用说明气泡 -->
      <span class="field-help-wrap">
        <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'route'" title="路线运动说明" @click="toggleFieldHelp('route')">?</button>
        <div v-if="fieldHelpOpen === 'route'" class="field-help-pop" role="note">
          勾选「启用路线运动」后可为节点绑定路线并控制运动。
        </div>
      </span>
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

      <!-- 循环执行：节点级覆盖（未改过时用路线自身的 loop 默认值），运行中勾选/取消实时生效 -->
      <div class="field">
        <label class="checkbox-label">
          <input type="checkbox" v-model="routeLoop" @change="onRouteLoopChange" />
          <span>循环执行</span>
        </label>
      </div>

      <!-- 路线运动控制：双按钮四态（空闲/运行中/已暂停/已结束）。
           主按钮：运行→暂停→继续；次按钮：运行中结束 / 结束后重置回首航点 -->
      <div class="route-actions">
        <button
          class="route-btn"
          :class="{ active: routePaused, running: routeMoving && !routePaused }"
          @click="onPrimaryRouteAction"
          :disabled="!nodeRouteId"
          :title="routeMoving && !routePaused ? '暂停（保留位置，可继续）' : routePaused ? '从暂停处继续' : '从首航点开始运行'"
        >
          {{ routeMoving && !routePaused ? '⏸ 暂停' : routePaused ? '▶ 继续' : '▶ 运行' }}
        </button>
        <button
          class="route-btn"
          @click="onSecondaryRouteAction"
          :disabled="secondaryRouteDisabled"
          :title="routeMoving ? '结束运行（节点停在当前位置）' : '回到首航点（不启动）'"
        >
          {{ routeMoving ? '⏹ 结束' : '↺ 重置' }}
        </button>
      </div>
      <!-- 状态行：四态实时展示（修复自然结束后按钮状态不更新的问题） -->
      <div class="route-state">状态：{{ routeStateLabel }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useRouteStore } from '@/stores/route'
import { useFieldHelp } from './useFieldHelp'

const props = defineProps<{
  canvasRef: any
}>()

const editorStore = useEditorStore()
const routeStore = useRouteStore()
const { fieldHelpOpen, toggleFieldHelp } = useFieldHelp()

/** 当前选中元素 */
const element = computed(() => editorStore.selectedElement)

// ===================== 辅助方法：获取 Graph 实例 =====================
function getGraph(): any {
  const g = props.canvasRef?.graph
  return g?.value !== undefined ? g.value : g
}

// ===================== 路线配置本地状态 =====================
const routeEnabled = ref(false)
const nodeRouteId = ref('')
const routeSpeed = ref(80)
/** 循环执行（节点级覆盖：data.routeLoop ?? 路线默认 loop） */
const routeLoop = ref(true)
/** 路线运动四态本地镜像（源自节点 data，由 cell:change:data 事件实时同步）：
 *  isMoving=true 且 !routePaused → 运行中；isMoving=true 且 routePaused → 已暂停；
 *  isMoving=false 且 routeFinished → 已结束；其余 → 空闲 */
const routeMoving = ref(false)
const routePaused = ref(false)
const routeFinished = ref(false)

/** 次按钮禁用条件：空闲态（无运行也无结束记录）或未选路线时不可结束/重置 */
const secondaryRouteDisabled = computed(() =>
  !nodeRouteId.value || (!routeMoving.value && !routeFinished.value)
)

/** 状态行文案 */
const routeStateLabel = computed(() => {
  if (routeMoving.value) return routePaused.value ? '已暂停' : '运行中'
  return routeFinished.value ? '已结束' : '空闲'
})

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
    routeLoop.value = true
    return
  }
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return
  const data = node.getData() || {}
  routeEnabled.value = data.routeEnabled ?? false
  nodeRouteId.value = data.routeId || ''
  // 速度/循环：优先节点覆盖，否则取路线默认
  const route = data.routeId ? routeStore.getRoute(data.routeId) : null
  routeSpeed.value = data.routeSpeed ?? route?.speed ?? 80
  routeLoop.value = data.routeLoop ?? route?.loop ?? true
  applyRouteStateFromNode(data)
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
  // 设置路线时同步默认速度与循环模式
  const route = nodeRouteId.value ? routeStore.getRoute(nodeRouteId.value) : null
  if (route) {
    data.routeSpeed = route.speed
    routeSpeed.value = route.speed
    data.routeLoop = route.loop
    routeLoop.value = route.loop
  }
  node.setData(data, { deep: false })

  // 同步到 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeId: data.routeId, routeSpeed: data.routeSpeed, routeLoop: data.routeLoop } })
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

/** 循环执行开关：写入节点级覆盖，运行中经 updateRouteConfig 实时生效 */
function onRouteLoopChange() {
  if (!element.value || element.value.type !== 'node') return
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(element.value.data.id)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  data.routeLoop = routeLoop.value
  node.setData(data, { deep: false })

  // 同步到 store（节点级覆盖持久化）
  const storeNode = editorStore.graphData.nodes.find(n => n.id === element.value!.data.id)
  if (storeNode) {
    editorStore.updateNode(element.value.data.id, { data: { ...(storeNode.data || {}), routeLoop: routeLoop.value } })
  }

  // 如果正在移动，实时切换循环模式
  props.canvasRef?.updateRouteConfig?.(element.value.data.id, { loop: routeLoop.value })
}

/** 启动运行：从 route store 获取路线，写入 node.data.route 供 X6Canvas 使用 */
function startRouteMove() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const graph = getGraph()
  if (!graph) return
  const node = graph.getCellById(nodeId)
  if (!node?.isNode()) return
  const route = nodeRouteId.value ? routeStore.getRoute(nodeRouteId.value) : null
  if (!route || route.points.length < 2) return
  // 将路线配置写入节点 data（供 RouteService 使用；循环模式取节点级覆盖）
  const data = node.getData() || {}
  node.setData({
    ...data,
    route: { points: route.points, segments: route.segments, speed: routeSpeed.value, loop: routeLoop.value, smooth: route.smooth },
  }, { deep: false })
  props.canvasRef?.toggleRouteMovement?.(nodeId)
}

/** 主按钮：运行（空闲/已结束）→ 暂停（运行中）→ 继续（已暂停） */
function onPrimaryRouteAction() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  if (routeMoving.value && !routePaused.value) {
    props.canvasRef?.pauseRouteMovement?.(nodeId)
  } else if (routePaused.value) {
    props.canvasRef?.resumeRouteMovement?.(nodeId)
  } else {
    startRouteMove()
  }
}

/** 次按钮：结束（运行中/已暂停，节点停在当前位置）或 重置（已结束，回首航点） */
function onSecondaryRouteAction() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  if (routeMoving.value) {
    // toggleRouteMovement 检测到 isMoving 会执行停止
    props.canvasRef?.toggleRouteMovement?.(nodeId)
  } else {
    props.canvasRef?.resetRouteMovement?.(nodeId)
  }
}

// ---------- 路线运动状态实时同步 ----------
// 修复：非循环路线自然走完（或外部停止）后，节点 data.isMoving 已变 false，
// 但面板本地状态无人更新导致按钮卡在“停止”态。现订阅画布 cell:change:data，
// 当前选中节点的路线状态字段变化时实时回填本地镜像。
const ROUTE_STATE_KEYS = ['isMoving', 'routePaused', 'routeFinished']
let routeStateUnsub: (() => void) | null = null

/** 把节点 data 中的路线状态字段同步到本地镜像 */
function applyRouteStateFromNode(data: any) {
  routeMoving.value = data?.isMoving ?? false
  routePaused.value = data?.routePaused ?? false
  routeFinished.value = data?.routeFinished ?? false
}

/** 订阅画布数据变化（graph 实例就绪后只注册一次；graph 无事件 API 时跳过，兼容测试桩） */
function subscribeRouteStateChanges(g: any) {
  if (!g || typeof g.on !== 'function' || routeStateUnsub) return
  const handler = ({ cell, current }: any) => {
    if (!element.value || element.value.type !== 'node') return
    if (cell.id !== element.value.data.id) return
    // 仅响应路线状态字段变化，避免其他 data 写入的无效刷新
    if (!ROUTE_STATE_KEYS.some(k => k in (current || {}))) return
    applyRouteStateFromNode(cell.getData())
  }
  g.on('cell:change:data', handler)
  routeStateUnsub = () => g.off('cell:change:data', handler)
}

// graph 实例由 X6Canvas 挂载后才有（canvasRef.graph 是 ref）：就绪时订阅
watch(
  () => props.canvasRef?.graph?.value ?? props.canvasRef?.graph,
  (g) => { if (g) subscribeRouteStateChanges(g) },
  { immediate: true }
)

onBeforeUnmount(() => {
  // 兜底反注册，避免残留画布监听器
  routeStateUnsub?.()
  routeStateUnsub = null
})
</script>

<style scoped>
@import './panelShared.css';

/* ===================== 路线运动控制 ===================== */
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
/* 路线运动状态行（四态实时展示） */
.route-state {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
input[type='range'] {
  width: 100%;
  height: 4px;
  accent-color: var(--color-primary);
  cursor: pointer;
}
</style>
