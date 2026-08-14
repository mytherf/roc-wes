<!-- ══════════════════════════════════════════════════════════════════════
     BottomPanel.vue - 底部路线面板（停靠形态的路线编辑区）

     功能：
       1. 提供一个底部容器（默认内容高度 260px），顶部边缘可上下拖动调整高度
       2. 头部两个按钮：🗗 弹出独立窗口 / ▼▲ 折叠或展开面板
       3. 弹出独立窗口后面板收为窄条，仅保留入口标签（类似属性面板折叠态）；
          再点标签聚焦独立窗口，独立窗口关闭后才恢复完整面板，两者互斥
       4. 内容区（#bottom-panel-content）是 RouteEditorDialog 的 Teleport 目标，
          由 MainLayout 挂载——折叠时用 v-show 隐藏但不销毁，保留编辑状态
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div
    class="bottom-panel"
    :class="{ collapsed: editorStore.bottomCollapsed, popped: editorStore.routeWindowOpen, resizing: panelResizing }"
  >
    <!-- 高度拖动手柄（仅展开态且未弹出独立窗口）：按住上下拖动调整面板高度 -->
    <div
      v-if="!editorStore.bottomCollapsed && !editorStore.routeWindowOpen"
      class="bp-resize-handle"
      title="拖动调整面板高度"
      @mousedown.prevent="startPanelResize"
    ></div>

    <!-- 弹出态：窄条仅保留入口标签（隐藏所有按钮，类似属性面板折叠态），
         点击聚焦已打开的独立窗口 -->
    <button
      v-if="editorStore.routeWindowOpen"
      class="bp-popout-tab"
      title="路线编辑器已在独立窗口中打开，点击聚焦该窗口"
      @click="onPopout"
    >
      <span class="bp-popout-label">🛤️ 路线（独立窗口）</span>
    </button>

    <!-- 头部：标题 + 弹出独立窗口 + 折叠开关（弹出态不显示） -->
    <div class="bottom-panel-header" v-if="!editorStore.routeWindowOpen">
      <span class="bp-title">🛤️ 路线</span>
      <div class="bp-spacer" />
      <button
        class="bp-collapse-btn"
        title="弹出为独立窗口（可拖到其他屏幕）"
        @click="onPopout"
      >🗗</button>
      <button
        class="bp-collapse-btn"
        :title="editorStore.bottomCollapsed ? '展开面板' : '折叠面板'"
        @click="editorStore.toggleBottomCollapsed()"
      >{{ editorStore.bottomCollapsed ? '▲' : '▼' }}</button>
    </div>

    <!-- 内容区：路线编辑器由 MainLayout 通过 Teleport 挂载到此容器（#bottom-panel-content），
         折叠/弹出时隐藏（保留编辑状态） -->
    <div
      class="bottom-panel-content"
      id="bottom-panel-content"
      v-show="!editorStore.bottomCollapsed && !editorStore.routeWindowOpen"
      :style="{ height: contentHeight + 'px' }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { openRouteWindow } from '@/platform/routeWindow'

defineProps<{
  canvasRef: any
}>()

const editorStore = useEditorStore()

/** 弹出为独立 OS 窗口（Tauri 多窗口），可拖到任意显示器。
 *  - 首次弹出：面板收为窄条（仅保留入口标签），与独立窗口互斥
 *  - 已弹出时再点（入口标签）：openRouteWindow 复用已有窗口并置前聚焦
 *  - 独立窗口关闭：回调恢复完整底部面板 */
function onPopout() {
  openRouteWindow(() => {
    // 独立窗口关闭/还原：恢复底部路线面板
    editorStore.setRouteWindowOpen(false)
    editorStore.setBottomCollapsed(false)
  })
    .then(() => {
      editorStore.setRouteWindowOpen(true)
      editorStore.setBottomCollapsed(true)
    })
    .catch(e => console.error('[BottomPanel] 打开独立窗口失败:', e))
}

// ---------- 面板高度拖动（顶部边缘上下拖动调整） ----------
const CONTENT_HEIGHT_MIN = 120
const CONTENT_HEIGHT_MAX = 600
const contentHeight = ref(260) // 内容区高度（不含头部标题条）
const panelResizing = ref(false) // 拖动中：禁用过渡动画，保证跟手
let resizeStartY = 0
let resizeStartHeight = 0

/** 开始拖动：记录起始位置与高度，监听全局鼠标移动 */
function startPanelResize(e: MouseEvent) {
  resizeStartY = e.clientY
  resizeStartHeight = contentHeight.value
  panelResizing.value = true
  document.addEventListener('mousemove', onPanelResizeMove)
  document.addEventListener('mouseup', stopPanelResize)
  // 拖动期间全局锁定光标样式与文本选中，避免拖出面板后体验断裂
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

/** 拖动中：面板在底部，向上拖（delta 为正）变高，向下拖变矮 */
function onPanelResizeMove(e: MouseEvent) {
  const delta = resizeStartY - e.clientY
  contentHeight.value = Math.min(
    CONTENT_HEIGHT_MAX,
    Math.max(CONTENT_HEIGHT_MIN, resizeStartHeight + delta)
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
</script>

<style scoped>
.bottom-panel {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border-top: 1px solid var(--border-color);
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

/* 拖动调整高度期间禁用过渡动画，保证实时跟手 */
.bottom-panel.resizing {
  transition: none;
}

/* 高度拖动手柄：贴在面板顶缘，hover 时显示高亮提示可拖动 */
.bp-resize-handle {
  position: absolute;
  left: 0;
  top: -2px;
  width: 100%;
  height: 5px;
  cursor: row-resize;
  z-index: 10;
  background: transparent;
  transition: background-color 0.15s ease;
}
.bp-resize-handle:hover,
.bottom-panel.resizing .bp-resize-handle {
  background: var(--color-primary);
  opacity: 0.35;
}

/* ===== 头部条 ===== */
.bottom-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
}
.bottom-panel.collapsed .bottom-panel-header {
  border-bottom: none;
}

.bp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.bp-spacer { flex: 1; }

.bp-collapse-btn {
  border: none;
  background: none;
  width: 28px;
  height: 24px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bp-collapse-btn:hover { background: var(--statusbar-bg); color: var(--text-primary); }

/* 弹出态：收为窄条，仅保留入口标签（类似属性面板折叠态） */
.bottom-panel.popped {
  height: 30px;
  overflow: hidden;
}

/* 弹出态入口标签：点击聚焦已打开的独立窗口 */
.bp-popout-tab {
  border: none;
  background: none;
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 12px;
  cursor: pointer;
}
.bp-popout-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 1px;
}
.bp-popout-tab:hover {
  background: var(--statusbar-bg);
}
.bp-popout-tab:hover .bp-popout-label {
  color: var(--color-primary);
}

/* ===== 内容区 ===== */
/* 高度由拖动状态 contentHeight 内联控制（默认 260px） */
.bottom-panel-content {
  display: flex;
  overflow: hidden;
}
.bottom-panel-content > * {
  flex: 1 1 0%;
  min-width: 0;
  height: 100%;
}
</style>
