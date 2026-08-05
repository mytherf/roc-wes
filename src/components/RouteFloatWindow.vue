<template>
  <div
    ref="winRef"
    class="route-float-window"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px', height: size.h + 'px' }"
  >
    <!-- 标题栏：拖拽把手 + 回到底部/关闭 -->
    <div class="rfw-header" @pointerdown="onDragStart">
      <span class="rfw-title">🛤️ 路线</span>
      <span class="rfw-hint">浮动窗口 · 可拖动</span>
      <div class="rfw-spacer" />
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
import { ref, reactive, onMounted } from 'vue'

const emit = defineEmits<{
  (e: 'dock'): void
  (e: 'close'): void
}>()

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

.rfw-hint {
  font-size: 11px;
  color: var(--text-muted);
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
