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
import { ref, computed, onMounted } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '堆垛机-01')
const lane = ref(data.value.lane || 'A01')
const position = ref(data.value.position || '05-12-03')
const status = ref(data.value.status || 'idle') // idle | running | warning | error
const isMoving = ref(data.value.isMoving || false)
const progress = ref(data.value.progress || 0)

const statusClass = computed(() => ({
  'status-idle': status.value === 'idle',
  'status-running': status.value === 'running',
  'status-warning': status.value === 'warning',
  'status-error': status.value === 'error',
}))

const statusText = computed(() => {
  const map: Record<string, string> = {
    idle: '待机',
    running: '运行中',
    warning: '告警',
    error: '故障',
  }
  return map[status.value] || '未知'
})

// 监听数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    name.value = newData.name || '堆垛机-01'
    lane.value = newData.lane || 'A01'
    position.value = newData.position || '05-12-03'
    status.value = newData.status || 'idle'
    isMoving.value = newData.isMoving || false
    progress.value = newData.progress || 0
  }
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