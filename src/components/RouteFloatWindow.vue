<!-- ══════════════════════════════════════════════════════════════════════
     RouteFloatWindow.vue - 路线浮动窗口（悬浮在画布之上的小窗口）

     功能：
       1. 把底部路线面板“浮起来”，方便编辑路线时同时看清画布
       2. 标题栏拖动移动窗口（不限制边界，可拖出屏幕）
       3. 右下角手柄调整窗口大小（最小 400×240）
       4. 三个操作按钮：🗗 独立窗口（多屏）/ ⬇ 回到底部面板（dock）/ ✕ 关闭并收起到底部（close）

     与 RouteEditorDialog 的协作：
       MainLayout 用 <Teleport> 把路线编辑器挂到本组件的 #route-float-body 容器，
       从而实现“同一实例在底部面板 ↔ 浮动窗口之间无缝切换”。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div
    ref="winRef"
    class="route-float-window"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px', height: size.h + 'px' }"
  >
    <!-- 标题栏：拖拽把手 + 帮助说明 + 回到底部/关闭 -->
    <div class="rfw-header" @pointerdown="onDragStart">
      <span class="rfw-title">🛤️ 路线</span>
      <!-- 帮助按钮：点击弹出浮动窗口使用说明气泡，点击外部关闭 -->
      <span class="rfw-help-wrap" @pointerdown.stop>
        <button type="button" class="rfw-help-btn" :aria-expanded="floatHintOpen" title="浮动窗口说明" @click="floatHintOpen = !floatHintOpen">?</button>
        <div v-if="floatHintOpen" class="rfw-help-pop" role="note">浮动窗口：拖动标题栏可移动，拖动右下角手柄可调整大小。</div>
      </span>
      <div class="rfw-spacer" />
      <button class="rfw-btn" title="弹出为独立窗口（可拖到其他屏幕）" @click="onPopout">🗗</button>
      <button class="rfw-btn" title="回到底部面板" @click="emit('dock')">⬇</button>
      <button class="rfw-btn" title="关闭（收起到底部）" @click="emit('close')">✕</button>
    </div>

    <!-- 内容区：路线编辑器 Teleport 目标（#route-float-body） -->
    <div class="rfw-body" id="route-float-body"></div>

    <!-- 右下角缩放手柄 -->
    <div class="rfw-resize" @pointerdown="onResizeStart"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { openRouteWindow } from '@/platform/routeWindow'

// 浮动窗口说明气泡开关（点击 ? 切换，点击外部关闭）
const floatHintOpen = ref(false)
function onDocPointerDownForFloatHelp(e: Event) {
  if (!floatHintOpen.value) return
  const t = e.target
  if (!(t instanceof Element && t.closest('.rfw-help-wrap'))) floatHintOpen.value = false
}

const emit = defineEmits<{
  (e: 'dock'): void
  (e: 'close'): void
}>()

/** 弹出为独立 OS 窗口（Tauri 多窗口），可拖到任意显示器 */
function onPopout() {
  openRouteWindow().catch(e => console.error('[RouteFloatWindow] 打开独立窗口失败:', e))
}

const winRef = ref<HTMLElement | null>(null)

// ---------- 位置 / 尺寸 ----------
const MIN_W = 400
const MIN_H = 240
const MARGIN = 8

const pos = reactive({ x: 0, y: 0 })
const size = reactive({ w: 560, h: 400 })
let initialized = false

/** 父容器（.right-area）尺寸 */
function parentRect(): DOMRect | null {
  const parent = winRef.value?.parentElement
  return parent ? parent.getBoundingClientRect() : null
}

/**
 * 仅约束最小尺寸（拖动不做任何边界限制，窗口可自由移出画布/浏览器可视区域）
 */
function clampSize() {
  size.w = Math.max(size.w, MIN_W)
  size.h = Math.max(size.h, MIN_H)
}

/** 首次显示时按父容器尺寸计算初始位置（右侧偏上） */
function initPosition() {
  if (initialized) return
  const rect = parentRect()
  if (!rect || rect.width === 0) return
  size.w = Math.min(560, Math.max(MIN_W, rect.width - MARGIN * 2))
  size.h = Math.min(400, Math.max(MIN_H, rect.height - MARGIN * 2))
  pos.x = Math.max(MARGIN, rect.width - size.w - 24)
  pos.y = Math.max(MARGIN, 56)
  initialized = true
}

// ---------- 拖拽移动 ----------
function onDragStart(e: PointerEvent) {
  // 点在按钮上不触发拖拽
  if ((e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const origX = pos.x
  const origY = pos.y

  const onMove = (ev: PointerEvent) => {
    // 不做边界限制：允许窗口拖到任意位置（包括移出浏览器可视区域）
    pos.x = origX + (ev.clientX - startX)
    pos.y = origY + (ev.clientY - startY)
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// ---------- 右下角缩放 ----------
function onResizeStart(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  const startX = e.clientX
  const startY = e.clientY
  const origW = size.w
  const origH = size.h

  const onMove = (ev: PointerEvent) => {
    size.w = origW + (ev.clientX - startX)
    size.h = origH + (ev.clientY - startY)
    clampSize()
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// 位置不再随视口变化被强制收回边界（窗口可自由移出），因此无需监听 resize

onMounted(() => {
  initPosition()
  document.addEventListener('pointerdown', onDocPointerDownForFloatHelp)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDownForFloatHelp)
})
</script>

<style scoped>
.route-float-window {
  position: absolute;
  z-index: 40;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

/* ===== 标题栏 ===== */
.rfw-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px 0 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
  cursor: move;
  user-select: none;
  touch-action: none;
}

.rfw-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 帮助按钮定位容器（弹出气泡以此为锚点） */
.rfw-help-wrap {
  position: relative;
  display: inline-flex;
}
.rfw-help-btn {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.rfw-help-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.rfw-help-btn[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
/* 浮动窗口说明气泡（绝对定位悬浮在按钮下方，不占布局空间） */
.rfw-help-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 220px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.rfw-spacer { flex: 1; }

.rfw-btn {
  border: none;
  background: none;
  width: 26px;
  height: 24px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rfw-btn:hover { background: var(--statusbar-bg); color: var(--text-primary); }

/* ===== 内容区 ===== */
.rfw-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.rfw-body > * {
  flex: 1 1 0%;
  min-width: 0;
  height: 100%;
}

/* ===== 缩放手柄 ===== */
.rfw-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  touch-action: none;
}
.rfw-resize::after {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--text-muted);
  border-bottom: 2px solid var(--text-muted);
  opacity: 0.6;
}
</style>
