<!-- ══════════════════════════════════════════════════════════════════════
     NodeDetailDialog.vue - 节点详情弹窗（双击画布节点时打开）

     展示节点的“体检报告”：
       1. 基本信息：节点 ID、名称、类型、标签
       2. 运行数据：按点 ID 分组显示，每组含数据源类型/地址及节点 data 中除内部字段外的所有数据
          （过滤 binding/pointId/floorGrids/history/animation 等内部字段，
          函数/数组/对象等复杂值以 JSON 形式展示）

     运行数据实时跟随数据源刷新（监听 X6 change:data 事件，数据源推送即更新）。
     货架节点（rack-node）有专属正视图弹窗，不会走此通用弹窗。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <!-- 弹窗模式（默认）：Teleport 到 body + 半透明遮罩，点击遮罩关闭；
       内嵌模式（embedded，独立详情窗口）：无遮罩铺满整个窗口。
       两种形态共用同一套结构，仅外层容器与对话框的样式类不同 -->
  <Teleport to="body">
    <div
      :class="embedded ? 'detail-mask detail-mask-embedded' : 'detail-mask'"
      @click.self="!embedded && $emit('close')"
    >
      <div class="detail-dialog" :class="{ 'detail-embedded': embedded }">
        <!-- 头部 -->
        <div class="detail-header">
          <span class="detail-title">{{ nodeIcon }} {{ nodeName }} · 节点详情</span>
          <button class="detail-close" @click="$emit('close')">×</button>
        </div>

        <div class="detail-body" v-if="nodeInfo">
          <!-- 基本信息 -->
          <div class="detail-section">
            <div class="section-title">基本信息</div>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">节点 ID</span>
                <span class="info-value mono" :title="nodeInfo.id">{{ nodeInfo.id }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">名称</span>
                <span class="info-value" :title="nodeName">{{ nodeName }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">类型</span>
                <span class="info-value" :title="nodeTypeLabel">{{ nodeTypeLabel }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">标签</span>
                <span class="info-value" :title="nodeInfo.label || '-'">{{ nodeInfo.label || '-' }}</span>
              </div>
            </div>
          </div>

          <!-- 运行数据（按点 ID 分组） -->
          <div class="detail-section">
            <div class="section-title">运行数据</div>
            <template v-if="groupedData.length > 0">
              <div v-for="group in groupedData" :key="group.pointId" class="point-group">
                <div class="point-header">
                  <span class="point-id mono">{{ group.pointId || '未绑定点位' }}</span>
                  <span v-if="group.sourceType" class="point-src">{{ group.sourceType }}</span>
                  <span v-if="group.sourceUrl" class="point-url mono">{{ group.sourceUrl }}</span>
                </div>
                <div class="data-table">
                  <div v-for="entry in group.entries" :key="entry.key" class="data-row">
                    <span class="data-key">{{ entry.key }}</span>
                    <span class="data-value" :class="{ 'data-complex': entry.complex }">{{ entry.display }}</span>
                  </div>
                  <div v-if="group.entries.length === 0" class="no-binding">暂无运行数据</div>
                </div>
              </div>
            </template>
            <div v-else class="no-binding">⏸ 未配置数据绑定，暂无运行数据</div>
          </div>
        </div>

        <div class="detail-body" v-else>
          <div class="no-binding">节点不存在或已被删除</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { nodeTemplates } from '@/components/nodes/nodeTemplates'

/**
 * NodeDetailDialog - 节点详情弹窗
 *
 * 双击画布节点时弹出，展示节点的基本信息、运行数据和数据绑定配置。
 * 运行数据实时跟随数据源刷新（监听 X6 change:data 事件）。
 */
const props = defineProps<{
  /** 目标节点 ID */
  nodeId: string
  /** X6 Graph 实例 */
  graph: any
  /** 内嵌模式：true 时无遮罩直接填充容器（用于独立详情窗口），false 时弹窗形态 */
  embedded?: boolean
}>()

defineEmits<{
  (e: 'close'): void
}>()

// ===== 运行数据实时刷新信号 =====
// X6 的 setData() 不会触发 Vue 响应式，因此监听该节点 change:data 事件：
// 数据源推送（useDataService 写入 data.values/value）时递增信号，
// 依赖该信号的 computed（nodeInfo/groupedData）重新求值，弹窗即实时刷新。
// 数据本身仍实时读取 cell.getData()（保证首次打开即有数据，不依赖事件时序）。
const refreshTick = ref(0)

// ===== 从 Graph 中读取节点信息（ID/形状/标签，实时查询） =====
// 关键：X6 的 setData() 默认深合并并生成全新 data 对象（store 内引用被替换），
// 若不依赖 refreshTick，本 computed 会缓存弹窗打开那一刻的旧 data 引用，
// 后续数据源推送时 groupedData 重新求值读到的仍是旧对象 → 运行数据不更新。
// 依赖刷新信号后，每次数据变化都会重新 getCellById().getData() 拿到最新引用。
const nodeInfo = computed(() => {
  void refreshTick.value
  if (!props.graph || !props.nodeId) return null
  const cell = props.graph.getCellById(props.nodeId)
  if (!cell || !cell.isNode()) return null

  return {
    id: cell.id,
    shape: cell.shape,
    label: cell.getData()?.label ?? '',
    data: cell.getData() || {},
  }
})

// 目标 X6 节点实例（随 nodeId 切换而更新）
let detailCell: any = null

function onCellDataChange() {
  refreshTick.value++
}

function attachListener() {
  detailCell = props.graph?.getCellById(props.nodeId) ?? null
  detailCell?.on('change:data', onCellDataChange)
  // 打开时先同步一次：即使事件未触发，首屏也有最新数据
  refreshTick.value++
}

function detachListener() {
  detailCell?.off('change:data', onCellDataChange)
  detailCell = null
}

attachListener()
// nodeId 变化（极少数场景）时重新挂载监听，保证刷新信号始终属于当前节点
watch(
  () => props.nodeId,
  () => {
    detachListener()
    attachListener()
  }
)
onBeforeUnmount(detachListener)

// ===== 节点类型标签与图标（从 nodeTemplates 注册表查找） =====
const template = computed(() =>
  nodeTemplates.find(t => t.type === nodeInfo.value?.shape)
)

const nodeTypeLabel = computed(() => template.value?.label || nodeInfo.value?.shape || '未知')
const nodeIcon = computed(() => template.value?.icon || '📦')
const nodeName = computed(() => {
  // 依赖刷新信号：数据变化时重新读取
  void refreshTick.value
  const data = nodeInfo.value?.data
  return data?.name || data?.title || data?.label || nodeTypeLabel.value
})

// ===== 运行数据展示（按点 ID 分组：多点绑定时每个点一组，组头点 ID + 数据源信息） =====
/** 内部字段：不在运行数据中展示（名称/标签已在基本信息显示，values 已按点分组展示，unit 为节点配置属性，其余为结构/历史/动画内部字段） */
const HIDDEN_KEYS = new Set(['name', 'title', 'label', 'binding', 'pointId', 'values', 'floorGrids', 'history', 'animation', 'unit'])

/** 主点追加顶层字段时过滤的键：与点位遥测（value/timestamp/quality）重复，避免同一数据展示两遍 */
const DUP_TELEMETRY_KEYS = new Set(['value', '_timestamp', '_quality'])

/** 时间戳格式化：毫秒时间戳 → YYYY-MM-DD HH:mm:ss（非法的数字/字符串原样返回） */
function formatTimestamp(ts: unknown): string {
  const raw = String(ts ?? '').trim()
  if (raw === '') return '-'
  const num = Number(raw)
  if (!Number.isFinite(num)) return raw
  const d = new Date(num)
  if (Number.isNaN(d.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 将单个值格式化为可展示条目（函数/数组/对象等复杂值以 JSON 展示） */
function toEntry(key: string, value: any) {
  if (value === null || value === undefined) {
    return { key, display: '-', complex: false }
  }
  if (typeof value === 'function') {
    return { key, display: '[函数]', complex: true }
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return { key, display: JSON.stringify(value), complex: true }
  }
  // 时间戳键：毫秒值格式化为可读时间
  if (key === 'timestamp' || key === '_timestamp') {
    return { key, display: formatTimestamp(value), complex: false }
  }
  return { key, display: String(value), complex: false }
}

const groupedData = computed(() => {
  // 依赖刷新信号：数据变化时重新求值，实时读取 cell.getData()
  void refreshTick.value
  const data = nodeInfo.value?.data
  if (!data) return []

  const entries = Object.entries(data)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .map(([key, value]) => toEntry(key, value))

  const binding = data.binding
  if (binding && binding.pointId) {
    // 归一化绑定点列表：优先 points（点组，条目兼容字符串/对象），旧数据回退单字段 pointId
    const rawPoints = Array.isArray(binding.points) && binding.points.length > 0
      ? binding.points
      : [binding.pointId]
    const points = rawPoints
      .map((p: any) => (typeof p === 'string' ? p : p?.pointId))
      .filter((pid: any) => !!pid)
    // 各点的实时值（由 useDataService 写入 data.values[pointId]）
    const values = (data.values || {}) as Record<string, { value?: any; timestamp?: number; quality?: string }>
    // 每个绑定点一组：组头点 ID + 数据源信息，组内优先展示该点实时值，
    // 主点额外追加节点顶层运行字段（value/_timestamp/_quality 等）
    return points.map((pid: string, idx: number) => {
      const pv = values[pid]
      const groupEntries = pv
        ? [
            toEntry('value', pv.value),
            toEntry('timestamp', pv.timestamp),
            toEntry('quality', pv.quality ?? 'good'),
          ]
        : []
      if (idx === 0) {
        // 主点额外追加节点顶层运行字段（过滤与点位遥测重复的 value/_timestamp/_quality）
        groupEntries.push(...entries.filter((e) => !DUP_TELEMETRY_KEYS.has(e.key)))
      }
      return {
        pointId: pid,
        sourceType: binding.sourceType,
        sourceUrl: binding.sourceUrl,
        entries: groupEntries,
      }
    })
  }
  // 未绑定但存在运行字段时，仍展示为“未绑定点位”组
  return entries.length > 0
    ? [{ pointId: '', sourceType: '', sourceUrl: '', entries }]
    : []
})
</script>

<style scoped>
.detail-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}
/* 内嵌模式：遮罩层透明背景（独立详情窗口内无半透明蒙层） */
.detail-mask.detail-mask-embedded {
  background: transparent;
}
/* 内嵌模式：填满父容器（独立详情窗口），取消圆角/阴影/最大宽高限制 */
.detail-dialog.detail-embedded {
  width: 100%;
  height: 100%;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
  animation: none;
}
.detail-dialog {
  background: var(--panel-bg);
  border-radius: var(--radius-lg);
  width: min(92vw, 480px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: dialogIn 0.2s ease;
}
@keyframes dialogIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light);
  background: var(--statusbar-bg);
}
.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.detail-close {
  border: none;
  background: none;
  font-size: 22px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}
.detail-close:hover { color: var(--text-primary); background: var(--border-light); }
.detail-body {
  padding: 16px 18px;
  overflow-y: auto;
}
.detail-section {
  margin-bottom: 16px;
}
.detail-section:last-child {
  margin-bottom: 0;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-primary-light);
}
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 标签与值同行：标签固定列宽，值占满剩余宽度 */
.info-item {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 10px;
}
.info-label {
  width: 52px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.info-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  /* 长值溢出处理：自动换行完整展示（不截断），配合 title 悬停查看 */
  word-break: break-all;
  overflow-wrap: anywhere;
}
.info-value.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
.data-table {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.data-row {
  display: flex;
  align-items: flex-start;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
}
.data-row:last-child { border-bottom: none; }
.data-row:nth-child(odd) { background: var(--statusbar-bg); }
.data-key {
  width: 100px;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-weight: 500;
}
.data-value {
  flex: 1;
  color: var(--text-primary);
  word-break: break-all;
}
.data-value.data-complex {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 点 ID 分组 */
.point-group + .point-group { margin-top: 10px; }
.point-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.point-id {
  font-weight: 600;
  color: var(--color-primary);
}
.point-src {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 11px;
}
.point-url {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}
.no-binding {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px 0;
}
</style>
