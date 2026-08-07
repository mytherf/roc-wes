<!-- ═══════════════════════════════════════════════════════════════
     ConveyorNode.vue - 输送线节点（辊道/皮带输送机）

     画布上的输送线图形：皮带轨道 + 分段闪烁动画 + 名称/状态。
     数据字段（useNodeData 声明）：
       - name: 名称（默认 输送线-01）
       - direction: 运行方向（left / right / bidirectional，动画方向不同）
       - isRunning: 皮带是否在转（分段闪烁动画）
       - status: 运行状态（idle/running/error，颜色区分）
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="name" :status="status" />
  <div v-else class="conveyor-node" :class="directionClass">
    <div class="conveyor-track">
      <div class="conveyor-belt" :class="{ 'belt-running': isRunning }">
        <span v-for="i in 8" :key="i" class="belt-segment"></span>
      </div>
    </div>
    <div class="conveyor-info">
      <NodeIcon class="conveyor-icon" :icon="displayIcon" :size="iconSize" alt="输送线" />
      <span class="conveyor-name">{{ name }}</span>
      <span class="conveyor-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNodeData } from '@/composables/useNodeData'
import { useNodeStatus } from '@/composables/useNodeStatus'
import { useDisplayMode } from '@/composables/useDisplayMode'
import { useNodeIcon } from '@/composables/useNodeIcon'
import NodeMinimalView from './NodeMinimalView.vue'
import NodeIcon from './NodeIcon.vue'

const props = defineProps<{
  node: any
}>()

const { isMinimal } = useDisplayMode(props.node)
const { displayIcon, iconSize } = useNodeIcon(props.node, 'conveyor-node')

const { name, direction, isRunning, status } = useNodeData(props.node, {
  name: '输送线-01',
  direction: 'left', // left | right | bidirectional
  isRunning: false,
  status: 'idle',
})

const { statusClass, statusText } = useNodeStatus(status)

const directionClass = computed(() => ({
  'conveyor-left': direction.value === 'left',
  'conveyor-right': direction.value === 'right',
  'conveyor-bidirectional': direction.value === 'bidirectional',
}))
</script>

<style scoped>
.conveyor-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 8px 12px;
  background: var(--statusbar-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  user-select: none;
}
.conveyor-track {
  padding: 6px 0;
  overflow: hidden;
}
.conveyor-belt {
  display: flex;
  gap: 4px;
  height: 12px;
  background: #e8e8e8;
  border-radius: 6px;
  padding: 0 4px;
  align-items: center;
}
.belt-segment {
  flex: 1;
  height: 6px;
  background: #d9d9d9;
  border-radius: 3px;
}
.belt-running .belt-segment {
  background: var(--color-primary);
  animation: beltMove 0.5s linear infinite;
}
.conveyor-left .belt-running .belt-segment { animation-direction: reverse; }
@keyframes beltMove {
  0% { opacity: 1; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
}
.conveyor-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 4px;
}
.conveyor-name { font-weight: 500; color: var(--text-primary); }
.conveyor-status { padding: 0 8px; border-radius: 10px; }
.status-idle { color: var(--text-muted); }
.status-running { color: #52c41a; }
.status-error { color: #ff4d4f; }
</style>