/**
 * 节点图标共享模块
 *
 * 统一维护：
 * - 各节点形状的默认图标（emoji）
 * - 属性面板可选的预设图标列表
 * - 图标尺寸约束
 * - 自定义图片图标（data: URL）判断工具
 *
 * 节点 data 约定字段：
 * - icon?: string    图标内容。emoji 字符 = 预设图标；"data:image/..." = 用户上传的图片图标。
 *                    留空/未设置 = 使用该节点形状的默认图标。
 * - iconSize?: number 图标显示尺寸（px），范围 [ICON_SIZE_MIN, ICON_SIZE_MAX]。
 */

/** 节点形状 → 默认图标（与各节点组件硬编码图标保持一致的唯一事实源） */
export const DEFAULT_NODE_ICONS: Record<string, string> = {
  'custom-card': '📋',
  'gauge-node': '📊',
  'chart-node': '📈',
  'indicator-node': '💡',
  'stacker-node': '🏗️',
  'conveyor-node': '⚡',
  'agv-node': '🤖',
  'shuttle-node': '🚗',
  'sorter-node': '📦',
  'elevator-node': '🔼',
  'robot-node': '🦾',
  'rack-node': '🏛️',
  rect: '▭',
  circle: '◯',
}

/** 兜底图标（未知形状时使用） */
export const FALLBACK_ICON = '📦'

/** 属性面板预设图标列表（含各设备默认图标 + 常用扩展） */
export const PRESET_ICONS: string[] = [
  // 设备默认
  '🏗️', '⚡', '🤖', '🚗', '📦', '🔼', '🦾', '🏛️',
  // 仓储/物流扩展
  '🚚', '🚜', '🛗', '⛴️', '🏭', '🧭',
  // IoT / 状态
  '📊', '📈', '💡', '🌡️', '📡', '🔋',
  // 通用
  '⚙️', '🔧', '🚨', '📹', '🧯', '🗄️',
]

/** 图标显示尺寸约束（px） */
export const ICON_SIZE_MIN = 14
export const ICON_SIZE_MAX = 64
export const ICON_SIZE_DEFAULT = 20

/** 上传图片的最大原始文件大小（2MB，压缩后写入 data URL） */
export const ICON_UPLOAD_MAX_BYTES = 2 * 1024 * 1024

/** 上传后压缩到的最大边长（px）——控制 data URL 体积，避免撑爆 localStorage */
export const ICON_UPLOAD_MAX_DIMENSION = 128

/** 允许上传的图片 MIME 类型 */
export const ICON_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

/** 判断图标值是否为图片（data URL），用于渲染分支选择 */
export function isImageIcon(icon: string | undefined | null): boolean {
  return !!icon && icon.startsWith('data:image/')
}

/** 解析节点实际生效的图标（data.icon 优先，否则取形状默认图标） */
export function resolveNodeIcon(shape: string | undefined, icon: string | undefined): string {
  if (icon) return icon
  return (shape && DEFAULT_NODE_ICONS[shape]) || FALLBACK_ICON
}

/** 规范化图标尺寸到合法区间 */
export function clampIconSize(size: number | undefined): number {
  if (!size || Number.isNaN(size)) return ICON_SIZE_DEFAULT
  return Math.min(ICON_SIZE_MAX, Math.max(ICON_SIZE_MIN, Math.round(size)))
}

/**
 * 支持图标模式（极简视图）的节点形状。
 * 切换图标模式时这些形状的节点会压缩为"仅图标"尺寸（见 iconOnlyNodeSize）。
 * 唯一事实源：X6Canvas 的 isMinimalShape 与各节点组件的极简视图渲染均以此为准。
 */
export const MINIMAL_ICON_SHAPES = new Set([
  'custom-card', 'gauge-node', 'chart-node', 'indicator-node',
  'stacker-node', 'conveyor-node', 'agv-node', 'shuttle-node',
  'sorter-node', 'elevator-node', 'robot-node', 'rack-node',
])

/** 判断形状是否支持图标模式（极简视图） */
export function isMinimalIconShape(shape: string | undefined): boolean {
  return !!shape && MINIMAL_ICON_SHAPES.has(shape)
}

/** 图标模式下图标四周的留白（px，每侧） */
export const ICON_ONLY_PADDING = 8

/**
 * 计算图标模式下节点的模型尺寸：图标居中显示，四周留 ICON_ONLY_PADDING。
 * 尺寸随节点自身 iconSize 自适应（未设置时按默认图标尺寸）。
 */
export function iconOnlyNodeSize(iconSize?: number): { width: number; height: number } {
  const s = clampIconSize(iconSize) + ICON_ONLY_PADDING * 2
  return { width: s, height: s }
}
