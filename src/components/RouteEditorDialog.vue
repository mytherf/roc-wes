<template>
  <div class="route-editor">
    <div class="route-body">
          <!-- 路线列表（顶部） -->
          <div class="route-list-panel">
            <div class="route-list-header">
              <span>路线列表</span>
              <button class="btn-add" @click="createNew">＋ 新建</button>
            </div>
            <div class="route-list">
              <div
                v-for="r in routeStore.routes"
                :key="r.id"
                class="route-item"
                :class="{ active: selectedId === r.id }"
                @click="selectRoute(r.id)"
              >
                <span class="route-item-name">{{ r.name }}</span>
                <span class="route-item-info">{{ r.points.length }} 航点</span>
              </div>
              <div v-if="routeStore.routes.length === 0" class="route-empty">
                暂无路线，点击「新建」创建
              </div>
            </div>
          </div>

          <!-- 编辑区（下部） -->
          <div class="route-edit-panel" v-if="selectedRoute">
            <div class="edit-field">
              <label>名称</label>
              <input v-model="editName" @input="onNameChange" placeholder="路线名称" />
            </div>

            <div class="edit-field">
              <label>默认速度 <span class="hint">({{ editSpeed }} px/s)</span></label>
              <input type="range" min="20" max="300" step="10" v-model.number="editSpeed" @input="onSpeedChange" />
            </div>

            <div class="edit-field row-fields">
              <label class="checkbox-label">
                <input type="checkbox" v-model="editLoop" @change="onLoopChange" />
                <span>循环运行</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" v-model="editSmooth" @change="onSmoothChange" />
                <span>曲线平滑</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" v-model="gridSnap" />
                <span>网格吸附</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" v-model="showCoordLabels" @change="onCoordLabelsChange" />
                <span>显示坐标</span>
              </label>
            </div>

            <!-- 航点编辑 -->
            <div class="edit-section-title">航点 ({{ selectedRoute.points.length }})</div>
            <div class="edit-actions">
              <button class="btn-edit" :class="{ active: drawing }" @click="toggleDrawing">
                {{ drawing ? '✏️ 点击画布添加…' : '✏️ 添加航点' }}
              </button>
              <button class="btn-del" @click="clearPoints" :disabled="selectedRoute.points.length === 0">清空</button>
            </div>

            <div class="wp-list" v-if="selectedRoute.points.length > 0">
              <div v-for="(wp, idx) in selectedRoute.points" :key="idx" class="wp-row">
                <span class="wp-idx" :class="{ start: idx === 0, station: wp.type === 'station' }">
                  {{ wp.type === 'station' ? '⬛' : idx + 1 }}
                </span>
                <span class="wp-xy">
                  <input
                    class="wp-coord"
                    type="number"
                    :value="wp.x"
                    title="X 坐标"
                    @change="onCoordChange(idx, 'x', $event)"
                  /><span class="wp-comma">,</span><input
                    class="wp-coord"
                    type="number"
                    :value="wp.y"
                    title="Y 坐标"
                    @change="onCoordChange(idx, 'y', $event)"
                  />
                </span>
                <span v-if="wp.type === 'station'" class="wp-station-tag">{{ wp.stationName || '站点' }}</span>
                <button class="wp-remove" @click="removePoint(idx)">×</button>
              </div>
            </div>
            <div v-else class="wp-hint">点击「添加航点」后在画布上依次点击设置路径。<br/>右键航点可删除/插入/设为站点，右键线段可插入中间点。</div>

            <!-- 分段配置 -->
            <div class="edit-section-title" v-if="selectedRoute.points.length > 1">分段配置</div>
            <div class="seg-list" v-if="selectedRoute.points.length > 1">
              <div v-for="(seg, idx) in displaySegments" :key="idx" class="seg-row">
                <span class="seg-label">段{{ idx + 1 }}</span>
                <span class="seg-pts">{{ idx + 1 }}→{{ idx + 2 > selectedRoute!.points.length ? 1 : idx + 2 }}</span>
                <input
                  class="seg-speed"
                  type="number"
                  :placeholder="String(editSpeed)"
                  :value="seg.speed || ''"
                  @change="onSegSpeedChange(idx, $event)"
                  title="该段速度（留空用默认）"
                />
                <select class="seg-dir" :value="seg.direction" @change="onSegDirChange(idx, $event)" title="通行方向">
                  <option value="forward">→</option>
                  <option value="backward">←</option>
                  <option value="both">↔</option>
                </select>
                <input
                  class="seg-dwell"
                  type="number"
                  placeholder="0"
                  :value="seg.action?.dwell || ''"
                  @change="onSegDwellChange(idx, $event)"
                  title="到达停顿(ms)"
                />
              </div>
            </div>

            <!-- 预览/删除 -->
            <div class="edit-footer">
              <button class="btn-preview" @click="previewAnimation" :disabled="selectedRoute.points.length < 2 || previewing">
                {{ previewing ? '⏹ 停止预览' : '▶ 预览动画' }}
              </button>
              <button class="btn-delete" @click="deleteCurrent">🗑 删除路线</button>
            </div>
          </div>

          <!-- 未选中 -->
          <div class="route-edit-panel route-placeholder" v-else>
            <span>选择或新建一条路线进行编辑</span>
          </div>
    </div>

    <!-- 绘制提示 + 右键菜单：teleport 到 body，用 fixed 定位覆盖在画布之上 -->
    <Teleport to="body">
      <div v-if="drawing" class="route-draw-hint">
        🎯 点击画布添加航点 · 按 <b>ESC</b> 或 <b>右键</b> 结束
      </div>
      <div
        v-if="ctxMenu.visible"
        class="route-ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.stop
      >
        <template v-if="ctxMenu.type === 'waypoint'">
          <div class="ctx-item" @click="ctxInsertAfter">➕ 在此之后插入</div>
          <div class="ctx-item" @click="ctxToggleStation">
            {{ ctxMenu.wpType === 'station' ? '⚪ 取消站点' : '⬛ 设为站点' }}
          </div>
          <div class="ctx-item danger" @click="ctxDeleteWaypoint">🗑 删除航点</div>
        </template>
        <template v-else-if="ctxMenu.type === 'segment'">
          <div class="ctx-item" @click="ctxInsertMidpoint">➕ 插入中间点</div>
        </template>
        <template v-else-if="ctxMenu.type === 'blank'">
          <div class="ctx-item" @click="ctxAddWaypoint">➕ 添加航点</div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouteStore, type RouteWaypoint, type RouteSegment } from '@/stores/route'

const props = withDefaults(defineProps<{
  canvasRef: any
  /** 路线 tab 是否处于激活（激活且面板展开）状态，决定是否接管画布交互 */
  active?: boolean
}>(), {
  active: false,
})

const routeStore = useRouteStore()

// ===================== 选中状态 =====================
const selectedId = ref<string | null>(null)
const selectedRoute = computed(() =>
  selectedId.value ? routeStore.getRoute(selectedId.value) ?? null : null
)

// ===================== 编辑字段 =====================
const editName = ref('')
const editSpeed = ref(80)
const editLoop = ref(true)
const editSmooth = ref(false)
const drawing = ref(false)
const gridSnap = ref(true)
const showCoordLabels = ref(false)
const previewing = ref(false)

// 分段显示（确保长度匹配）
const displaySegments = computed<RouteSegment[]>(() => {
  const route = selectedRoute.value
  if (!route || route.points.length < 2) return []
  const expectedLen = route.points.length - 1 + (route.loop ? 1 : 0)
  const segs: RouteSegment[] = []
  for (let i = 0; i < expectedLen; i++) {
    segs.push(route.segments[i] || { direction: 'forward' })
  }
  return segs
})

// 注意：selectedRoute 的 immediate watcher 依赖 stopDrawing/stopPreview 内部的
// let 变量（blankClickHandler/previewFrameId/previewDotId），须在这些变量声明之后注册，
// 否则会触发 TDZ ReferenceError。见文件下方 stopPreview 之后的 watch 注册。

// ===================== 画布交互 =====================
function getGraph(): any {
  const g = props.canvasRef?.graph
  return g?.value !== undefined ? g.value : g
}

const PREFIX = '__route_editor_'

/**
 * 覆盖层渲染代号：每次重绘自增并拼入单元格 id（置于索引之后，
 * 保证现有 parseInt 解析逻辑不受影响）。X6 渲染调度器按 id 合并待处理任务，
 * 同 id 先删后加会让渲染任务顶替删除任务，造成旧视图残留。
 */
let overlayGen = 0

/** 网格吸附坐标 */
function snapCoord(val: number): number {
  if (!gridSnap.value) return Math.round(val)
  return Math.round(val / 10) * 10
}

/** 渲染路线预览到画布 */
function renderOverlay(points: RouteWaypoint[]) {
  const graph = getGraph()
  if (!graph) return
  clearOverlay()
  overlayGen += 1
  const g = overlayGen

  const route = selectedRoute.value
  const smooth = route?.smooth ?? false

  // 线段（带方向箭头）
  const segCount = points.length - 1 + ((editLoop.value && points.length > 2) ? 1 : 0)
  for (let i = 0; i < segCount; i++) {
    const fromIdx = i
    const toIdx = (i + 1) % points.length
    const from = points[fromIdx]
    const to = points[toIdx]
    if (!from || !to) continue

    const isLoopSeg = i >= points.length - 1
    const seg = route?.segments?.[i]
    const dir = seg?.direction || 'forward'

    // 根据方向决定箭头
    const targetMarker = dir === 'backward' ? null : { name: 'block', width: 8, height: 6 }
    const sourceMarker = dir === 'backward' ? { name: 'block', width: 8, height: 6 } : (dir === 'both' ? { name: 'block', width: 8, height: 6 } : null)

    const edgeConfig: any = {
      id: `${PREFIX}seg${i}_g${g}`,
      source: { x: from.x, y: from.y },
      target: { x: to.x, y: to.y },
      attrs: {
        line: {
          stroke: isLoopSeg ? '#b37feb' : '#722ed1',
          strokeWidth: 2,
          strokeDasharray: isLoopSeg ? '4 4' : '8 4',
          targetMarker,
          sourceMarker,
        },
      },
      data: { isRouteOverlay: true, segIndex: i },
      zIndex: -1,
    }

    // 贝塞尔平滑
    if (smooth && points.length > 2) {
      edgeConfig.connector = { name: 'smooth' }
    }

    graph.addEdge(edgeConfig)
  }

  // 航点标记（站点用方形，普通用圆形）
  for (let i = 0; i < points.length; i++) {
    const wp = points[i]
    const isStation = wp.type === 'station'
    const isStart = i === 0
    const size = isStation ? 14 : 12

    const wpNode: any = {
      id: `${PREFIX}wp${i}_g${g}`,
      shape: isStation ? 'rect' : 'circle',
      x: wp.x - size / 2,
      y: wp.y - size / 2,
      width: size,
      height: size,
      attrs: {
        body: {
          fill: isStart ? '#52c41a' : isStation ? '#faad14' : '#722ed1',
          stroke: '#fff',
          strokeWidth: 2,
          rx: isStation ? 2 : undefined,
          ry: isStation ? 2 : undefined,
        },
      },
      data: { isRouteOverlay: true, wpIndex: i, wpType: wp.type || 'waypoint' },
      zIndex: 100,
    }

    graph.addNode(wpNode)

    // 显示坐标标签（开关控制）：在航点标记下方用一个独立的圆角小标签标注 "(x, y)"。
    // 说明：内置 circle/rect 的 labels 数组在本项目不会渲染文本，故改用独立 rect 节点，
    // 借助其内置 label（居中文本）实现；id 用 'lbl' 前缀避开航点拖拽逻辑，
    // data.isCoordLabel 供画布排除选中/交互。
    if (showCoordLabels.value) {
      graph.addNode({
        id: `${PREFIX}lbl${i}_g${g}`,
        shape: 'rect',
        x: wp.x - 32,
        y: wp.y + 8,
        width: 64,
        height: 16,
        attrs: {
          body: {
            fill: 'rgba(255, 255, 255, 0.92)',
            stroke: '#d3adf7',
            strokeWidth: 1,
            rx: 4,
            ry: 4,
          },
          label: {
            text: `(${wp.x}, ${wp.y})`,
            fill: '#722ed1',
            fontSize: 10,
            fontFamily: 'monospace',
          },
        },
        data: { isRouteOverlay: true, isCoordLabel: true },
        zIndex: 99,
      })
    }
  }
}

function clearOverlay() {
  const graph = getGraph()
  if (!graph) return
  const toRemove = graph.getCells().filter((c: any) => c.id?.startsWith(PREFIX))
  if (toRemove.length) graph.removeCells(toRemove)
}

// ===================== 航点拖拽 =====================
let nodeMovedHandler: ((args: any) => void) | null = null
let nodeMoveEndHandler: ((args: any) => void) | null = null

function bindWaypointDrag() {
  const graph = getGraph()
  if (!graph) return

  nodeMovedHandler = ({ node }: any) => {
    if (!node.id?.startsWith(PREFIX + 'wp')) return
    const idx = parseInt(node.id.replace(PREFIX + 'wp', ''), 10)
    if (isNaN(idx)) return

    const pos = node.getPosition()
    const size = node.getSize()
    const newX = snapCoord(pos.x + size.width / 2)
    const newY = snapCoord(pos.y + size.height / 2)

    const route = selectedRoute.value
    if (!route || !route.points[idx]) return

    const newPoints = route.points.map((p, i) =>
      i === idx ? { ...p, x: newX, y: newY } : p
    )
    routeStore.updateRoute(route.id, { points: newPoints })
  }

  nodeMoveEndHandler = ({ node }: any) => {
    if (!node.id?.startsWith(PREFIX + 'wp')) return
    // 拖拽结束后重新渲染覆盖层（更新连线）
    const route = selectedRoute.value
    if (route) renderOverlay(route.points)
  }

  graph.on('node:moved', nodeMovedHandler)
  graph.on('node:move:end', nodeMoveEndHandler)
}

function unbindWaypointDrag() {
  const graph = getGraph()
  if (!graph) return
  if (nodeMovedHandler) graph.off('node:moved', nodeMovedHandler)
  if (nodeMoveEndHandler) graph.off('node:move:end', nodeMoveEndHandler)
  nodeMovedHandler = null
  nodeMoveEndHandler = null
}

// ===================== 右键菜单 =====================
const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: '' as 'waypoint' | 'segment' | 'blank' | '',
  wpIndex: -1,
  segIndex: -1,
  wpType: 'waypoint' as string,
  canvasX: 0,
  canvasY: 0,
})

function hideCtxMenu() {
  ctxMenu.visible = false
}

let ctxHandler: ((args: any) => void) | null = null
let edgeCtxHandler: ((args: any) => void) | null = null
let blankCtxHandler: ((args: any) => void) | null = null
let docClickHandler: (() => void) | null = null

function bindContextMenu() {
  const graph = getGraph()
  if (!graph) return

  // 右键航点
  ctxHandler = ({ e, node }: any) => {
    if (drawing.value) { e.preventDefault(); stopDrawing(); return }
    if (!node.id?.startsWith(PREFIX + 'wp')) return
    e.preventDefault()
    e.stopPropagation()
    const idx = parseInt(node.id.replace(PREFIX + 'wp', ''), 10)
    const data = node.getData() || {}
    ctxMenu.type = 'waypoint'
    ctxMenu.wpIndex = idx
    ctxMenu.wpType = data.wpType || 'waypoint'
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.visible = true
  }

  // 右键线段
  edgeCtxHandler = ({ e, edge }: any) => {
    if (drawing.value) { e.preventDefault(); stopDrawing(); return }
    if (!edge.id?.startsWith(PREFIX + 'seg')) return
    e.preventDefault()
    e.stopPropagation()
    const idx = parseInt(edge.id.replace(PREFIX + 'seg', ''), 10)
    ctxMenu.type = 'segment'
    ctxMenu.segIndex = idx
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.visible = true
  }

  // 右键空白
  blankCtxHandler = ({ e }: any) => {
    if (!props.active) return
    if (drawing.value) { e.preventDefault(); stopDrawing(); return }
    e.preventDefault()
    const point = graph.clientToLocal(e.clientX, e.clientY)
    ctxMenu.type = 'blank'
    ctxMenu.canvasX = snapCoord(point.x)
    ctxMenu.canvasY = snapCoord(point.y)
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.visible = true
  }

  docClickHandler = () => hideCtxMenu()

  graph.on('node:contextmenu', ctxHandler)
  graph.on('edge:contextmenu', edgeCtxHandler)
  graph.on('blank:contextmenu', blankCtxHandler)
  document.addEventListener('click', docClickHandler)
}

function unbindContextMenu() {
  const graph = getGraph()
  if (graph) {
    if (ctxHandler) graph.off('node:contextmenu', ctxHandler)
    if (edgeCtxHandler) graph.off('edge:contextmenu', edgeCtxHandler)
    if (blankCtxHandler) graph.off('blank:contextmenu', blankCtxHandler)
  }
  if (docClickHandler) document.removeEventListener('click', docClickHandler)
  ctxHandler = null
  edgeCtxHandler = null
  blankCtxHandler = null
  docClickHandler = null
}

// 右键菜单操作
function ctxDeleteWaypoint() {
  const route = selectedRoute.value
  if (!route || ctxMenu.wpIndex < 0) return
  const newPoints = route.points.filter((_, i) => i !== ctxMenu.wpIndex)
  routeStore.updateRoute(route.id, { points: newPoints })
  routeStore.syncSegments(route.id)
  renderOverlay(newPoints)
  hideCtxMenu()
}

function ctxInsertAfter() {
  const route = selectedRoute.value
  if (!route || ctxMenu.wpIndex < 0) return
  const cur = route.points[ctxMenu.wpIndex]
  const next = route.points[ctxMenu.wpIndex + 1] || route.points[0]
  const midX = snapCoord((cur.x + next.x) / 2)
  const midY = snapCoord((cur.y + next.y) / 2)
  const newPoints = [...route.points]
  newPoints.splice(ctxMenu.wpIndex + 1, 0, { x: midX, y: midY, type: 'waypoint' })
  routeStore.updateRoute(route.id, { points: newPoints })
  routeStore.syncSegments(route.id)
  renderOverlay(newPoints)
  hideCtxMenu()
}

function ctxToggleStation() {
  const route = selectedRoute.value
  if (!route || ctxMenu.wpIndex < 0) return
  const newPoints = route.points.map((p, i) => {
    if (i !== ctxMenu.wpIndex) return p
    if (p.type === 'station') return { ...p, type: 'waypoint' as const, stationName: undefined }
    return { ...p, type: 'station' as const, stationName: `站点${i + 1}` }
  })
  routeStore.updateRoute(route.id, { points: newPoints })
  renderOverlay(newPoints)
  hideCtxMenu()
}

function ctxInsertMidpoint() {
  const route = selectedRoute.value
  if (!route || ctxMenu.segIndex < 0) return
  const fromIdx = ctxMenu.segIndex
  const toIdx = (fromIdx + 1) % route.points.length
  const from = route.points[fromIdx]
  const to = route.points[toIdx]
  if (!from || !to) return
  const midX = snapCoord((from.x + to.x) / 2)
  const midY = snapCoord((from.y + to.y) / 2)
  const newPoints = [...route.points]
  newPoints.splice(fromIdx + 1, 0, { x: midX, y: midY, type: 'waypoint' })
  routeStore.updateRoute(route.id, { points: newPoints })
  routeStore.syncSegments(route.id)
  renderOverlay(newPoints)
  hideCtxMenu()
}

function ctxAddWaypoint() {
  const route = selectedRoute.value
  if (!route) return
  const newPoints = [...route.points, { x: ctxMenu.canvasX, y: ctxMenu.canvasY, type: 'waypoint' as const }]
  routeStore.updateRoute(route.id, { points: newPoints })
  routeStore.syncSegments(route.id)
  renderOverlay(newPoints)
  hideCtxMenu()
}

// ===================== 航点绘制模式 =====================
let blankClickHandler: ((args: any) => void) | null = null

function toggleDrawing() {
  if (drawing.value) {
    stopDrawing()
  } else {
    startDrawing()
  }
}

function startDrawing() {
  const graph = getGraph()
  if (!graph || !selectedId.value) return
  drawing.value = true

  blankClickHandler = ({ e }: any) => {
    const point = graph.clientToLocal(e.clientX, e.clientY)
    const wp: RouteWaypoint = { x: snapCoord(point.x), y: snapCoord(point.y), type: 'waypoint' }
    const route = selectedRoute.value
    if (route) {
      const newPoints = [...route.points, wp]
      routeStore.updateRoute(route.id, { points: newPoints })
      routeStore.syncSegments(route.id)
      renderOverlay(newPoints)
    }
  }
  graph.on('blank:click', blankClickHandler)
}

function stopDrawing() {
  drawing.value = false
  const graph = getGraph()
  if (graph && blankClickHandler) {
    graph.off('blank:click', blankClickHandler)
    blankClickHandler = null
  }
}

// ===================== 预览动画 =====================
let previewFrameId: number | null = null
let previewDotId: string | null = null

function previewAnimation() {
  if (previewing.value) {
    stopPreview()
    return
  }
  const route = selectedRoute.value
  if (!route || route.points.length < 2) return

  const graph = getGraph()
  if (!graph) return

  previewing.value = true
  const points = route.points
  const speed = route.speed
  const loop = route.loop
  const smooth = route.smooth

  // 创建预览小圆点（带渲染代号后缀，避免同 id 先删后加导致旧视图残留）
  overlayGen += 1
  previewDotId = `${PREFIX}preview_dot_g${overlayGen}`
  graph.addNode({
    id: previewDotId,
    shape: 'circle',
    x: points[0].x - 5,
    y: points[0].y - 5,
    width: 10,
    height: 10,
    attrs: { body: { fill: '#ff4d4f', stroke: '#fff', strokeWidth: 2 } },
    data: { isRouteOverlay: true },
    zIndex: 200,
  })

  let segIndex = 0
  let progress = 0
  let lastTime = performance.now()

  const tick = (now: number) => {
    const dt = (now - lastTime) / 1000
    lastTime = now

    const from = points[segIndex]
    const toIdx = (segIndex + 1) % points.length
    const to = points[toIdx]
    if (!from || !to) { stopPreview(); return }

    const segLen = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
    if (segLen > 0) {
      progress += (speed * dt) / segLen
    }

    while (progress >= 1) {
      progress -= 1
      segIndex++
      if (segIndex >= points.length - 1) {
        if (loop) {
          segIndex = 0
        } else {
          stopPreview()
          return
        }
      }
    }

    const curFrom = points[segIndex]
    const curTo = points[(segIndex + 1) % points.length]
    if (!curFrom || !curTo) { stopPreview(); return }

    let x: number, y: number
    if (smooth && points.length > 2) {
      const pos = catmullRomPoint(points, segIndex, progress, loop)
      x = pos.x; y = pos.y
    } else {
      x = curFrom.x + (curTo.x - curFrom.x) * progress
      y = curFrom.y + (curTo.y - curFrom.y) * progress
    }

    const dot = graph.getCellById(previewDotId!)
    if (dot?.isNode()) {
      dot.setPosition({ x: x - 5, y: y - 5 })
    } else {
      stopPreview()
      return
    }

    previewFrameId = requestAnimationFrame(tick)
  }

  previewFrameId = requestAnimationFrame(tick)
}

function stopPreview() {
  previewing.value = false
  if (previewFrameId !== null) {
    cancelAnimationFrame(previewFrameId)
    previewFrameId = null
  }
  if (previewDotId) {
    const graph = getGraph()
    if (graph) {
      const dot = graph.getCellById(previewDotId)
      if (dot) graph.removeCells([dot])
    }
    previewDotId = null
  }
}

// ===================== 选中路线同步编辑字段 =====================
// 放在 stopDrawing/stopPreview 及其 let 变量声明之后，避免 TDZ 错误

// 切换选中路线时停止绘制/预览。selectedId 仅在切换/新建/删除路线时变化，
// 编辑航点（updateRoute 生成新对象）不会改变 selectedId，因此不会打断绘制模式。
watch(selectedId, () => {
  stopDrawing()
  stopPreview()
})

// 选中路线对象变化时回填编辑字段（immediate 保证打开弹窗即同步）。
// 注意：此处不能调用 stopDrawing/stopPreview，否则每次添加航点都会退出绘制模式。
watch(selectedRoute, (route) => {
  if (route) {
    editName.value = route.name
    editSpeed.value = route.speed
    editLoop.value = route.loop
    editSmooth.value = route.smooth
  }
}, { immediate: true })

/** Catmull-Rom 插值（与 RouteService 一致） */
function catmullRomPoint(points: RouteWaypoint[], segIndex: number, t: number, loop: boolean) {
  const n = points.length
  const getPoint = (i: number): RouteWaypoint => {
    if (loop) return points[((i % n) + n) % n]
    return points[Math.max(0, Math.min(n - 1, i))]
  }
  const p0 = getPoint(segIndex - 1)
  const p1 = getPoint(segIndex)
  const p2 = getPoint(segIndex + 1)
  const p3 = getPoint(segIndex + 2)

  const cp1x = p1.x + (p2.x - p0.x) / 6
  const cp1y = p1.y + (p2.y - p0.y) / 6
  const cp2x = p2.x - (p3.x - p1.x) / 6
  const cp2y = p2.y - (p3.y - p1.y) / 6

  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = t * t
  const t3 = t2 * t

  return {
    x: mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x,
    y: mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y,
  }
}

// ===================== 操作 =====================
function createNew() {
  const route = routeStore.createRoute(`路线-${routeStore.routes.length + 1}`)
  selectedId.value = route.id
  // 新建路线同样高亮（此时无航点，其他路线淡化以提示编辑焦点已切换）
  props.canvasRef?.highlightRoute?.(route.id)
}

function selectRoute(id: string) {
  stopDrawing()
  stopPreview()
  selectedId.value = id
  const route = routeStore.getRoute(id)
  // 选中路线后，只要有航点就在画布上绘制编辑器覆盖层。
  if (route && route.points.length > 0) {
    renderOverlay(route.points)
    focusOnRoute(route.points)
  } else {
    clearOverlay()
  }
  // 联动画布高亮：选中路线加粗提亮 + 光晕，其余路线淡化
  props.canvasRef?.highlightRoute?.(id)
}

/**
 * 将视口聚焦到路线范围：
 * 路线超出当前视口时缩小到可见，否则保持当前缩放（最多放大到 100%）并居中。
 */
function focusOnRoute(points: RouteWaypoint[]) {
  const graph = getGraph()
  if (!graph || points.length === 0) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  graph.zoomToRect(
    {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    },
    {
      padding: 80,
      minScale: 0.2,
      maxScale: Math.max(graph.zoom(), 1),
    },
  )
}

function onNameChange() {
  if (selectedId.value) {
    routeStore.updateRoute(selectedId.value, { name: editName.value })
  }
}

function onSpeedChange() {
  if (selectedId.value) {
    routeStore.updateRoute(selectedId.value, { speed: editSpeed.value })
  }
}

function onLoopChange() {
  if (selectedId.value) {
    routeStore.updateRoute(selectedId.value, { loop: editLoop.value })
    routeStore.syncSegments(selectedId.value)
    const route = selectedRoute.value
    if (route && route.points.length > 0) {
      renderOverlay(route.points)
    }
  }
}

function onSmoothChange() {
  if (selectedId.value) {
    routeStore.updateRoute(selectedId.value, { smooth: editSmooth.value })
    const route = selectedRoute.value
    if (route && route.points.length > 0) {
      renderOverlay(route.points)
    }
  }
}

function removePoint(idx: number) {
  const route = selectedRoute.value
  if (!route) return
  const newPoints = route.points.filter((_, i) => i !== idx)
  routeStore.updateRoute(route.id, { points: newPoints })
  routeStore.syncSegments(route.id)
  renderOverlay(newPoints)
}

/** 手动编辑航点坐标（X/Y 数字输入框），提交后更新 store 并重绘覆盖层 */
function onCoordChange(idx: number, axis: 'x' | 'y', e: Event) {
  const route = selectedRoute.value
  if (!route) return
  const val = Math.round(Number((e.target as HTMLInputElement).value))
  if (Number.isNaN(val)) return
  const newPoints = route.points.map((p, i) => (i === idx ? { ...p, [axis]: val } : p))
  routeStore.updateRoute(route.id, { points: newPoints })
  renderOverlay(newPoints)
}

/** 切换「显示坐标」：重绘覆盖层以显示/隐藏航点坐标标签 */
function onCoordLabelsChange() {
  const route = selectedRoute.value
  if (route && route.points.length > 0) renderOverlay(route.points)
}

function clearPoints() {
  const route = selectedRoute.value
  if (!route) return
  // 与关闭弹窗的清理逻辑保持一致：先退出绘制模式、停止预览动画，再清空航点/分段。
  stopDrawing()
  stopPreview()
  routeStore.updateRoute(route.id, { points: [], segments: [] })
  clearOverlay()
}

function deleteCurrent() {
  if (!selectedId.value) return
  routeStore.deleteRoute(selectedId.value)
  clearOverlay()
  selectedId.value = null
  // 删除后无选中路线，恢复画布所有路线为正常样式
  props.canvasRef?.highlightRoute?.(null)
}

// 分段配置操作
function onSegSpeedChange(idx: number, e: Event) {
  if (!selectedId.value) return
  const val = parseInt((e.target as HTMLInputElement).value, 10)
  routeStore.updateSegment(selectedId.value, idx, { speed: val > 0 ? val : undefined })
}

function onSegDirChange(idx: number, e: Event) {
  if (!selectedId.value) return
  const val = (e.target as HTMLSelectElement).value as RouteSegment['direction']
  routeStore.updateSegment(selectedId.value, idx, { direction: val })
  const route = selectedRoute.value
  if (route) renderOverlay(route.points)
}

function onSegDwellChange(idx: number, e: Event) {
  if (!selectedId.value) return
  const val = parseInt((e.target as HTMLInputElement).value, 10)
  if (val > 0) {
    routeStore.updateSegment(selectedId.value, idx, { action: { dwell: val } })
  } else {
    routeStore.updateSegment(selectedId.value, idx, { action: undefined })
  }
}

// 路线 tab 激活状态变化：离开时清理画布上的编辑器覆盖层与交互态，
// 回到时按当前选中路线重绘覆盖层。保证属性 tab 下画布干净、路线 tab 下即时可见。
watch(() => props.active, (on) => {
  if (on) {
    const route = selectedRoute.value
    if (route && route.points.length > 0) {
      nextTick(() => renderOverlay(route.points))
    }
    // 恢复选中路线的高亮
    if (selectedId.value) {
      props.canvasRef?.highlightRoute?.(selectedId.value)
    }
  } else {
    stopDrawing()
    stopPreview()
    clearOverlay()
    hideCtxMenu()
    // 收起面板时取消高亮，恢复所有路线的正常样式
    props.canvasRef?.highlightRoute?.(null)
  }
})

// ===================== 绘制模式增强：ESC 退出 + 十字光标 =====================
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && drawing.value) {
    stopDrawing()
  }
}

// 绘制时在 body 上挂类，配合全局样式让画布显示十字光标
watch(drawing, (on) => {
  document.body.classList.toggle('route-drawing-cursor', on)
})

// ===================== 生命周期 =====================
// 弹窗打开时绑定拖拽和右键菜单（须在 onMounted 后执行，避免 setup 阶段操作画布报错）
onMounted(() => {
  bindWaypointDrag()
  bindContextMenu()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  stopDrawing()
  stopPreview()
  clearOverlay()
  unbindWaypointDrag()
  unbindContextMenu()
  window.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('route-drawing-cursor')
  // 卸载时恢复画布所有路线为正常样式
  props.canvasRef?.highlightRoute?.(null)
})
</script>

<style scoped>
/* ===== 路线编辑器根容器：填满底部面板 tab 内容区 ===== */
.route-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  overflow: hidden;
}

/* 绘制模式悬浮提示（顶部居中） */
.route-draw-hint {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  background: rgba(114, 46, 209, 0.92);
  color: #fff;
  font-size: 13px;
  padding: 8px 18px;
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
  z-index: 1002;
}
.route-draw-hint b {
  background: rgba(255, 255, 255, 0.25);
  padding: 0 5px;
  border-radius: 3px;
  font-weight: 600;
}

/* ===== 主体：左右结构（左列表 / 右编辑） ===== */
.route-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 路线列表（左侧，定宽可滚动） */
.route-list-panel {
  flex-shrink: 0;
  width: 220px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.route-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.btn-add {
  border: 1px solid var(--color-primary);
  background: none;
  color: var(--color-primary);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.btn-add:hover { background: var(--color-primary); color: #fff; }
.route-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}
.route-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}
.route-item:hover { background: var(--statusbar-bg); }
.route-item.active {
  background: var(--color-primary-light, rgba(24, 144, 255, 0.1));
  border: 1px solid var(--color-primary);
}
.route-item-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-item-info {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}
.route-empty {
  padding: 20px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* 右侧编辑 */
.route-edit-panel {
  flex: 1;
  min-width: 0;
  padding: 16px 20px;
  overflow-y: auto;
}
.route-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}
.edit-field {
  margin-bottom: 14px;
}
.edit-field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.edit-field input[type='text'],
.edit-field input:not([type]) {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--statusbar-bg);
  color: var(--text-primary);
  font-size: 13px;
  box-sizing: border-box;
}
.edit-field input[type='range'] {
  width: 100%;
  accent-color: var(--color-primary);
}
.row-fields {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  accent-color: var(--color-primary);
}
.hint { color: var(--text-muted); font-size: 11px; }

.edit-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 16px 0 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}
.edit-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.btn-edit {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--statusbar-bg);
  color: var(--text-primary);
  cursor: pointer;
}
.btn-edit:hover { border-color: #722ed1; color: #722ed1; }
.btn-edit.active { background: #722ed1; border-color: #722ed1; color: #fff; }
.btn-del {
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid #ff4d4f;
  border-radius: 6px;
  background: none;
  color: #ff4d4f;
  cursor: pointer;
}
.btn-del:hover { background: #ff4d4f; color: #fff; }
.btn-del:disabled { opacity: 0.4; cursor: not-allowed; }

.wp-list {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}
.wp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-light);
  font-size: 12px;
}
.wp-row:last-child { border-bottom: none; }
.wp-idx {
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #722ed1;
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wp-idx.start { background: #52c41a; }
.wp-idx.station { background: #faad14; border-radius: 3px; }
.wp-xy {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  font-family: monospace;
  font-size: 11px;
  color: var(--text-secondary);
}
.wp-coord {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 1px 4px;
  font-family: monospace;
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  outline: none;
  -moz-appearance: textfield;
}
.wp-coord:focus {
  border-color: var(--color-primary);
  color: var(--text-primary);
  background: transparent;
}
.wp-coord::-webkit-outer-spin-button,
.wp-coord::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.wp-comma {
  flex-shrink: 0;
  color: var(--text-muted);
}
.wp-station-tag {
  font-size: 10px;
  color: #faad14;
  background: rgba(250, 173, 20, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
}
.wp-remove {
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
}
.wp-remove:hover { color: #ff4d4f; }
.wp-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 12px 0;
  line-height: 1.6;
}

/* 分段配置 */
.seg-list {
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}
.seg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-light);
  font-size: 11px;
}
.seg-row:last-child { border-bottom: none; }
.seg-label {
  font-weight: 600;
  color: var(--text-secondary);
  width: 28px;
  flex-shrink: 0;
}
.seg-pts {
  color: var(--text-muted);
  width: 32px;
  flex-shrink: 0;
}
.seg-speed {
  width: 50px;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--statusbar-bg);
  color: var(--text-primary);
  font-size: 11px;
}
.seg-dir {
  width: 40px;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--statusbar-bg);
  color: var(--text-primary);
  font-size: 11px;
}
.seg-dwell {
  width: 50px;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--statusbar-bg);
  color: var(--text-primary);
  font-size: 11px;
}

.edit-footer {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}
.btn-preview {
  flex: 1;
  padding: 7px 12px;
  font-size: 12px;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: none;
  color: var(--color-primary);
  cursor: pointer;
}
.btn-preview:hover { background: var(--color-primary); color: #fff; }
.btn-preview:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-delete {
  padding: 7px 12px;
  font-size: 12px;
  border: 1px solid #ff4d4f;
  border-radius: 6px;
  background: none;
  color: #ff4d4f;
  cursor: pointer;
}
.btn-delete:hover { background: #ff4d4f; color: #fff; }

/* 右键菜单 */
.route-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 140px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  user-select: none;
}
.ctx-item {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.12s;
}
.ctx-item:hover {
  background: var(--border-light);
}
.ctx-item.danger {
  color: #ff4d4f;
}
.ctx-item.danger:hover {
  background: rgba(255, 77, 79, 0.08);
}
</style>

<style>
/* 绘制模式下画布十字光标（全局样式：body 类由组件切换，画布在本组件作用域外） */
body.route-drawing-cursor #x6-container,
body.route-drawing-cursor #x6-container * {
  cursor: crosshair !important;
}
</style>
