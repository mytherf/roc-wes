// ========== 主题 CSS 变量读取工具 ==========
// 用途：ECharts 等以 JS 方式配置颜色的场景无法直接使用 CSS 变量，
// 通过本工具在初始化时读取当前主题的变量值，使图表颜色跟随主题切换。

/**
 * 读取当前主题下的 CSS 变量值（去掉首尾空白）
 * @param name 变量名（含 -- 前缀）
 * @param fallback 变量未定义时使用的兜底值
 */
export function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

/**
 * 把 #rrggbb 格式的颜色转为 rgba() 字符串（用于渐变等需要透明度的场景）
 * @param hex 十六进制颜色，如 #1890ff
 * @param alpha 透明度 0~1
 */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
