<template>
  <div class="conveyor-node" :class="directionClass">
    <div class="conveyor-track">
      <div class="conveyor-belt" :class="{ 'belt-running': isRunning }">
        <span v-for="i in 8" :key="i" class="belt-segment"></span>
      </div>
    </div>
    <div class="conveyor-info">
      <span class="conveyor-name">{{ name }}</span>
      <span class="conveyor-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '输送线-01')
const direction = ref(data.value.direction || 'left') // left | right | bidirectional
const isRunning = ref(data.value.isRunning || false)
const status = ref(data.value.status || 'idle')

const directionClass = computed(() => ({
  'conveyor-left': direction.value === 'left',
  'conveyor-right': direction.value === 'right',
  'conveyor-bidirectional': direction.value === 'bidirectional',
}))

const statusClass = computed(() => ({
  'status-idle': status.value === 'idle',
  'status-running': status.value === 'running',
  'status-error': status.value === 'error',
}))

const statusText = computed(() => {
  const map: Record<string, string> = { idle: '待机', running: '运行中', error: '故障' }
  return map[status.value] || '未知'
})

props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current.getData()
  if (newData) {
    name.value = newData.name || '输送线-01'
    direction.value = newData.direction || 'left'
    isRunning.value = newData.isRunning || false
    status.value = newData.status || 'idle'
  }
})
</script>

<style scoped>
.conveyor-node {
  min-width: 200px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #d9d9d9;
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
  background: #1890ff;
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
.conveyor-name { font-weight: 500; color: #333; }
.conveyor-status { padding: 0 8px; border-radius: 10px; }
.status-idle { color: #999; }
.status-running { color: #52c41a; }
.status-error { color: #ff4d4f; }
</style>