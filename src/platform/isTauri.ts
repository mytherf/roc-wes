/**
 * 运行时环境探测
 *
 * Tauri 2 在 WebView 中注入 window.__TAURI_INTERNALS__（IPC 桥）。
 * 据此区分桌面运行时与纯浏览器（开发演示）环境，
 * 让数据服务层在两种环境下选择不同传输（IPC / WebSocket）。
 */

/** 当前是否运行于 Tauri 桌面壳内 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
