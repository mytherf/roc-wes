<template>
  <Teleport to="body">
    <div class="detail-mask" @click.self="$emit('close')">
      <div class="detail-dialog">
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
                <span class="info-value mono">{{ nodeInfo.id }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">类型</span>
                <span class="info-value">{{ nodeTypeLabel }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">位置</span>
                <span class="info-value">({{ nodeInfo.x }}, {{ nodeInfo.y }})</span>
              </div>
              <div class="info-item">
                <span class="info-label">尺寸</span>
                <span class="info-value">{{ nodeInfo.width }} × {{ nodeInfo.height }}</span>
              </div>
            </div>
          </div>

          <!-- 运行数据 -->
          <div class="detail-section" v-if="dataEntries.length > 0">
            <div class="section-title">运行数据</div>
            <div class="data-table">
              <div v-for="entry in dataEntries" :key="entry.key" class="data-row">
                <span class="data-key">{{ entry.key }}</span>
                <span class="data-value" :class="{ 'data-complex': entry.complex }">{{ entry.display }}</span>
              </div>
            </div>
          </div>

          <!-- 数据绑定 -->
          <div class="detail-section" v-if="bindingInfo">
            <div class="section-title">📡 数据绑定</div>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">点 ID</span>
                <span class="info-value mono">{{ bindingInfo.pointId || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">数据源类型</span>
                <span class="info-value">{{ bindingInfo.sourceType || '-' }}</span>
              </div>
              <div class="info-item" v-if="bindingInfo.sourceUrl">
                <span class="info-label">数据源地址</span>
                <span class="info-value mono">{{ bindingInfo.sourceUrl }}</span>
              </div>
            </div>
          </div>

          <!-- 无绑定提示 -->
          <div class="detail-section" v-else>
            <div class="no-binding">⏸ 未配置数据绑定</div>
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
import { computed } from 'vue'
import { nodeTemplates } from '@/components/nodes/nodeTemplates'

/**
 * NodeDetailDialog - 节点详情弹窗
 *
 * 双击画布节点时弹出，展示节点的基本信息、运行数据和数据绑定配置。
 * 数据为打开时的实时快照（从 X6 节点实例读取）。
 */
const props = defineProps<{
  /** 目标节点 ID */
  nodeId: string
  /** X6 Graph 实例 */
  graph: any
}>()

defineEmits<{
  (e: 'close'): void
}>()

// ===== 从 Graph 中读取节点实时数据 =====
const nodeInfo = computed(() => {
  if (!props.graph || !props.nodeId) return null
  const cell = props.graph.getCellById(props.nodeId)
  if (!cell || !cell.isNode()) return null

  const pos = cell.getPosition()
  const size = cell.getSize()
  return {
    id: cell.id,
    shape: cell.shape,
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    width: Math.round(size.width),
    height: Math.round(size.height),
    data: cell.getData() || {},
  }
})

// ===== 节点类型标签与图标（从 nodeTemplates 注册表查找） =====
const template = computed(() =>
  nodeTemplates.find(t => t.type === nodeInfo.value?.shape)
)

const nodeTypeLabel = computed(() => template.value?.label || nodeInfo.value?.shape || '未知')
const nodeIcon = computed(() => template.value?.icon || '📦')
const nodeName = computed(() => {
  const data = nodeInfo.value?.data
  return data?.name || data?.title || data?.label || nodeTypeLabel.value
})

// ===== 数据绑定信息 =====
const bindingInfo = computed(() => {
  const binding = nodeInfo.value?.data?.binding
  if (!binding || !binding.pointId) return null
  return binding
})

// ===== 运行数据展示（过滤内部字段，格式化复杂值） =====
const HIDDEN_KEYS = new Set(['binding', 'pointId', 'floorGrids', 'history', 'animation'])

const dataEntries = computed(() => {
  const data = nodeInfo.value?.data
  if (!data) return []

  return Object.entries(data)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .map(([key, value]) => {
      if (value === null || value === undefined) {
        return { key, display: '-', complex: false }
      }
      if (typeof value === 'function') {
        return { key, display: '[函数]', complex: true }
      }
      if (Array.isArray(value)) {
        return { key, display: JSON.stringify(value), complex: true }
      }
      if (typeof value === 'object') {
        return { key, display: JSON.stringify(value), complex: true }
      }
      return { key, display: String(value), complex: false }
    })
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
.detail-dialog {
  background: #fff;
  border-radius: 10px;
  width: min(92vw, 480px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
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
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}
.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}
.detail-close {
  border: none;
  background: none;
  font-size: 22px;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.detail-close:hover { color: #333; background: #f0f0f0; }
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
  color: #1890ff;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e6f7ff;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.info-label {
  font-size: 11px;
  color: #999;
}
.info-value {
  font-size: 13px;
  color: #333;
  word-break: break-all;
}
.info-value.mono {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}
.data-table {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
}
.data-row {
  display: flex;
  align-items: flex-start;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid #f5f5f5;
}
.data-row:last-child { border-bottom: none; }
.data-row:nth-child(odd) { background: #fafafa; }
.data-key {
  width: 100px;
  flex-shrink: 0;
  color: #666;
  font-weight: 500;
}
.data-value {
  flex: 1;
  color: #333;
  word-break: break-all;
}
.data-value.data-complex {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  color: #8c8c8c;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.no-binding {
  font-size: 13px;
  color: #999;
  text-align: center;
  padding: 8px 0;
}
</style>
