<template>
  <div class="stacker-node" :class="{ 'stacker-moving': isMoving }">
    <div class="stacker-header">
      <span class="stacker-icon">🏗️</span>
      <span class="stacker-name">{{ name }}</span>
    </div>
    <div class="stacker-body">
      <div class="stacker-status">
        <span class="status-dot" :class="statusClass"></span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      <div class="stacker-info">
        <span>巷道: {{ lane }}</span>
        <span>货位: {{ position }}</span>
      </div>
      <div class="stacker-progress" v-if="isMoving">
        <div class="progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNodeData } from '@/composables/useNodeData'
import { useNodeStatus } from '@/composables/useNodeStatus'

const props = defineProps<{
  node: any
}>()

const { name, lane, position, status, isMoving, progress } = useNodeData(props.node, {
  name: '堆垛机-01',
  lane: 'A01',
  position: '05-12-03',
  status: 'idle',
  isMoving: false,
  progress: 0,
})

const { statusClass, statusText } = useNodeStatus(status, {
  labels: { warning: '告警' },
})

defineExpose({
  setStatus: (s: string) => { status.value = s },
  setMoving: (moving: boolean) => { isMoving.value = moving },
  setProgress: (p: number) => { progress.value = Math.min(100, Math.max(0, p)) },
})
</script>

<style scoped>
.stacker-node {
  min-width: 180px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #1890ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.stacker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.stacker-icon { font-size: 20px; }
.stacker-name { font-size: 14px; font-weight: 600; color: #333; }
.stacker-body { font-size: 12px; }
.stacker-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.status-idle { background: #d9d9d9; }
.status-running { background: #52c41a; animation: pulse 1s infinite; }
.status-warning { background: #faad14; animation: pulse 0.8s infinite; }
.status-error { background: #ff4d4f; animation: pulse 0.5s infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.status-text { color: #666; }
.stacker-info {
  display: flex;
  gap: 12px;
  color: #999;
}
.stacker-moving .stacker-info { color: #1890ff; }
.stacker-progress {
  margin-top: 4px;
  height: 4px;
  background: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: #1890ff;
  border-radius: 2px;
  transition: width 0.3s;
}
</style>