// ========== 独立窗口（多屏支持）==========
// 浮动窗口本质是 WebView 内的 DOM 元素，拖出窗口范围就会被裁剪，
// 无法真正显示在第二块屏幕上。要支持多屏，必须借助 Tauri 多窗口能力：
// 把路线编辑器放进一个独立的 OS 窗口（label: route-editor），
// 用户可以把它拖到任意显示器。运行预览同理（label: run-preview，加载 /run）。
//
// 实现方式：用 @tauri-apps/api 的 WebviewWindow 创建真实 OS 窗口。
// 注意：不能用 window.open 打开应用内路由——Tauri WebView 会静默拦截，
// 必须创建 WebviewWindow（且 label 需在 capabilities 的 windows 中声明）。
// 项目为纯桌面版（必须 npx tauri dev 启动），不提供浏览器降级。

/** 独立窗口的 label（全应用唯一；重复点击弹出时复用已有窗口并置前） */
export const ROUTE_WINDOW_LABEL = 'route-editor'

/** 运行预览窗口的 label（全应用唯一；重复点击预览时复用已有窗口并置前） */
export const RUN_WINDOW_LABEL = 'run-preview'

/**
 * 打开路线编辑器独立窗口（可拖到任意屏幕）
 *
 * - 窗口已存在：直接置前并聚焦，不重复创建
 * - 不存在：创建 OS 级窗口，加载 /route-window 路由
 */
export async function openRouteWindow(): Promise<void> {
  // 动态导入 Tauri API
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

  // 创建失败（如权限问题）时弹窗告知具体原因，避免“点了没反应”
  win.once('tauri://error', (e) => {
    console.error('[RouteWindow] 创建路线独立窗口失败:', e)
    alert(`路线编辑器窗口创建失败：${JSON.stringify(e)}`)
  })
}

/**
 * 打开运行预览独立窗口（加载 /run 运行态页面，读取 run-preview.json 快照）
 *
 * - 窗口已存在：直接置前并聚焦，不重复创建
 * - 不存在：创建 OS 级窗口，加载 /run 路由（最大化，与主窗口体验一致）
 */
export async function openRunWindow(): Promise<void> {
  // 动态导入 Tauri API
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')

  // 已存在则复用并聚焦
  const existing = await WebviewWindow.getByLabel(RUN_WINDOW_LABEL)
  if (existing) {
    await existing.unminimize().catch(() => {})
    await existing.setFocus().catch(() => {})
    return
  }

  // 创建新窗口：独立 OS 窗口，可自由拖动到任意显示器
  const win = new WebviewWindow(RUN_WINDOW_LABEL, {
    url: '/run',
    title: 'RocWes · 运行预览',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    center: true,
    maximized: true,
    resizable: true,
  })

  // 创建失败（如权限问题）时弹窗告知具体原因，避免“点了没反应”
  win.once('tauri://error', (e) => {
    console.error('[RunWindow] 创建运行预览窗口失败:', e)
    alert(`运行预览窗口创建失败：${JSON.stringify(e)}`)
  })
}
