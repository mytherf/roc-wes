<template>
  <div class="node-icon-only" :title="tooltip" role="img" :aria-label="tooltip">
    <NodeIcon :icon="icon" :size="iconSize" :alt="name" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NodeIcon from './NodeIcon.vue'

/**
 * NodeMinimalView - 图标模式下的节点统一渲染组件
 *
 * 图标模式下画布只显示节点的图标本身（默认图标或用户自定义图标），
 * 不渲染名称与状态圆点；名称与运行状态收敛为悬停 tooltip，
 * 保持节点可辨识、可访问。由各节点组件通过 v-if="isMinimal" 条件渲染。
 *
 * 节点模型尺寸随 iconSize 自适应（见 nodeIcons.iconOnlyNodeSize），
 * 图标在节点内居中显示。
 */
const props = withDefaults(defineProps<{
  /** 节点图标（emoji 或 data: URL 图片，由 NodeIcon 统一渲染） */
  icon: string
  /** 节点名称（tooltip 展示） */
  name: string
  /** 运行状态（idle/running/error/warning/charging/on/off），为空则 tooltip 不含状态 */
  status?: string
  /** 图标尺寸（px），与节点模型尺寸联动 */
  iconSize?: number
}>(), {
  iconSize: 20,
})

const STATUS_TITLES: Record<string, string> = {
  idle: '待机',
  running: '运行中',
  error: '故障',
  warning: '警告',
  charging: '充电中',
  on: '开启',
  off: '关闭',
}

const tooltip = computed(() => {
  const statusText = STATUS_TITLES[props.status || ''] || props.status || ''
  return statusText ? `${props.name} · ${statusText}` : props.name
})
</script>

<style scoped>
.node-icon-only {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  user-select: none;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.node-icon-only:hover {
  background: rgba(24, 144, 255, 0.08);
}
</style>
