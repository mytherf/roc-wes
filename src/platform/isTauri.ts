// ========== 运行时环境探测 ==========
// 本项目有两种运行形态：
// 1. 纯浏览器（开发模式，npm run dev）：数据通过 WebSocket 连本地模拟服务
// 2. Tauri 桌面应用（打包后）：数据通过 IPC 直连 Rust 原生网关（性能更好、可接真实工业设备）
// 本文件负责在两者之间做判断。

/**
 * 运行时环境探测
 *
 * Tauri 2 在 WebView 中注入 window.__TAURI_INTERNALS__（IPC 桥）。
 * 据此区分桌面运行时与纯浏览器（开发演示）环境，
 * 让数据服务层在两种环境下选择不同传输（IPC / WebSocket）。
 */

/** 当前是否运行于 Tauri 桌面壳内
 * @returns true = 运行在 Tauri 桌面应用里；false = 运行在普通浏览器里 */
export function isTauri(): boolean {
  // __TAURI_INTERNALS__ 是 Tauri 注入的全局对象，普通浏览器里不存在
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
