<template>
  <div class="node-minimal">
    <span class="minimal-icon">{{ icon }}</span>
    <span class="minimal-name">{{ name }}</span>
    <span v-if="status" class="minimal-dot" :class="dotClass" :title="statusTitle"></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * NodeMinimalView - 极简模式下的节点统一渲染组件
 *
 * 所有设备/IoT 节点在极简模式下共用此紧凑卡片：图标 + 名称 + 状态圆点。
 * 由各节点组件通过 v-if="isMinimal" 条件渲染。
 */
const props = defineProps<{
  /** 节点图标（emoji） */
  icon: string
  /** 节点名称 */
  name: string
  /** 运行状态（idle/running/error/warning/charging/on/off），为空则不显示圆点 */
  status?: string
}>()

const dotClass = computed(() => `dot-${props.status || 'idle'}`)

const STATUS_TITLES: Record<string, string> = {
  idle: '待机',
  running: '运行中',
  error: '故障',
  warning: '警告',
  charging: '充电中',
  on: '开启',
  off: '关闭',
}

const statusTitle = computed(() => STATUS_TITLES[props.status || ''] || props.status || '')
</script>

<style scoped>
.node-minimal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #fff;
  border: 1.5px solid #d9d9d9;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  user-select: none;
  cursor: pointer;
  white-space: nowrap;
}
.minimal-icon {
  font-size: 16px;
  line-height: 1;
}
.minimal-name {
  font-size: 12px;
  font-weight: 500;
  color: #333;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.minimal-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-idle { background: #d9d9d9; }
.dot-running { background: #52c41a; animation: minimalPulse 1s infinite; }
.dot-error { background: #ff4d4f; animation: minimalPulse 0.5s infinite; }
.dot-warning { background: #faad14; animation: minimalPulse 0.8s infinite; }
.dot-charging { background: #faad14; }
.dot-on { background: #52c41a; }
.dot-off { background: #d9d9d9; }
@keyframes minimalPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
