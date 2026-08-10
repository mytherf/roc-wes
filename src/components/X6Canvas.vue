<!-- ══════════════════════════════════════════════════════════════════════
     X6Canvas.vue - 画布编辑器核心组件（整个编辑器的“主战场”）

     基于 AntV X6 图编辑引擎，职责包括：
       1. 创建/销毁画布：初始化 Graph、网格、背景、缩放/平移、虚拟渲染
       2. 安装插件：选择框（Selection）、缩放（Transform）、剪贴板（Clipboard）、
          快捷键（Keyboard）、拖拽建节点（Dnd）
       3. 画布 ↔ Store 同步：移动/缩放/增删节点时写回 Store（useGraphSync）
       4. 数据驱动：节点绑定数据源后实时刷新（useDataService）
       5. 动画：节点闪烁/位移动画（AnimationService）、路线运动（RouteService）
       6. 路线可视化：渲染路线虚线路径 + 航点标记 + 高亮效果
       7. 显示模式：右键节点切换“图标模式/极简模式”，并自适应压缩节点尺寸
       8. 快捷键：Ctrl+C/V（复制粘贴）、Delete（删除）、Ctrl+Z（撤销）、Ctrl+S（保存）等
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <!-- X6 画布挂载的容器 -->
  <div id="x6-container" ref="containerRef"></div>
  <!-- 【关键】TeleportContainer 必须放在画布容器同级，Vue 节点才能正确渲染 -->
  <TeleportContainer/>

  <!-- 节点右键菜单：单独切换显示模式 -->
  <Teleport to="body">
    <div
      v-if="ctxMenu.visible"
      class="node-ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click.stop
    >
      <div class="ctx-menu-title">显示模式</div>
      <div
        class="ctx-menu-item"
        :class="{ active: ctxMenu.currentMode === 'icon' }"
        @click="setNodeDisplayMode('icon')"
      >
        <span class="ctx-icon">🖼️</span> 图标模式
        <span v-if="ctxMenu.currentMode === 'icon'" class="ctx-check">✓</span>
      </div>
      <div
        class="ctx-menu-item"
        :class="{ active: ctxMenu.currentMode === 'full' }"
        @click="setNodeDisplayMode('full')"
      >
        <span class="ctx-icon">🔲</span> 极简模式
        <span v-if="ctxMenu.currentMode === 'full'" class="ctx-check">✓</span>
      </div>
      <div class="ctx-menu-divider"></div>
      <div
        class="ctx-menu-item"
        :class="{ active: ctxMenu.currentMode === undefined }"
        @click="setNodeDisplayMode(undefined)"
      >
        <span class="ctx-icon">🌐</span> 跟随全局
        <span v-if="ctxMenu.currentMode === undefined" class="ctx-check">✓</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, reactive, watch, nextTick} from 'vue'
import {Clipboard, Dnd, Graph, Keyboard, Selection, Transform} from '@antv/x6'
import {getTeleport} from '@antv/x6-vue-shape';
import type {GraphData} from '@/stores/editor'
import {useEditorStore} from '@/stores/editor'
import {useRouteStore} from '@/stores/route'

import {AnimationService} from '@/services/AnimationService'
import {RouteService, type RouteConfig, type RouteWaypoint} from '@/services/RouteService'
import {PointIdGenerator} from '@/services/PointIdGenerator'

import {useDataService} from '@/composables/useDataService'
import {useGraphSync} from '@/composables/useGraphSync'
import {iconOnlyNodeSize, isMinimalIconShape} from './nodes/nodeIcons'

// ===================== 1. 获取 Teleport 容器组件 =====================
const TeleportContainer = getTeleport()

// ===================== 2. 响应式引用与实例变量 =====================
const containerRef = ref<HTMLDivElement | null>(null)

// X6 Graph 实例（内部使用，供闭包和事件回调引用）
let graph: Graph | null = null
// 响应式引用，用于 defineExpose 暴露给父组件（解决 let 变量暴露为 null 的问题）
const graphRef = ref<Graph | null>(null)

// Dnd 拖拽实例
let dnd: Dnd | null = null
// 响应式引用，用于 defineExpose
const dndRef = ref<Dnd | null>(null)

// ResizeObserver 实例（用于画布自适应）
let resizeObserver: ResizeObserver | null = null

// MutationObserver 实例（监听主题切换）
let themeObserver: MutationObserver | null = null

// 节点动画服务
let animationService: AnimationService | null = null

// 路线运动服务
let routeService: RouteService | null = null

// ===================== 2.5 节点右键菜单状态 =====================
const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  nodeId: '' as string,
  currentMode: undefined as string | undefined,
})

function hideCtxMenu() {
  ctxMenu.visible = false
}

/** 设置单个节点的显示模式覆盖，并调整尺寸 */
function setNodeDisplayMode(mode: 'icon' | 'full' | undefined) {
  if (!graph || !ctxMenu.nodeId) return
  const node = graph.getCellById(ctxMenu.nodeId)
  if (!node || !node.isNode()) return

  // 构造新 data：mode 为 undefined 时设为 null（X6 浅合并不会删除 key，必须用显式值覆盖）
  const data = { ...(node.getData() || {}) }
  data.displayMode = mode ?? null

  // 抑制 cell:change 自动同步，避免重复 pushHistory
  setSyncSuppressed(true)
  node.setData(data, { deep: false })

  // 计算有效模式（节点覆盖 ?? 全局）
  const effectiveMode = mode ?? editorStore.displayMode

  if (isMinimalShape(node)) {
    if (effectiveMode === 'icon') {
      // 切到图标模式：保存原始尺寸（如果还没保存）并按 iconSize 压缩
      if (!originalSizes.has(node.id)) {
        originalSizes.set(node.id, { ...node.getSize() })
      }
      node.setSize(iconModeSizeFor(data))
    } else {
      // 切到完整模式：恢复原始尺寸
      const original = originalSizes.get(node.id)
      if (original) {
        node.setSize(original)
        originalSizes.delete(node.id)
      }
    }
  }

  syncGraphToStore()
  editorStore.pushHistory()
  nextTick(() => setSyncSuppressed(false))
  hideCtxMenu()
}

// 点击任意位置关闭右键菜单
function onDocClick() {
  hideCtxMenu()
}

// ===================== 3. 使用 Store 与 Composables =====================
const editorStore = useEditorStore()
const routeStore = useRouteStore()

// 数据服务管理（数据源创建、缓存、节点订阅绑定与清理）
const dataService = useDataService()

/** 读取当前主题的 CSS 变量值 */
function getCssVar(name: string, fallback: string): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** 主题切换时同步更新画布背景与网格颜色 */
function applyThemeToCanvas() {
  if (!graph) return
  graph.drawBackground({ color: getCssVar('--canvas-bg', '#f8fafc') })
  graph.drawGrid({ type: 'dot', args: { color: getCssVar('--canvas-grid', '#e2e8f0'), thickness: 1 } })
}

// 画布 ↔ Store 双向同步（防循环标志、事件监听、watcher）
const {updateNodePosition, updateNodeSize, bindGraphEvents, bindStoreWatchers, syncGraphToStore, setSyncSuppressed} = useGraphSync({
  getGraph: () => graph,
  onReload: (data) => loadGraphData(data),
  // 新增节点：绑定数据源 + 应用动画
  onNodeAdded: (cell) => {
    const data = cell.getData()
    if (data?.binding?.pointId) {
      dataService.bindNodeData(cell)
    }
    applyNodeAnimation(cell)
    // 图标模式下新增的节点也需压缩尺寸（全局或节点级覆盖）
    const effectiveMode = data?.displayMode ?? editorStore.displayMode
    if (effectiveMode === 'icon' && cell.isNode() && isMinimalShape(cell)) {
      originalSizes.set(cell.id, { ...cell.getSize() })
      cell.setSize(iconModeSizeFor(data))
    }
  },
  // 移除节点：释放点 ID（含绑定的全部点位：主点 + 附加点）
  onNodeRemoved: (cell) => {
    const data = cell.getData()
    const generator = PointIdGenerator.getInstance()
    if (data?.pointId) {
      generator.release(data.pointId)
    }
    const binding = data?.binding
    if (binding) {
      const points = Array.isArray(binding.points) && binding.points.length > 0
        ? binding.points
        : (binding.pointId ? [binding.pointId] : [])
      for (const entry of points) {
        // 条目兼容字符串/对象（点组 = 点ID + 转换函数）
        const pid = typeof entry === 'string' ? entry : entry?.pointId
        if (pid) generator.release(pid)
      }
    }
  },
})

// ===================== 4.5 显示模式切换：节点尺寸适配 =====================

/** 计算图标模式下的节点尺寸：正方形，随节点 iconSize 自适应（见 nodeIcons.ts iconOnlyNodeSize） */
function iconModeSizeFor(nodeData: Record<string, any> | undefined | null): { width: number; height: number } {
  return iconOnlyNodeSize(nodeData?.iconSize)
}

/** 记录节点进入图标模式前的原始尺寸（nodeId → size） */
const originalSizes = new Map<string, { width: number; height: number }>()

// 定义事件：画布初始化完成 / 节点双击
const emit = defineEmits<{
  (e: 'ready', payload: { graph: Graph; dnd: Dnd }): void
  (e: 'node-dblclick', payload: { nodeId: string; shape: string }): void
}>()

// ===================== 3.5 路线可视化与编辑 =====================

/** 路线覆盖层边的 ID 前缀 */
const ROUTE_OVERLAY_PREFIX = '__route_overlay_'

/** 路线级持久路径覆盖层的 ID 前缀（独立于节点，随刷新/关闭编辑器保持） */
const ROUTE_PATH_PREFIX = '__route_path_'

/** 清除指定节点的路线覆盖层（虚线路径 + 航点标记） */
function clearRouteOverlay(nodeId: string) {
  if (!graph) return
  const prefix = ROUTE_OVERLAY_PREFIX + nodeId
  const toRemove = graph.getCells().filter(c => c.id?.startsWith(prefix))
  if (toRemove.length) graph.removeCells(toRemove)
}

/** 渲染节点的路线覆盖层（虚线折线 + 方向箭头 + 航点标记） */
function renderRouteOverlay(nodeId: string, points: RouteWaypoint[]) {
  if (!graph) return
  clearRouteOverlay(nodeId)
  if (points.length < 1) return

  const node = graph.getCellById(nodeId)
  const routeData = node?.getData()?.route
  const smooth = routeData?.smooth ?? false
  const segments = routeData?.segments || []
  const isLoop = routeData?.loop && points.length > 2

  // 绘制航点之间的虚线段（带方向箭头）
  const segCount = points.length - 1 + (isLoop ? 1 : 0)
  for (let i = 0; i < segCount; i++) {
    const fromIdx = i
    const toIdx = (i + 1) % points.length
    const from = points[fromIdx]
    const to = points[toIdx]
    if (!from || !to) continue

    const isLoopSeg = i >= points.length - 1
    const seg = segments[i]
    const dir = seg?.direction || 'forward'

    // 根据方向决定箭头
    const targetMarker = dir === 'backward' ? null : { name: 'block', width: 8, height: 6 }
    const sourceMarker = (dir === 'backward' || dir === 'both') ? { name: 'block', width: 8, height: 6 } : null

    const edgeConfig: any = {
      id: `${ROUTE_OVERLAY_PREFIX}${nodeId}_seg${i}`,
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
      data: { isRouteOverlay: true },
      zIndex: -1,
    }

    // 贝塞尔平滑
    if (smooth && points.length > 2) {
      edgeConfig.connector = { name: 'smooth' }
    }

    graph.addEdge(edgeConfig)
  }

  // 绘制航点标记（站点用方形，普通用圆形）
  for (let i = 0; i < points.length; i++) {
    const wp = points[i]
    const isStation = wp.type === 'station'
    const isStart = i === 0
    const size = isStation ? 14 : 12

    graph.addNode({
      id: `${ROUTE_OVERLAY_PREFIX}${nodeId}_wp${i}`,
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
      data: { isRouteOverlay: true },
      zIndex: 100,
    })
  }
}

/** 清除所有路线级持久路径覆盖层 */
function clearAllRoutePaths() {
  if (!graph) return
  const toRemove = graph.getCells().filter(c => c.id?.startsWith(ROUTE_PATH_PREFIX))
  if (toRemove.length) graph.removeCells(toRemove)
}

// ---------- 路线高亮（与路线列表选中状态联动） ----------
/** 当前高亮的路线 ID（null 表示无高亮，所有路线正常样式） */
let highlightedRouteId: string | null = null

/**
 * 路线路径渲染代号：每次重绘自增并拼入单元格 id，保证同一路线的单元格
 * 在「删除 → 重新添加」时 id 唯一。X6 渲染调度器的任务队列按单元格 id 合并
 * 待处理任务，同 id 先删后加会让渲染任务顶替删除任务，导致旧视图残留在 DOM。
 */
let pathRenderGen = 0

/**
 * 高亮画布中的指定路线：
 * - 选中路线：更亮的颜色 + 更粗的线宽 + 半透明光晕底衬 + 放大航点并加光环
 * - 其他路线：整体降低不透明度，弱化显示以突出选中路线
 * 传 null 恢复所有路线为正常样式。
 */
function highlightRoute(routeId: string | null) {
  if (highlightedRouteId === routeId) return
  highlightedRouteId = routeId
  renderRoutePaths()
}

/**
 * 渲染所有路线的持久路径（独立于节点，关闭编辑器/刷新后保持）。
 * 每次调用先清空旧的持久路径，再根据 routeStore 中的全部路线重绘；
 * 若存在高亮路线（highlightedRouteId），选中路线强调显示、其余路线淡化。
 */
function renderRoutePaths() {
  if (!graph) return
  clearAllRoutePaths()
  pathRenderGen += 1
  const gen = pathRenderGen

  for (const route of routeStore.routes) {
    const points = route.points || []
    if (points.length < 1) continue

    // 高亮状态：无高亮 → 正常；选中 → 强调；其余 → 淡化
    const state: 'normal' | 'highlighted' | 'dimmed' =
      highlightedRouteId === null
        ? 'normal'
        : route.id === highlightedRouteId
          ? 'highlighted'
          : 'dimmed'

    const smooth = route.smooth ?? false
    const segments = route.segments || []
    const isLoop = route.loop && points.length > 2

    // 航点之间的虚线段（带方向箭头）
    const segCount = points.length - 1 + (isLoop ? 1 : 0)
    for (let i = 0; i < segCount; i++) {
      const from = points[i]
      const to = points[(i + 1) % points.length]
      if (!from || !to) continue

      const isLoopSeg = i >= points.length - 1
      const seg = segments[i]
      const dir = seg?.direction || 'forward'
      const markerOpacity = state === 'dimmed' ? 0.18 : 1
      const targetMarker = dir === 'backward' ? null : { name: 'block', width: 8, height: 6, opacity: markerOpacity }
      const sourceMarker = (dir === 'backward' || dir === 'both') ? { name: 'block', width: 8, height: 6, opacity: markerOpacity } : null

      // 高亮路线：先铺一层半透明光晕底衬，让路线在画布中更醒目
      if (state === 'highlighted') {
        const glowConfig: any = {
          id: `${ROUTE_PATH_PREFIX}${route.id}_g${gen}_glow${i}`,
          source: { x: from.x, y: from.y },
          target: { x: to.x, y: to.y },
          attrs: {
            line: {
              stroke: '#9254de',
              strokeWidth: 10,
              strokeOpacity: 0.16,
              strokeLinecap: 'round',
            },
          },
          data: { isRouteOverlay: true, isRoutePath: true },
          zIndex: -2,
        }
        if (smooth && points.length > 2) {
          glowConfig.connector = { name: 'smooth' }
        }
        graph.addEdge(glowConfig)
      }

      const edgeConfig: any = {
        id: `${ROUTE_PATH_PREFIX}${route.id}_g${gen}_seg${i}`,
        source: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        attrs: {
          line: {
            stroke: isLoopSeg ? '#b37feb' : state === 'highlighted' ? '#9254de' : '#722ed1',
            strokeWidth: state === 'highlighted' ? 3.5 : 2,
            strokeOpacity: state === 'dimmed' ? 0.18 : 1,
            strokeDasharray: isLoopSeg ? '4 4' : '8 4',
            targetMarker,
            sourceMarker,
          },
        },
        data: { isRouteOverlay: true, isRoutePath: true },
        zIndex: -1,
      }
      if (smooth && points.length > 2) {
        edgeConfig.connector = { name: 'smooth' }
      }
      graph.addEdge(edgeConfig)
    }

    // 航点标记（站点方形 / 普通圆形）
    for (let i = 0; i < points.length; i++) {
      const wp = points[i]
      const isStation = wp.type === 'station'
      const isStart = i === 0
      const baseSize = isStation ? 14 : 12
      const size = state === 'highlighted' ? baseSize + 4 : baseSize

      // 高亮路线：航点下方叠加半透明光环
      if (state === 'highlighted') {
        const haloSize = size + 14
        graph.addNode({
          id: `${ROUTE_PATH_PREFIX}${route.id}_g${gen}_halo${i}`,
          shape: 'circle',
          x: wp.x - haloSize / 2,
          y: wp.y - haloSize / 2,
          width: haloSize,
          height: haloSize,
          attrs: {
            body: {
              fill: 'rgba(146, 84, 222, 0.12)',
              stroke: 'rgba(146, 84, 222, 0.45)',
              strokeWidth: 1.5,
            },
          },
          data: { isRouteOverlay: true, isRoutePath: true },
          zIndex: 99,
        })
      }

      graph.addNode({
        id: `${ROUTE_PATH_PREFIX}${route.id}_g${gen}_wp${i}`,
        shape: isStation ? 'rect' : 'circle',
        x: wp.x - size / 2,
        y: wp.y - size / 2,
        width: size,
        height: size,
        attrs: {
          body: {
            fill: isStart ? '#52c41a' : isStation ? '#faad14' : '#722ed1',
            stroke: '#fff',
            strokeWidth: state === 'highlighted' ? 2.5 : 2,
            opacity: state === 'dimmed' ? 0.18 : 1,
            rx: isStation ? 2 : undefined,
            ry: isStation ? 2 : undefined,
          },
        },
        data: { isRouteOverlay: true, isRoutePath: true },
        zIndex: 100,
      })
    }
  }
}

/** 更新路线配置（速度、循环等） */
function updateRouteConfig(nodeId: string, updates: Partial<RouteConfig>) {
  if (!graph) return
  const node = graph.getCellById(nodeId)
  if (!node?.isNode()) return

  const data = { ...(node.getData() || {}) }
  const route: RouteConfig = data.route || { points: [], speed: 80, loop: true }
  Object.assign(route, updates)
  data.route = route
  setSyncSuppressed(true)
  node.setData(data, { deep: false })
  renderRouteOverlay(nodeId, route.points)
  setSyncSuppressed(false)

  syncGraphToStore()

  // 如果正在移动，实时更新速度
  if (routeService?.isMoving(nodeId) && updates.speed != null) {
    routeService.setSpeed(nodeId, updates.speed)
  }
}

/** 开始/停止路线运动 */
function toggleRouteMovement(nodeId: string) {
  if (!graph || !routeService) return
  const node = graph.getCellById(nodeId)
  if (!node?.isNode()) return

  if (routeService.isMoving(nodeId)) {
    routeService.stopRoute(nodeId)
  } else {
    const route: RouteConfig | undefined = node.getData()?.route
    if (route && route.points.length >= 2) {
      routeService.startRoute(nodeId, route)
    }
  }
}

// ===================== 4. 暴露实例给父组件 =====================
defineExpose({
  graph: graphRef,
  dnd: dndRef,
  bindNodeData: dataService.bindNodeData,
  unbindNodeData: dataService.unbindNodeData,
  updateNodePosition,
  updateNodeSize,
  // 路线相关
  updateRouteConfig,
  toggleRouteMovement,
  clearRouteOverlay,
  renderRouteOverlay,
  highlightRoute,
})

// ===================== 4.6 监听显示模式切换 =====================
// 切换时批量调整节点模型尺寸，使选择框与图标模式的视觉内容匹配
watch(() => editorStore.displayMode, (mode, oldMode) => {
  if (!graph || mode === oldMode) return
  setSyncSuppressed(true)
  if (mode === 'icon') {
    applyIconModeSizes(graph)
  } else {
    restoreFullModeSizes(graph)
  }
  syncGraphToStore()
  nextTick(() => setSyncSuppressed(false))
})

// ===================== 4.7 监听路线数据变化，重绘持久路径 =====================
// 路线新增/删除/显隐切换/航点编辑时，重新渲染画布上的持久路线路径。
// 注意：store 的 routes 经由 computed 返回，元素替换时数组引用不变，直接 deep watch 不触发；
// 改用 JSON 签名作为监听源，任意路线变化都会产生新字符串从而可靠触发重绘。
watch(() => JSON.stringify(routeStore.routes), () => {
  if (!graph) return
  setSyncSuppressed(true)
  renderRoutePaths()
  nextTick(() => setSyncSuppressed(false))
})

// ===================== 5. 组件挂载后初始化画布 =====================
onMounted(() => {
  if (!containerRef.value) return

  graph = new Graph({
    container: containerRef.value,
    autoResize: true,
    grid: {
      visible: true,
      type: 'dot',
      args: { color: getCssVar('--canvas-grid', '#e2e8f0'), thickness: 1 },
    },
    background: { color: getCssVar('--canvas-bg', '#f8fafc') },
    panning: {
      enabled: true,
      eventTypes: ['rightMouseDown'],
    },

    virtual: {
      enabled: true,
      margin: 150,
    },
    mousewheel: {
      enabled: true,
      zoomAtMousePosition: true,
      minScale: 0.2,
      maxScale: 3,
    },

    // 路线级持久路径覆盖层、坐标标签覆盖层不可交互（不可拖动/缩放），其余单元正常
    interacting: (cellView) => {
      const data = cellView.cell.getData()
      return !data?.isRoutePath && !data?.isCoordLabel
    },

    connecting: {
      allowNode: true,
      allowPort: true,
      allowBlank: false,
      snap: {
        radius: 20,
      },
      createEdge: () => {
        return graph!.createEdge({
          shape: 'edge',
          attrs: {
            line: {
              stroke: '#1890ff',
              strokeWidth: 2,
              targetMarker: {
                name: 'block',
                width: 12,
                height: 8,
              },
            },
          },
        })
      },
      validateConnection: ({sourceCell, targetCell}) => {
        if (sourceCell === targetCell) return false
        const edges = graph!.getEdges()
        for (const edge of edges) {
          if (
              edge.getSourceCellId() === sourceCell?.id &&
              edge.getTargetCellId() === targetCell?.id
          ) {
            return false
          }
        }
        return true
      },
    },
  })

  // 同步到响应式引用，使父组件能访问到 graph 实例
  graphRef.value = graph

  if (!graph) {
    console.error('graph 未初始化')
    return
  }

  animationService = new AnimationService(graph)

  routeService = new RouteService(graph)
  routeService.onStateChange = (nodeId, moving, angle) => {
    const cell = graph?.getCellById(nodeId)
    if (cell?.isNode()) {
      const data = cell.getData() || {}
      cell.setData({ ...data, isMoving: moving, routeAngle: angle }, { deep: false })
    }
  }

  graph.use(
      new Selection({
        enabled: true,
        multiple: true,
        rubberband: true,
        movable: true,
        strict: false,
        showNodeSelectionBox: true,
        modifiers: ['shift'],
        // 路线级持久路径、坐标标签不可选中
        filter: (cell) => {
          const data = cell.getData()
          return !data?.isRoutePath && !data?.isCoordLabel
        },
      })
  )

  // 节点缩放（X6 v3 通过内置 Transform 插件实现）
  graph.use(
      new Transform({
        resizing: {
          enabled: true,
          minWidth: 40,
          minHeight: 40,
          maxWidth: 2000,
          maxHeight: 2000,
          orthogonal: true,
          allowReverse: false,
          preserveAspectRatio: false,
        },
      })
  )

  graph.use(
      new Clipboard({
        enabled: true,
        useLocalStorage: false,
      })
  )

  graph.use(
      new Keyboard({
        enabled: true,
        global: true,
      })
  )

  // ---------- 快捷键绑定（编辑器的“键盘操作”） ----------
  // Ctrl+C：复制选中的节点/连线到剪贴板
  graph.bindKey('ctrl+c', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.copy(cells)
    }
  })

  graph.bindKey('ctrl+v', () => {
    if (!graph!.isClipboardEmpty()) {
      graph!.paste({offset: {dx: 20, dy: 20}})
    }
  })

  graph.bindKey('delete', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.removeCells(cells)
    }
  })
  graph.bindKey('backspace', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.removeCells(cells)
    }
  })

  graph.bindKey('ctrl+a', () => {
    const allCells = graph!.getCells()
    graph!.select(allCells)
  })

  graph.bindKey('ctrl+z', () => {
    editorStore.undo()
  })
  graph.bindKey('ctrl+shift+z', () => {
    editorStore.redo()
  })
  // Ctrl+S 手动保存画布（替代实时自动保存），并拦截浏览器默认保存弹窗
  graph.bindKey('ctrl+s', (e: KeyboardEvent) => {
    e.preventDefault()
    editorStore.saveToStorage()
  })

  dnd = new Dnd({
    target: graph,
    getDragNode: (node) => {
      const cloned = node.clone()
      cloned.setAttrs({
        body: {
          stroke: '#1890ff',
          strokeWidth: 2,
          fill: '#e6f7ff',
        },
      })
      return cloned
    },
    getDropNode: (node) => {
      return node.clone()
    },
  })

  // 同步到响应式引用
  dndRef.value = dnd

  if (editorStore.graphData.nodes.length > 0) {
    loadGraphData(editorStore.graphData)
  }

  // ---------- 注册画布 ↔ Store 同步（事件 + watcher） ----------
  bindGraphEvents(graph)
  bindStoreWatchers()

  // ---------- 渲染持久路线路径（刷新后保持显示） ----------
  setSyncSuppressed(true)
  renderRoutePaths()
  nextTick(() => setSyncSuppressed(false))

  // ---------- 其余画布事件 ----------

  // 绑定配置变化时自动切换数据源（如属性面板修改 pointId）
  graph.on('cell:change:data', ({cell}) => {
    if (cell.isNode()) {
      dataService.rebindIfChanged(cell)
    }
  })

  graph.on('cell:click', ({cell}) => {
    console.log('点击了元素:', cell.id)
  })

  // 双击节点：派发事件给父组件（用于弹出节点详情界面）
  graph.on('node:dblclick', ({node}) => {
    emit('node-dblclick', {nodeId: node.id, shape: node.shape})
  })

  // 右键节点：弹出显示模式切换菜单
  graph.on('node:contextmenu', ({e, node}) => {
    e.preventDefault()
    e.stopPropagation()
    const nodeData = node.getData() || {}
    ctxMenu.nodeId = node.id
    ctxMenu.currentMode = nodeData.displayMode ?? undefined // null → undefined（跟随全局）
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.visible = true
  })

  // 点击画布空白处关闭右键菜单
  graph.on('blank:click', () => {
    hideCtxMenu()
  })

  graph.on('edge:connected', ({edge}) => {
    console.log(
        '连线完成:',
        edge.getSourceCellId(),
        '->',
        edge.getTargetCellId()
    )
  })

  // 派发 ready 事件
  emit('ready', {
    graph: graph as Graph,
    dnd: dnd as Dnd,
  })

  // 监听主题切换（data-theme 属性变化），同步更新画布背景与网格
  themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'data-theme') {
        // 等待 CSS 变量生效后再读取
        requestAnimationFrame(applyThemeToCanvas)
        break
      }
    }
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  // 监听容器尺寸变化，自适应画布
  resizeObserver = new ResizeObserver((entries) => {
    if (!graph) return
    for (const entry of entries) {
      const {width, height} = entry.contentRect
      if (width > 0 && height > 0) {
        graph.resize(width, height)
        if ((graph as any).scroller) {
          (graph as any).scroller.resize()
        }
      }
    }
  })
  resizeObserver.observe(containerRef.value)

  // 全局点击关闭右键菜单
  document.addEventListener('click', onDocClick)
});

// ===================== 6. 辅助函数 =====================

/** 判断节点是否需要在图标模式下压缩尺寸（形状集合统一维护在 nodeIcons.ts） */
function isMinimalShape(node: any): boolean {
  return isMinimalIconShape(node.shape)
}

/** 图标模式：保存原始尺寸并压缩所有极简视图节点（跳过有节点级覆盖的） */
function applyIconModeSizes(g: Graph) {
  for (const node of g.getNodes()) {
    if (!isMinimalShape(node)) continue
    const nodeData = node.getData() || {}
    // 有节点级覆盖且不是 icon 的，不受全局切换影响（null 表示跟随全局，不算覆盖）
    if (nodeData.displayMode != null && nodeData.displayMode !== 'icon') continue
    // 仅在尚未记录原始尺寸时保存，防止已压缩节点的紧凑尺寸覆盖真实原始尺寸
    if (!originalSizes.has(node.id)) {
      originalSizes.set(node.id, { ...node.getSize() })
    }
    node.setSize(iconModeSizeFor(nodeData))
  }
}

/** 切回完整模式：恢复各节点原始尺寸（跳过有节点级 icon 覆盖的） */
function restoreFullModeSizes(g: Graph) {
  for (const node of g.getNodes()) {
    if (!isMinimalShape(node)) continue
    const nodeData = node.getData() || {}
    // 节点级覆盖为 icon 的，不受全局切回 full 影响
    if (nodeData.displayMode === 'icon') continue
    const original = originalSizes.get(node.id)
    if (original) {
      node.setSize(original)
    }
  }
  // 只清除已恢复的条目，保留仍被覆盖的
  for (const node of g.getNodes()) {
    const nodeData = node.getData() || {}
    if (nodeData.displayMode !== 'icon') {
      originalSizes.delete(node.id)
    }
  }
}

/**
 * 应用节点动画（读取 node.data.animation 配置）
 */
function applyNodeAnimation(node: any) {
  const data = node.getData()
  if (data?.animation) {
    animationService?.setAnimation(node.id, data.animation)
  }
}

/**
 * 加载画布数据：解绑旧订阅 → 重建 cells → 重新绑定数据与动画
 */
function loadGraphData(data: GraphData) {
  if (!graph) return
  const g = graph

  dataService.unbindAllNodes()

  const x6Data = {
    cells: [
      ...data.nodes.map(n => ({...n, position: {x: n.x || 0, y: n.y || 0}})),
      ...data.edges,
    ],
  }
  g.batchUpdate(() => {
    g.clearCells()
    g.fromJSON(x6Data)
  })


  // 从画布节点初始化已用点 ID
  const generator = PointIdGenerator.getInstance()
  generator.initFromNodes(g.getNodes())

  // 重新绑定数据源
  dataService.bindAllNodes(g)

  // 应用动画
  for (const node of g.getNodes()) {
    applyNodeAnimation(node)
  }

  // 图标模式下重载后重新应用紧凑尺寸（如撤销/重做恢复了完整尺寸）
  if (editorStore.displayMode === 'icon') {
    applyIconModeSizes(g)
    syncGraphToStore()
  } else {
    // 全局为 full 时，仍需压缩有节点级 icon 覆盖的节点
    let changed = false
    for (const node of g.getNodes()) {
      if (!isMinimalShape(node)) continue
      const nodeData = node.getData() || {}
      if (nodeData.displayMode === 'icon') {
        if (!originalSizes.has(node.id)) {
          originalSizes.set(node.id, { ...node.getSize() })
        }
        node.setSize(iconModeSizeFor(nodeData))
        changed = true
      }
    }
    if (changed) syncGraphToStore()
  }

  // 全量重载会清空所有单元（含路线覆盖层），重载完成后重新绘制持久路线路径。
  // 抑制同步，避免添加覆盖层单元触发 store 回写进而再次重载。
  setSyncSuppressed(true)
  renderRoutePaths()
  nextTick(() => setSyncSuppressed(false))
}

// ===================== 7. 组件卸载前清理 =====================
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)

  resizeObserver?.disconnect()
  resizeObserver = null

  themeObserver?.disconnect()
  themeObserver = null

  dataService.dispose()

  animationService?.dispose()
  routeService?.dispose()

  if (graph) {
    graph.dispose()
    graph = null
    graphRef.value = null
  }
  dndRef.value = null
})

</script>


<style scoped>
#x6-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

#x6-container :deep(::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

#x6-container :deep(::-webkit-scrollbar-track) {
  background: var(--border-light);
  border-radius: 4px;
}

#x6-container :deep(::-webkit-scrollbar-thumb) {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

#x6-container :deep(::-webkit-scrollbar-thumb:hover) {
  background: var(--scrollbar-thumb-hover);
}

#x6-container :deep(::-webkit-scrollbar-corner) {
  background: var(--border-light);
}

/* ===== 节点右键菜单 ===== */
.node-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 150px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,.12));
  padding: 4px 0;
  user-select: none;
}
.ctx-menu-title {
  padding: 6px 14px 4px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}
.ctx-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background .15s;
}
.ctx-menu-item:hover {
  background: var(--border-light);
}
.ctx-menu-item.active {
  color: var(--color-primary);
  font-weight: 500;
}
.ctx-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}
.ctx-check {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-primary);
}
.ctx-menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--border-light);
}
</style>
