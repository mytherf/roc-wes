<!-- ══════════════════════════════════════════════════════════════════════
     PropertyPanel.vue - 属性面板（选中元素的"设置窗口"）薄壳

     点击画布上的元素后，这里会展示它的全部可编辑属性：
       1. 画布属性：点击画布空白处 → CanvasPropsSection（背景色 / 网格）
       2. 节点属性：选中节点 → 四个标签页子组件——
          - 基础（NodeBasicTab）：ID、名称、类型、标签、图标、货架维度、位置与尺寸
          - 绑定（NodeBindingTab）：把节点绑定到数据源点位，实现实时数据驱动
          - 路线（NodeRouteTab）：选择路线、设置速度、启动/停止路线运动
          - 事件（NodeEventsTab）：配置条件触发规则（如"温度超限变红"）
       3. 连线属性：标签编辑

     本组件只负责面板壳（折叠/宽度拖动/标签栏切换）与共享装配：
     实例化绑定模型 useNodeBinding 后 provide，绑定/事件标签页 inject 共享。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div
    class="property-panel"
    :class="{ collapsed: editorStore.propertyCollapsed, resizing: panelResizing }"
    :style="panelStyle"
  >
    <!-- 宽度拖动手柄（仅展开态）：按住左右拖动调整面板宽度 -->
    <div
      v-if="!editorStore.propertyCollapsed"
      class="panel-resize-handle"
      title="拖动调整面板宽度"
      @mousedown.prevent="startPanelResize"
    ></div>
    <!-- 滚动内层：面板内容在此滚动，拖动手柄用 absolute 定位不受滚动影响 -->
    <div class="panel-scroll">
    <!-- 折叠态：窄条 + 展开图标按钮（仅图标，点击图标展开；与组件库折叠态交互统一） -->
    <template v-if="editorStore.propertyCollapsed">
      <button class="panel-expand-tab" @click="editorStore.togglePropertyCollapsed()" title="展开属性面板">
        🛠️
      </button>
    </template>

    <!-- 展开态：完整属性面板 -->
    <template v-else>
      <div class="panel-header">
        <h3>🛠️ 属性面板</h3>
        <button class="panel-collapse-btn" @click="editorStore.togglePropertyCollapsed()" title="折叠属性面板">
          ▶
        </button>
      </div>

      <!-- 未选中任何元素 -->
      <div v-if="!element && !canvasSelected" class="empty">请选择一个元素</div>

      <!-- ====== 画布属性（点击画布空白处） ====== -->
      <CanvasPropsSection v-else-if="canvasSelected" :canvas-ref="canvasRef" />

      <!-- 已选中元素 -->
      <div v-else-if="element">
        <!-- ====== 节点：四个标签页 ====== -->
        <template v-if="element.type === 'node'">
          <!-- 标签栏 -->
          <div class="panel-tabs">
            <div class="panel-tab" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础</div>
            <div class="panel-tab" :class="{ active: activeTab === 'binding' }" @click="activeTab = 'binding'">绑定</div>
            <div class="panel-tab" :class="{ active: activeTab === 'route' }" @click="activeTab = 'route'">路线</div>
            <div class="panel-tab" :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">事件</div>
          </div>

          <!-- v-show 常驻挂载（非隐藏 tab 也保持组件存活）：
               事件规则的加载/提交 watch 不因切换标签页而中断 -->
          <NodeBasicTab v-show="activeTab === 'basic'" :element="element" :canvas-ref="canvasRef" />
          <NodeBindingTab v-show="activeTab === 'binding'" />
          <NodeRouteTab v-show="activeTab === 'route'" :canvas-ref="canvasRef" />
          <NodeEventsTab v-show="activeTab === 'events'" :canvas-ref="canvasRef" />
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
    </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useNodeBinding, NODE_BINDING_KEY } from '@/composables/useNodeBinding'
import { PANEL_STATE_KEY } from './propertyPanel/panelState'
import CanvasPropsSection from './propertyPanel/CanvasPropsSection.vue'
import NodeBasicTab from './propertyPanel/NodeBasicTab.vue'
import NodeBindingTab from './propertyPanel/NodeBindingTab.vue'
import NodeRouteTab from './propertyPanel/NodeRouteTab.vue'
import NodeEventsTab from './propertyPanel/NodeEventsTab.vue'

const editorStore = useEditorStore()

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
// 是否选中画布本身
const canvasSelected = computed(() => editorStore.canvasSelected)

// ===================== 共享绑定模型（provide → 绑定/事件标签页 inject） =====================
// 绑定标签页编辑点组、事件标签页读取监听字段选项，共享同一份状态保证两页数据一致
provide(NODE_BINDING_KEY, useNodeBinding(getGraph, props.canvasRef, element))

// ===================== 面板宽度拖动调整 =====================
// 展开态下拖动面板左缘手柄即可调整宽度；折叠态不适用（固定 32px 窄条）
const PANEL_WIDTH_MIN = 200
const PANEL_WIDTH_MAX = 600
const PANEL_WIDTH_DEFAULT = 300

/** 当前面板宽度（像素） */
const panelWidth = ref(PANEL_WIDTH_DEFAULT)
/** 是否正在拖动调整宽度（拖动中禁用宽度过渡动画，避免卡顿） */
const panelResizing = ref(false)
// 拖动起点记录：按下时的鼠标 X 坐标与面板宽度
let resizeStartX = 0
let resizeStartWidth = PANEL_WIDTH_DEFAULT

/** 展开态内联宽度样式（折叠态不设置，由 CSS 的 32px 接管） */
const panelStyle = computed(() => {
  if (editorStore.propertyCollapsed) return {}
  return { width: `${panelWidth.value}px` }
})

/** 开始拖动：记录起点并在 document 上监听移动/松开 */
function startPanelResize(e: MouseEvent) {
  resizeStartX = e.clientX
  resizeStartWidth = panelWidth.value
  panelResizing.value = true
  document.addEventListener('mousemove', onPanelResizeMove)
  document.addEventListener('mouseup', stopPanelResize)
  // 拖动期间全局锁定光标样式与文本选中，避免拖出面板后体验断裂
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

/** 拖动中：面板在右侧，向左拖（delta 为正）变宽，向右拖变窄 */
function onPanelResizeMove(e: MouseEvent) {
  const delta = resizeStartX - e.clientX
  panelWidth.value = Math.min(
    PANEL_WIDTH_MAX,
    Math.max(PANEL_WIDTH_MIN, resizeStartWidth + delta)
  )
}

/** 结束拖动：移除监听并恢复全局光标/选中 */
function stopPanelResize() {
  panelResizing.value = false
  document.removeEventListener('mousemove', onPanelResizeMove)
  document.removeEventListener('mouseup', stopPanelResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onBeforeUnmount(() => {
  // 组件卸载时兜底清理，避免残留 document 监听器
  stopPanelResize()
})

// ===================== 标签页状态（基础属性 / 数据绑定 / 路线 / 事件） =====================
type PanelTab = 'basic' | 'binding' | 'route' | 'events'
const activeTab = ref<PanelTab>('basic')

// 面板级状态共享：事件标签页切换选中节点时经 useNodeEvents 重置回基础页
provide(PANEL_STATE_KEY, { activeTab })

// ===================== 连线标签更新 =====================
function updateEdgeLabel() {
  if (!element.value || element.value.type !== 'edge') return
  editorStore.updateEdge(element.value.data.id, { label: element.value.data.label })
}
</script>

<style scoped>
/* edge 区块复用共享字段样式（.field/.id-value 等） */
@import './propertyPanel/panelShared.css';

/* ===================== 面板整体样式 ===================== */
.property-panel {
  position: relative;
  width: 240px;
  min-width: 200px;
  flex-shrink: 0;
  height: 100%;
  background: var(--panel-bg);
  padding: 18px;
  border-left: 1px solid var(--border-color);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease, padding 0.2s ease;
}

/* 拖动调整宽度期间禁用过渡动画，保证实时跟手 */
.property-panel.resizing {
  transition: none;
}

/* 宽度拖动手柄：贴在面板左缘，hover 时显示高亮提示可拖动 */
.panel-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background-color 0.15s ease;
}
.panel-resize-handle:hover,
.property-panel.resizing .panel-resize-handle {
  background: var(--color-primary);
  opacity: 0.35;
}

/* 滚动内层：面板内容在此纵向滚动（手柄 absolute 定位不受滚动影响） */
.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ===== 折叠态 ===== */
.property-panel.collapsed {
  width: 32px;
  min-width: 32px;
  padding: 8px 2px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.panel-header h3 {
  margin: 0;
}

.panel-collapse-btn {
  border: none;
  background: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.panel-collapse-btn:hover {
  background: var(--statusbar-bg);
  color: var(--text-primary);
}

/* 折叠态展开图标按钮：仅图标，点击图标展开（样式与组件库 .sidebar-expand-btn 统一） */
.panel-expand-tab {
  border: none;
  background: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-top: 4px;
}
.panel-expand-tab:hover {
  background: var(--statusbar-bg);
  transform: scale(1.1);
}

.property-panel h3 {
  margin: 0 0 8px 0;
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

/* ===================== 标签页栏 ===================== */
.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 10px;
  gap: 2px;
}
.panel-tab {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
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

/* ===================== 响应式适配 ===================== */
@media (max-width: 768px) {
  .property-panel {
    width: 200px;
    padding: 12px;
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
</style>
