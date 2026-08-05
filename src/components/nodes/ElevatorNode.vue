<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="name" :status="status" />
  <div v-else class="elevator-node">
    <div class="elevator-shaft">
      <div class="elevator-car" :style="{ bottom: (position / maxLevel * 100) + '%' }">
        <NodeIcon class="elevator-icon" :icon="displayIcon" :size="Math.min(iconSize, 24)" alt="提升机" />
      </div>
      <div class="elevator-level" v-for="i in maxLevel" :key="i" :style="{ bottom: ((i-1) / maxLevel * 100) + '%' }">
        <span class="level-marker" :class="{ 'level-active': i === currentLevel }">{{ i }}</span>
      </div>
    </div>
    <div class="elevator-info">
      <span class="elevator-name">{{ name }}</span>
      <span class="elevator-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
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
const { displayIcon, iconSize } = useNodeIcon(props.node, 'elevator-node')

const { name, maxLevel, currentLevel, position, status } = useNodeData(props.node, {
  name: '提升机-01',
  maxLevel: 6,
  currentLevel: 1,
  position: 0,
  status: 'idle',
})

const { statusClass, statusText } = useNodeStatus(status)
</script>

<style scoped>
.elevator-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 12px 16px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.elevator-shaft {
  height: 120px;
  width: 40px;
  margin: 0 auto;
  background: var(--statusbar-bg);
  border-radius: 4px;
  position: relative;
  border: 1px solid var(--border-color);
}
.elevator-car {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 16px;
  background: var(--color-primary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: bottom 0.5s ease;
}
.elevator-icon { font-size: 12px; color: #fff; }
.elevator-level {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.level-marker {
  font-size: 8px;
  color: var(--text-muted);
  background: var(--panel-bg);
  padding: 0 2px;
  border-radius: 2px;
}
.level-active { color: var(--color-primary); font-weight: 600; }
.elevator-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 8px;
}
.elevator-name { font-weight: 500; color: var(--text-primary); }
.elevator-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: var(--text-muted); }
.status-running { color: #52c41a; }
.status-error { color: #ff4d4f; }
</style>