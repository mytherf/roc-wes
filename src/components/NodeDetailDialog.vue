<!-- ══════════════════════════════════════════════════════════════════════
     NodeDetailDialog.vue - 节点详情弹窗（双击画布节点时打开）

     展示节点的“体检报告”：
       1. 基本信息：节点 ID、名称、类型、标签
       2. 运行数据：按点 ID 分组显示，每组仅展示该点的 value 字段
          （timestamp/quality/rawValue 等其它属性不展示）；
          value 支持点击手动修改，提交后写回节点数据（values[pointId].value，
          主点同步写顶层 value），触发 change:data 刷新节点渲染

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
                  <span v-if="group.name" class="point-name" :title="group.pointId">{{ group.name }}</span>
                  <span v-if="group.remark" class="point-remark" :title="group.remark">{{ group.remark }}</span>
                </div>
                <div class="data-table">
                  <div class="data-row">
                    <span class="data-key">value</span>
                    <!-- 编辑态：聚焦输入框，Enter/失焦提交，Esc 取消 -->
                    <input
                      v-if="editingKey === group.key"
                      class="data-value-input"
                      v-model="editDraft"
                      @vue:mounted="focusEditInput"
                      @blur="commitEdit(group)"
                      @keydown.enter.prevent="($event.target as HTMLInputElement)?.blur()"
                      @keydown.esc="cancelEdit"
                    />
                    <!-- 展示态：点击切换为输入框手动修改 -->
                    <span
                      v-else
                      class="data-value data-value-editable"
                      title="点击可手动修改"
                      @click="startEdit(group)"
                    >{{ group.hasValue ? displayValue(group.value) : '-' }}</span>
                  </div>
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

// ===== 运行数据展示（按点 ID 分组：多点绑定时每个点一组，每组仅展示 value 且可手动修改） =====

/** 将点位值格式化为可展示文本（函数/数组/对象等复杂值以 JSON 展示） */
function displayValue(v: any): string {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'function') return '[函数]'
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 分组模型：key 为编辑态标识（绑定点用点ID，未绑定回退组用固定标识） */
interface PointGroup {
  key: string
  pointId: string
  name?: string
  remark?: string
  /** 是否主点（手动修改时同步写节点顶层 value） */
  primary: boolean
  hasValue: boolean
  value: any
}

const groupedData = computed<PointGroup[]>(() => {
  // 依赖刷新信号：数据变化时重新求值，实时读取 cell.getData()
  void refreshTick.value
  const data = nodeInfo.value?.data
  if (!data) return []

  const binding = data.binding
  if (binding && Array.isArray(binding.points) && binding.points.length > 0) {
    // 绑定点列表：取 points 点组的全部点 ID、点名称与备注（名称/备注用于组头展示）
    const points = binding.points
      .map((p: any) => ({ pid: p?.pointId, name: p?.name, remark: p?.remark }))
      .filter((p: any) => !!p.pid)
    // 各点的实时值（由 useDataService 写入 data.values[pointId]）
    const values = (data.values || {}) as Record<string, { value?: any }>
    return points.map((pt: { pid: string; name?: string; remark?: string }, idx: number) => {
      const pv = values[pt.pid]
      return {
        key: pt.pid,
        pointId: pt.pid,
        name: pt.name,
        remark: pt.remark,
        primary: idx === 0,
        hasValue: pv !== undefined && pv.value !== undefined,
        value: pv?.value,
      }
    })
  }
  // 未绑定回退组：仅展示节点顶层 value（同样可手动修改）
  return [{ key: '__unbound__', pointId: '', primary: true, hasValue: data.value !== undefined, value: data.value }]
})

// ===== value 手动编辑：点击进入输入框，提交后写回节点数据 =====
/** 当前编辑中的分组 key（null = 非编辑态）与输入草稿 */
const editingKey = ref<string | null>(null)
const editDraft = ref('')

/** 输入文本解析为目标值：纯数字 → number，true/false → boolean，其余保留字符串 */
function parseInputValue(text: string): any {
  const t = text.trim()
  if (t === '') return ''
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (t === 'true') return true
  if (t === 'false') return false
  return text
}

function startEdit(group: PointGroup) {
  editingKey.value = group.key
  editDraft.value = group.hasValue ? String(group.value) : ''
}

function cancelEdit() {
  editingKey.value = null
}

/** 提交：写回 data.values[pointId].value（主点/未绑定组同步写顶层 value），
 *  与 useDataService 推送写入路径一致（setData 深合并），触发 change:data 刷新 */
function commitEdit(group: PointGroup) {
  if (editingKey.value !== group.key) return
  editingKey.value = null
  const cell = props.graph?.getCellById(props.nodeId)
  if (!cell) return
  const newVal = parseInputValue(editDraft.value)
  if (!group.pointId) {
    // 未绑定回退组：只写节点顶层 value
    cell.setData({ value: newVal })
    return
  }
  const data = cell.getData() || {}
  const prev = ((data.values || {}) as Record<string, any>)[group.pointId] || {}
  const patch: any = {
    values: {
      [group.pointId]: { ...prev, value: newVal, timestamp: Date.now(), quality: 'good' },
    },
  }
  if (group.primary) patch.value = newVal
  cell.setData(patch)
}

/** 编辑输入框挂载后自动聚焦 */
function focusEditInput(el: unknown) {
  (el as HTMLInputElement | null)?.focus()
}
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
/* value 手动编辑：展示态虚线下划线提示可点击，悬停高亮 */
.data-value-editable {
  cursor: pointer;
  border-bottom: 1px dashed var(--border-light);
}
.data-value-editable:hover {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
/* value 编辑输入框：与展示值等宽对位，主题色描边突出编辑态 */
.data-value-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  padding: 1px 6px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--panel-bg);
  color: var(--text-primary);
  outline: none;
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
.point-name {
  color: var(--text-secondary);
}
.point-remark {
  color: var(--text-muted);
}
.no-binding {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px 0;
}
</style>
