// ========== 通知 Rust 侧：主界面已就绪 ==========
// 启动画面采用「Rust 侧 splash 窗口」方案（public/splash.html 纯静态页面，
// 零 JS）：进程启动即显示 splash，主窗口隐藏创建；前端主界面就绪后 emit
// "app-ready" 事件，由 Rust 侧（src-tauri/src/lib.rs）关闭 splash 并显示主窗口。
//
// 发出时机（两道保险）：
//   1. MainLayout 画布就绪（X6 ready）后调用 —— 正常路径
//   2. main.ts 挂载后设置超时兜底 —— 防止画布异常导致永远停在 splash
//
// 函数幂等：多次调用只发一次；非 Tauri 环境（浏览器直接访问 vite）直接返回。

let notified = false

/** 通知 Rust 侧主界面已就绪（仅首次调用生效） */
export function notifyAppReady(): void {
  if (notified) return
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return
  notified = true
  import('@tauri-apps/api/event')
    .then(({ emit }) => emit('app-ready'))
    .catch((e) => console.warn('[startup] 发送 app-ready 失败:', e))
}
