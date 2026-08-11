// ========== 启动完成后显示主窗口 ==========
// 背景：主窗口在 tauri.conf.json 中配置 visible: false 隐藏启动，
// 避免 WebView 加载 / Vue 挂载 / 画布初始化期间的界面空白期。
//
// 显示时机（两道保险）：
//   1. MainLayout 画布就绪（X6 ready）后主动调用本函数 —— 正常路径
//   2. main.ts 挂载后设置超时兜底 —— 防止任何异常导致窗口永远隐藏
//
// 函数幂等：已可见时直接跳过；非 Tauri 环境（浏览器直接访问 vite）直接返回。

/** 显示主窗口（仅当当前还不可见时），并夺取焦点 */
export async function showMainWindow(): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (!(await win.isVisible())) {
      await win.show()
      await win.setFocus()
    }
  } catch (e) {
    // 显示失败不阻断业务，仅打日志（窗口可能已被其他路径显示）
    console.warn('[startup] 显示主窗口失败:', e)
  }
}
