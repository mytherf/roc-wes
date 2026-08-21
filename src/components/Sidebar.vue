<!-- ══════════════════════════════════════════════════════════════════════
     Sidebar.vue - 组件库侧边栏（画布节点的“素材仓库”）

     功能：
       1. 从 nodeTemplates 注册表读取所有可拖拽的节点模板
       2. 按分组（基础 / WCS 设备 / IoT 监控）两列紧凑网格展示
       3. 鼠标按下（mousedown）即启动 X6 DnD 拖拽，松手后节点落在画布上
       4. 支持折叠为窄条，节省编辑空间
       5. 宽度可拖动调整（右缘手柄，140~480px）

     节点配置完全由 nodeTemplates 驱动：新组件只需在注册表加一条模板，
     侧边栏、拖拽、画布渲染自动生效，无需改本文件。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div
    class="sidebar"
    :class="{ collapsed: editorStore.sidebarCollapsed, resizing: sidebarResizing }"
    :style="sidebarStyle"
  >
    <!-- 宽度拖动手柄（仅展开态）：按住左右拖动调整侧栏宽度 -->
    <div
      v-if="!editorStore.sidebarCollapsed"
      class="sidebar-resize-handle"
      title="拖动调整组件库宽度"
      @mousedown.prevent="startSidebarResize"
    ></div>
    <!-- 滚动内层：内容在此滚动，拖动手柄用 absolute 定位不受滚动影响 -->
    <div class="sidebar-scroll">
    <!-- 折叠态：窄条 + 展开按钮 -->
    <template v-if="editorStore.sidebarCollapsed">
      <button class="sidebar-expand-btn" @click="editorStore.toggleSidebarCollapsed()" title="展开组件库">
        📦
      </button>
    </template>

    <!-- 展开态：完整组件库 -->
    <template v-else>
      <div class="sidebar-header">
        <h3 class="title">📦 组件库</h3>
        <!-- 帮助按钮：点击弹出使用说明气泡，点击外部关闭 -->
        <span class="sidebar-help-wrap">
          <button type="button" class="sidebar-help-btn" :aria-expanded="sidebarHintOpen" title="使用说明" @click="sidebarHintOpen = !sidebarHintOpen">?</button>
          <div v-if="sidebarHintOpen" class="sidebar-help-pop" role="note">按住组件拖拽到画布即可添加节点。</div>
        </span>
        <button class="sidebar-collapse-btn" @click="editorStore.toggleSidebarCollapsed()" title="折叠组件库">
          ◀
        </button>
      </div>

      <!-- 按分组渲染：每组一个标题 + 两列紧凑网格 -->
      <div v-for="group in groups" :key="group.name" class="group">
        <div class="group-title">{{ group.name }}</div>
        <div class="node-grid">
          <div
              v-for="item in group.items"
              :key="item.type"
              class="node-item"
              :title="item.label"
              @mousedown="handleDragStart($event, item)"
          >
            <span class="icon">{{ item.icon }}</span>
            <span class="label">{{ item.label }}</span>
          </div>
        </div>
      </div>
    </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { nodeTemplates, buildNodeConfig, type NodeTemplate } from '@/components/nodes/nodeTemplates'
import { useEditorStore } from '@/stores/editor'

// 使用说明气泡开关（点击 ? 切换，点击外部关闭）
const sidebarHintOpen = ref(false)
function onDocPointerDownForSidebarHelp(e: Event) {
  if (!sidebarHintOpen.value) return
  const t = e.target
  if (!(t instanceof Element && t.closest('.sidebar-help-wrap'))) sidebarHintOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDownForSidebarHelp))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDownForSidebarHelp))

// ===================== 侧栏宽度拖动调整 =====================
// 展开态下拖动侧栏右缘手柄即可调整宽度；折叠态不适用（固定 36px 窄条）
const SIDEBAR_WIDTH_MIN = 140
const SIDEBAR_WIDTH_MAX = 480
const SIDEBAR_WIDTH_DEFAULT = 180

/** 当前侧栏宽度（像素） */
const sidebarWidth = ref(SIDEBAR_WIDTH_DEFAULT)
/** 是否正在拖动调整宽度（拖动中禁用宽度过渡动画，避免卡顿） */
const sidebarResizing = ref(false)
// 拖动起点记录：按下时的鼠标 X 坐标与侧栏宽度
let resizeStartX = 0
let resizeStartWidth = SIDEBAR_WIDTH_DEFAULT

/** 展开态内联宽度样式（折叠态不设置，由 CSS 的 36px 接管） */
const sidebarStyle = computed(() => {
  if (editorStore.sidebarCollapsed) return {}
  return { width: `${sidebarWidth.value}px` }
})

/** 开始拖动：记录起点并在 document 上监听移动/松开 */
function startSidebarResize(e: MouseEvent) {
  resizeStartX = e.clientX
  resizeStartWidth = sidebarWidth.value
  sidebarResizing.value = true
  document.addEventListener('mousemove', onSidebarResizeMove)
  document.addEventListener('mouseup', stopSidebarResize)
  // 拖动期间全局锁定光标样式与文本选中，避免拖出侧栏后体验断裂
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

/** 拖动中：侧栏在左侧，向右拖（delta 为正）变宽，向左拖变窄 */
function onSidebarResizeMove(e: MouseEvent) {
  const delta = e.clientX - resizeStartX
  sidebarWidth.value = Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, resizeStartWidth + delta)
  )
}

/** 结束拖动：移除监听并恢复全局光标/选中 */
function stopSidebarResize() {
  sidebarResizing.value = false
  document.removeEventListener('mousemove', onSidebarResizeMove)
  document.removeEventListener('mouseup', stopSidebarResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onBeforeUnmount(() => {
  // 组件卸载时兜底清理，避免残留 document 监听器
  stopSidebarResize()
})

// 从父组件接收 graph 和 dnd 实例
const props = defineProps<{
  graph: any // Graph 实例
  dnd: any   // Dnd 实例
}>()

const editorStore = useEditorStore()

/** 分组展示顺序（未列出的分组追加在末尾） */
const GROUP_ORDER = ['基础', 'WCS 设备', 'IoT 监控']

/** 按 group 字段聚合模板，保持组内原有顺序与稳定的组间顺序 */
const groups = computed(() => {
  const map = new Map<string, NodeTemplate[]>()
  for (const item of nodeTemplates) {
    const name = item.group || '其他'
    if (!map.has(name)) map.set(name, [])
    map.get(name)!.push(item)
  }
  const ordered: { name: string; items: NodeTemplate[] }[] = []
  for (const name of GROUP_ORDER) {
    if (map.has(name)) {
      ordered.push({ name, items: map.get(name)! })
      map.delete(name)
    }
  }
  for (const [name, items] of map) ordered.push({ name, items })
  return ordered
})

/**
 * 处理鼠标按下事件，启动 Dnd 拖拽
 *
 * 节点配置完全由 nodeTemplates 注册表驱动，
 * 此处仅负责：校验依赖 → 构建配置 → 创建节点 → 启动拖拽。
 */
const handleDragStart = (e: MouseEvent, item: NodeTemplate) => {
  if (!props.dnd || !props.graph) {
    console.warn('Dnd 或 Graph 未初始化')
    return
  }

  const nodeConfig = buildNodeConfig(item)
  const node = props.graph.createNode(nodeConfig)
  props.dnd.start(node, e)
}
</script>

<style scoped>
.sidebar {
  position: relative;
  width: 180px;
  min-width: 160px;
  flex-shrink: 0;
  height: 100%;
  background: var(--sidebar-bg);
  padding: 12px 10px;
  border-right: 1px solid var(--sidebar-border);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease, padding 0.2s ease;
}

/* 拖动调整宽度期间禁用过渡动画，保证实时跟手 */
.sidebar.resizing {
  transition: none;
}

/* 宽度拖动手柄：贴在侧栏右缘，hover 时显示高亮提示可拖动 */
.sidebar-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background-color 0.15s ease;
}
.sidebar-resize-handle:hover,
.sidebar.resizing .sidebar-resize-handle {
  background: var(--color-primary);
  opacity: 0.35;
}

/* 滚动内层：侧栏内容在此纵向滚动（手柄 absolute 定位不受滚动影响） */
.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* ===== 折叠态 ===== */
.sidebar.collapsed {
  width: 36px;
  min-width: 36px;
  padding: 8px 4px;
  align-items: center;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

/* 帮助按钮定位容器（弹出气泡以此为锚点）：紧跟标题文字之后，折叠按钮靠右 */
.sidebar-help-wrap {
  position: relative;
  display: inline-flex;
  margin-left: 6px;
  margin-right: auto;
}
.sidebar-help-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid var(--sidebar-border);
  border-radius: 50%;
  background: transparent;
  color: var(--sidebar-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.sidebar-help-btn:hover {
  color: var(--sidebar-text);
  border-color: var(--sidebar-text);
}
.sidebar-help-btn[aria-expanded='true'] {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
/* 使用说明气泡（绝对定位悬浮在按钮下方，不占布局空间） */
/* 按钮紧跟标题左侧，气泡左对齐向右展开，避免溢出侧栏左边缘 */
.sidebar-help-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 168px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--sidebar-text);
  background: var(--panel-bg);
  border: 1px solid var(--sidebar-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.sidebar-collapse-btn {
  border: none;
  background: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--sidebar-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.sidebar-collapse-btn:hover {
  background: var(--sidebar-bg-hover);
  color: var(--sidebar-text);
}

.sidebar-expand-btn {
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
.sidebar-expand-btn:hover {
  background: var(--sidebar-bg-hover);
  transform: scale(1.1);
}

.title {
  margin: 0 0 2px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--sidebar-text);
  letter-spacing: -0.2px;
}

/* ===== 分组 ===== */
.group + .group {
  margin-top: 12px;
}
.group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--sidebar-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 6px;
  padding-left: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.group-title::before {
  content: '';
  width: 3px;
  height: 10px;
  border-radius: 2px;
  background: var(--color-primary);
}

/* ===== 两列紧凑网格：节点名均为短词，配合窄侧栏两列展示 ===== */
.node-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

/* ===== 单个节点卡片（紧凑：小内边距、适度放大的图标与名称） ===== */
.node-item {
  padding: 6px 2px;
  background: var(--sidebar-card-bg);
  border: 1px solid var(--sidebar-card-border);
  border-radius: var(--radius-md);
  cursor: grab;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: all 0.15s ease;
  user-select: none;
  min-width: 0;
}

.node-item:hover {
  background: var(--sidebar-bg-hover);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary), var(--shadow-md);
  transform: translateY(-1px);
}

.node-item:active {
  cursor: grabbing;
  transform: translateY(0);
  box-shadow: none;
}

.icon {
  font-size: 20px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2));
}

.label {
  font-size: 12px;
  color: var(--sidebar-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

@media (max-width: 768px) {
  .sidebar {
    width: 160px;
    min-width: 140px;
    padding: 10px 8px;
  }
  .sidebar.collapsed {
    width: 36px;
    min-width: 36px;
    padding: 8px 4px;
  }
  .title {
    font-size: 14px;
  }
  .node-item {
    padding: 3px 1px;
  }
  .icon {
    font-size: 18px;
  }
  .label {
    font-size: 10px;
  }
}

@media (max-width: 480px) {
  .sidebar {
    width: 64px;
    min-width: 64px;
    padding: 8px;
    align-items: center;
  }
  .sidebar.collapsed {
    width: 36px;
    min-width: 36px;
  }
  .title,
  .sidebar-help-wrap,
  .group-title {
    display: none;
  }
  .node-grid {
    grid-template-columns: 1fr;
  }
  .label {
    display: none;
  }
  .node-item {
    padding: 6px 2px;
  }
}
</style>
