// ========== 节点事件告警弹窗（单例） ==========
// 背景：属性面板「事件」标签页可配置 alert 动作。早期实现直接调用 window.alert，
// 每次触发都会生成一个新的系统对话框，条件频繁满足时弹窗会不断堆叠。
//
// 本模块提供应用内单例告警弹窗：
// - 同一规则（key = `${nodeId}:${ruleId}`）第一次触发时创建弹窗；
// - 该规则再次触发时不再新建弹窗，而是「聚焦」已有弹窗：
//   置顶、闪烁提示并刷新告警内容与时间；
// - 弹窗为非模态浮窗，不阻塞画布操作，可通过右上角 × 或 Esc 关闭，
//   关闭后再次触发会重新创建。

/** 已打开的告警弹窗（key: `${nodeId}:${ruleId}`） */
const openDialogs = new Map<string, HTMLDivElement>()

/** z-index 计数器：新弹窗/聚焦的弹窗始终置于最上层 */
let zIndexCounter = 9100

/** 级联偏移计数：多个不同规则的弹窗错开位置，避免完全重叠 */
let cascadeCounter = 0

/** 样式是否已注入 */
let styleInjected = false

/** 注入一次全局样式（跟随主题 CSS 变量） */
function injectStyle() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
.event-alert-dialog {
  position: fixed;
  min-width: 320px;
  max-width: 420px;
  background: var(--panel-bg, #1a1d23);
  color: var(--text-primary, #e8e8e8);
  border: 1px solid var(--border-color, #2d3039);
  border-left: 4px solid #e6a23c;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  outline: none;
  user-select: none;
}
.event-alert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
  cursor: move;
}
.event-alert-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-alert-close {
  border: none;
  background: transparent;
  color: var(--text-primary, #e8e8e8);
  opacity: 0.6;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
}
.event-alert-close:hover { opacity: 1; }
.event-alert-body {
  padding: 0 12px 8px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
  user-select: text;
}
.event-alert-time {
  padding: 0 12px 10px;
  font-size: 11px;
  opacity: 0.6;
}
.event-alert-dialog.flash {
  animation: event-alert-flash 0.6s ease-out;
}
@keyframes event-alert-flash {
  0%   { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.8); }
  50%  { box-shadow: 0 0 0 10px rgba(230, 162, 60, 0); }
  100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); }
}
`
  document.head.appendChild(style)
}

/** 关闭并从登记表中移除弹窗 */
function closeDialog(key: string) {
  const el = openDialogs.get(key)
  if (!el) return
  openDialogs.delete(key)
  el.remove()
}

/** 置顶并播放闪烁动画（重复聚焦时先移除类再重新触发） */
function bringToFront(el: HTMLDivElement) {
  el.style.zIndex = String(++zIndexCounter)
  el.classList.remove('flash')
  // 强制 reflow，确保重复添加 class 时动画能重新播放
  void el.offsetWidth
  el.classList.add('flash')
  el.focus()
}

/** 格式化时间戳为 HH:mm:ss */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * 为弹窗绑定头部拖拽移动
 *
 * 拖拽手柄为标题栏（关闭按钮除外）：pointerdown 时将初始的 calc 定位
 * 换算为 px，随后跟随指针移动；位置限制在视窗内，避免拖出屏幕找不回。
 */
function makeDraggable(el: HTMLDivElement, handle: HTMLElement) {
  handle.addEventListener('pointerdown', (e) => {
    // 点击关闭按钮不触发拖拽
    if ((e.target as HTMLElement).closest('.event-alert-close')) return
    e.preventDefault()

    // 初始位置换算为 px（首次拖拽前可能是 calc 定位）
    const rect = el.getBoundingClientRect()
    let left = rect.left
    let top = rect.top
    el.style.left = `${left}px`
    el.style.top = `${top}px`

    const startX = e.clientX
    const startY = e.clientY
    handle.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      left = ev.clientX - startX + rect.left
      top = ev.clientY - startY + rect.top
      // 限制在视窗内（至少保留 40px 可见，方便拖回）
      const maxLeft = window.innerWidth - 40
      const maxTop = window.innerHeight - 24
      left = Math.min(Math.max(left, -(rect.width - 40)), maxLeft)
      top = Math.min(Math.max(top, 0), maxTop)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }
    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  })
}

/**
 * 展示节点事件告警弹窗（单例）
 *
 * 同一 key 的弹窗已打开时：聚焦已有弹窗（置顶 + 闪烁 + 刷新内容），不新建；
 * 否则创建新弹窗。
 *
 * @param key     弹窗唯一标识（建议使用 `${nodeId}:${ruleId}`）
 * @param title   标题（规则名称或 ID）
 * @param message 告警内容
 */
export function showEventAlert(key: string, title: string, message: string) {
  injectStyle()

  // —— 已打开：聚焦第一次创建的弹窗，不重新生成 ——
  const existing = openDialogs.get(key)
  if (existing && existing.isConnected) {
    const body = existing.querySelector('.event-alert-body')
    const time = existing.querySelector('.event-alert-time')
    if (body) body.textContent = message
    if (time) time.textContent = `最近触发：${formatTime(Date.now())}`
    bringToFront(existing)
    return
  }

  // —— 首次触发：创建弹窗 ——
  const el = document.createElement('div')
  el.className = 'event-alert-dialog'
  el.setAttribute('role', 'alertdialog')
  el.tabIndex = -1

  // 级联定位：多个弹窗依次错开，避免完全重叠
  const offset = (cascadeCounter++ % 6) * 28
  el.style.left = `calc(50% - 160px + ${offset}px)`
  el.style.top = `calc(18% + ${offset}px)`

  const header = document.createElement('div')
  header.className = 'event-alert-header'

  const titleEl = document.createElement('span')
  titleEl.className = 'event-alert-title'
  titleEl.textContent = `⚠ ${title}`
  titleEl.title = title

  const closeBtn = document.createElement('button')
  closeBtn.className = 'event-alert-close'
  closeBtn.textContent = '×'
  closeBtn.title = '关闭'
  closeBtn.addEventListener('click', () => closeDialog(key))

  const body = document.createElement('div')
  body.className = 'event-alert-body'
  body.textContent = message

  const time = document.createElement('div')
  time.className = 'event-alert-time'
  time.textContent = `最近触发：${formatTime(Date.now())}`

  header.appendChild(titleEl)
  header.appendChild(closeBtn)
  el.appendChild(header)
  el.appendChild(body)
  el.appendChild(time)

  // Esc 关闭
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDialog(key)
  })
  // 点击弹窗任意位置即视为聚焦（置顶）
  el.addEventListener('pointerdown', () => bringToFront(el))
  // 标题栏拖拽移动
  makeDraggable(el, header)

  openDialogs.set(key, el)
  document.body.appendChild(el)
  bringToFront(el)
}

/**
 * 关闭指定规则已打开的告警弹窗（可选：规则被删除/禁用时调用）
 */
export function closeEventAlert(key: string) {
  closeDialog(key)
}
