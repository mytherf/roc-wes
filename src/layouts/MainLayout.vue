<!-- ══════════════════════════════════════════════════════════════════════
     MainLayout.vue - 主布局组件（整个编辑器的“骨架”）

     页面从上到下/从左到右的布局结构：
       ┌──────────────────────────────────────┐
       │  工具栏 EditorToolbar（占整个窗口宽度） │
       ├──────────┬──────────────┬────────────┤
       │  侧边栏   │ 画布 X6Canvas │  属性面板   │
       │ Sidebar  │              │PropertyPanel│
       │ (组件库) │              │            │
       │          ├──────────────┴────────────┤
       │          │ 路线面板 BottomPanel / 状态栏│
       └──────────┴───────────────────────────┘

     职责：
       1. 组装所有大组件（侧边栏、画布、属性面板、工具栏、状态栏等）
       2. 协调跨组件通信：画布就绪后把 graph/dnd 实例分发给子组件
       3. 管理全局主题初始化（useThemeStore）
       4. 管理路线编辑器的两种形态：停靠底部面板 / 浮动窗口（Teleport 切换）
       5. 处理节点双击 → 弹出详情对话框
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="app-container">
    <!-- 顶部：工具栏（占整个窗口宽度） -->
    <EditorToolbar :graph="graphInstance" :canvas-ref="canvasRef" />
    <!-- 下方主区域：侧边栏 + 右侧工作区 -->
    <div class="main-row">
      <!-- 左侧：组件库侧边栏 -->
      <Sidebar v-if="graphInstance && dndInstance" :graph="graphInstance" :dnd="dndInstance" />
      <!-- 右侧区域 -->
      <div class="right-area">
        <!-- 中间：画布 + 属性面板 -->
        <div class="bottom-area">
          <div class="canvas-wrapper">
            <X6Canvas ref="canvasRef" @ready="onCanvasReady" @node-dblclick="onNodeDblClick" />
          </div>
          <PropertyPanel :canvas-ref="canvasRef" />
        </div>
        <!-- 底部：路线面板（可折叠；浮动模式下隐藏） -->
        <BottomPanel v-show="!editorStore.routeFloating" :canvas-ref="canvasRef" />
        <!-- 底部：状态栏 -->
        <StatusBar :graph="graphInstance" />

        <!-- 路线浮动窗口（悬浮于画布之上，可拖拽/缩放） -->
        <RouteFloatWindow
          v-show="editorStore.routeFloating"
          @dock="onFloatDock"
          @close="onFloatClose"
        />

        <!-- 路线编辑器单实例：通过 Teleport 在 停靠容器 / 浮动窗口 之间切换，
             切换时组件实例与编辑状态（选中路线、绘制模式等）保持不变。
             defer：目标容器由同级组件渲染，需等应用挂载完成后再解析目标 -->
        <Teleport defer :to="editorStore.routeFloating ? '#route-float-body' : '#bottom-panel-content'">
          <RouteEditorDialog :canvas-ref="canvasRef" :active="routeActive" />
        </Teleport>
      </div>
    </div>

    <!-- 节点详情弹窗（双击节点触发） -->
    <NodeDetailDialog
      v-if="detailNodeId && graphInstance"
      :node-id="detailNodeId"
      :graph="graphInstance"
      @close="detailNodeId = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Sidebar from '@/components/Sidebar.vue'
import X6Canvas from '@/components/X6Canvas.vue'
import PropertyPanel from '@/components/PropertyPanel.vue'
import BottomPanel from '@/components/BottomPanel.vue'
import RouteFloatWindow from '@/components/RouteFloatWindow.vue'
import RouteEditorDialog from '@/components/RouteEditorDialog.vue'
import EditorToolbar from '@/components/EditorToolbar.vue'
import StatusBar from '@/components/StatusBar.vue'
import NodeDetailDialog from '@/components/NodeDetailDialog.vue'
import { useThemeStore } from '@/stores/theme'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'

// 初始化主题（从 theme.json 文件恢复用户选择并设置 data-theme 属性）
useThemeStore()

// 率先初始化工程 store（读索引/迁移旧数据），
// 其余 store（画布/数据源/路线）均 await 其 ready 后再加载各自的工程数据
useProjectStore()

const editorStore = useEditorStore()

const canvasRef = ref<InstanceType<typeof X6Canvas>>()
// X6 Graph 实例（画布就绪后由 X6Canvas 通过 ready 事件传出，供工具栏/侧边栏使用）
const graphInstance = ref(null)
// X6 DnD 实例（拖拽组件库条目到画布即可创建节点）
const dndInstance = ref(null)

// 节点详情弹窗状态
const detailNodeId = ref<string | null>(null)

// 路线编辑器激活状态：浮动模式下始终激活；停靠模式下仅在面板展开时激活
const routeActive = computed(() =>
  editorStore.routeFloating ? true : !editorStore.bottomCollapsed
)

/** 浮动窗口「回到底部面板」：恢复停靠并展开 */
function onFloatDock() {
  editorStore.setRouteFloating(false)
  editorStore.setBottomCollapsed(false)
}

/** 浮动窗口「关闭」：恢复停靠并收起为标题条 */
function onFloatClose() {
  editorStore.setRouteFloating(false)
  editorStore.setBottomCollapsed(true)
}

const onCanvasReady = (payload: { graph: any; dnd: any }) => {
  // 子组件 X6Canvas 就绪后回调：拿到 Graph 与 DnD 实例，
  // 供 Sidebar（拖拽建节点）和 EditorToolbar（操作画布）等兄弟组件使用
  graphInstance.value = payload.graph
  dndInstance.value = payload.dnd
}

/**
 * 双击节点 → 弹出详情界面
 * 货架节点（rack-node）已有专属的正视图弹窗，跳过通用详情
 */
const onNodeDblClick = (payload: { nodeId: string; shape: string }) => {
  if (payload.shape === 'rack-node') return
  detailNodeId.value = payload.nodeId
}
</script>

<style>
/* ═══════════════════════════════════════════════
   主题 1：暗色工业（默认）
   深色侧边栏 + 亮色工作区，沉稳专业
   ═══════════════════════════════════════════════ */
:root,
[data-theme='industrial'] {
  --color-primary: #2563eb;
  --color-primary-hover: #3b82f6;
  --color-primary-light: rgba(37, 99, 235, 0.08);
  --color-primary-ring: rgba(37, 99, 235, 0.15);
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  --sidebar-bg: #1e293b;
  --sidebar-bg-hover: #334155;
  --sidebar-text: #e2e8f0;
  --sidebar-text-muted: #94a3b8;
  --sidebar-border: #334155;
  --sidebar-card-bg: #273548;
  --sidebar-card-border: #3b4f66;

  --canvas-bg: #f8fafc;
  --canvas-grid: #e2e8f0;
  --panel-bg: #ffffff;
  --toolbar-bg: #ffffff;
  --statusbar-bg: #f1f5f9;

  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;

  --border-color: #e2e8f0;
  --border-light: #f1f5f9;
  /* 输入框专用：微灰凹陷背景 + 更清晰的边框，悬停/聚焦态逐级增强 */
  --input-bg: #f8fafc;
  --input-border: #cbd5e1;
  --input-border-hover: #94a3b8;
  /* 分割线专用：比 border-light 更强的对比度 */
  --divider-color: #dbe3ee;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  --font-sans: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace;

  --scrollbar-thumb: #cbd5e1;
  --scrollbar-thumb-hover: #94a3b8;
}

/* ═══════════════════════════════════════════════
   主题 2：亮色现代
   全亮色设计，清爽通透，适合日间办公
   ═══════════════════════════════════════════════ */
[data-theme='light'] {
  --color-primary: #0ea5e9;
  --color-primary-hover: #38bdf8;
  --color-primary-light: rgba(14, 165, 233, 0.06);
  --color-primary-ring: rgba(14, 165, 233, 0.15);
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  --sidebar-bg: #f8fafc;
  --sidebar-bg-hover: #f1f5f9;
  --sidebar-text: #334155;
  --sidebar-text-muted: #94a3b8;
  --sidebar-border: #e2e8f0;
  --sidebar-card-bg: #ffffff;
  --sidebar-card-border: #e2e8f0;

  --canvas-bg: #ffffff;
  --canvas-grid: #f1f5f9;
  --panel-bg: #ffffff;
  --toolbar-bg: #ffffff;
  --statusbar-bg: #f8fafc;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;

  --border-color: #e2e8f0;
  --border-light: #f1f5f9;
  /* 输入框专用：亮色主题下用浅灰底 + 清晰边框区分控件 */
  --input-bg: #f8fafc;
  --input-border: #cbd5e1;
  --input-border-hover: #7dd3fc;
  /* 分割线专用 */
  --divider-color: #dbe3ee;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 8px -2px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 12px 20px -4px rgba(0, 0, 0, 0.08);

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --scrollbar-thumb: #e2e8f0;
  --scrollbar-thumb-hover: #cbd5e1;
}

/* ═══════════════════════════════════════════════
   主题 3：深蓝科技
   深蓝底色 + 青蓝高亮，沉浸式科技监控风
   ═══════════════════════════════════════════════ */
[data-theme='ocean'] {
  --color-primary: #06b6d4;
  --color-primary-hover: #22d3ee;
  --color-primary-light: rgba(6, 182, 212, 0.1);
  --color-primary-ring: rgba(6, 182, 212, 0.2);
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;

  --sidebar-bg: #0c1929;
  --sidebar-bg-hover: #162a42;
  --sidebar-text: #cbd5e1;
  --sidebar-text-muted: #64748b;
  --sidebar-border: #1e3a5f;
  --sidebar-card-bg: #12263e;
  --sidebar-card-border: #1e3a5f;

  --canvas-bg: #0f1f33;
  --canvas-grid: #1e3a5f;
  --panel-bg: #132a44;
  --toolbar-bg: #0f2137;
  --statusbar-bg: #0c1929;

  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --border-color: #1e3a5f;
  --border-light: #162a42;
  /* 输入框专用：比面板更深的凹陷背景 + 明显的蓝边框，暗色下层次清晰 */
  --input-bg: #0e2135;
  --input-border: #2d5a8a;
  --input-border-hover: #3f7cb8;
  /* 分割线专用：深蓝主题下 border-light 过暗，适当提亮 */
  --divider-color: #24466b;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.4);

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  --scrollbar-thumb: #1e3a5f;
  --scrollbar-thumb-hover: #2d5a8a;
}

/* ═══════════════════════════════════════════════
   全局基础样式
   ═══════════════════════════════════════════════ */
* {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 主题切换过渡（仅颜色属性） */
.app-container,
.editor-toolbar,
.sidebar,
.property-panel,
.status-bar {
  transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}

.app-container {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: var(--canvas-bg);
}

/* 主区域：侧边栏 + 右侧工作区（工具栏之下，横向排列） */
.main-row {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
}

.right-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  /* 作为路线浮动窗口的定位上下文 */
  position: relative;
}

.bottom-area {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.canvas-wrapper {
  flex: 1 1 0%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--canvas-bg);
}

/* 全局滚动条美化 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}
</style>