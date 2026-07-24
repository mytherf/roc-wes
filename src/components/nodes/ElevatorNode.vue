<template>
  <div class="elevator-node">
    <div class="elevator-shaft">
      <div class="elevator-car" :style="{ bottom: (position / maxLevel * 100) + '%' }">
        <span class="elevator-icon">🔼</span>
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

const props = defineProps<{
  node: any
}>()

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
  min-width: 100px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #1890ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.elevator-shaft {
  height: 120px;
  width: 40px;
  margin: 0 auto;
  background: #f0f0f0;
  border-radius: 4px;
  position: relative;
  border: 1px solid #d9d9d9;
}
.elevator-car {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 16px;
  background: #1890ff;
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
  color: #ccc;
  background: #fff;
  padding: 0 2px;
  border-radius: 2px;
}
.level-active { color: #1890ff; font-weight: 600; }
.elevator-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 8px;
}
.elevator-name { font-weight: 500; color: #333; }
.elevator-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: #999; }
.status-running { color: #52c41a; }
.status-error { color: #ff4d4f; }
</style>