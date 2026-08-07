// ========== 路线独立窗口（多屏支持）==========
// 浮动窗口本质是 WebView 内的 DOM 元素，拖出窗口范围就会被裁剪，
// 无法真正显示在第二块屏幕上。要支持多屏，必须借助 Tauri 多窗口能力：
// 把路线编辑器放进一个独立的 OS 窗口（label: route-editor），
// 用户可以把它拖到任意显示器。
//
// 两种运行形态：
// 1. Tauri 桌面壳：用 @tauri-apps/api 的 WebviewWindow 创建真实 OS 窗口
// 2. 纯浏览器（开发模式）：退化为 window.open 打开新标签页

import { isTauri } from './isTauri'

/** 独立窗口的 label（全应用唯一；重复点击弹出时复用已有窗口并置前） */
export const ROUTE_WINDOW_LABEL = 'route-editor'

/**
 * 打开路线编辑器独立窗口（可拖到任意屏幕）
 *
 * - 窗口已存在：直接置前并聚焦，不重复创建
 * - Tauri 环境：创建 OS 级窗口，加载 /route-window 路由
 * - 浏览器环境：window.open 打开新标签页（数据同样实时同步）
 */
export async function openRouteWindow(): Promise<void> {
  // 浏览器开发模式：新标签页打开
  if (!isTauri()) {
    window.open('/route-window', '_blank', 'noopener')
    return
  }

  // 动态导入 Tauri API（浏览器环境不会执行到这里，避免无谓打包依赖问题）
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  // 已存在则复用并聚焦
  const existing = await WebviewWindow.getByLabel(ROUTE_WINDOW_LABEL)
  if (existing) {
    await existing.unminimize().catch(() => {})
    await existing.setFocus().catch(() => {})
    return
  }

  // 创建新窗口：独立 OS 窗口，可自由拖动到任意显示器
  const win = new WebviewWindow(ROUTE_WINDOW_LABEL, {
    url: '/route-window',
    title: 'RocWes · 路线编辑器',
    width: 800,
    height: 600,
    minWidth: 520,
    minHeight: 380,
    center: true,
    resizable: true,
  })

  // 创建失败（如权限问题）时输出日志，便于排查
  win.once('tauri://error', (e) => {
    console.error('[RouteWindow] 创建路线独立窗口失败:', e)
  })
}
