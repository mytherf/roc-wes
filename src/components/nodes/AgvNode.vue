<template>
  <div class="agv-node" :class="{ 'agv-moving': isMoving }">
    <div class="agv-body">
      <div class="agv-wheel agv-wheel-fl"></div>
      <div class="agv-wheel agv-wheel-fr"></div>
      <div class="agv-center">
        <span class="agv-icon">🤖</span>
        <span class="agv-battery" :style="{ width: battery + '%' }"></span>
      </div>
      <div class="agv-wheel agv-wheel-bl"></div>
      <div class="agv-wheel agv-wheel-br"></div>
    </div>
    <div class="agv-info">
      <span class="agv-name">{{ name }}</span>
      <span class="agv-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || 'AGV-01')
const battery = ref(data.value.battery || 85)
const isMoving = ref(data.value.isMoving || false)
const status = ref(data.value.status || 'idle')

const statusClass = computed(() => ({
  'status-idle': status.value === 'idle',
  'status-running': status.value === 'running',
  'status-charging': status.value === 'charging',
  'status-error': status.value === 'error',
}))

const statusText = computed(() => {
  const map: Record<string, string> = {
    idle: '待机',
    running: '运行中',
    charging: '充电中',
    error: '故障',
  }
  return map[status.value] || '未知'
})

props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    name.value = newData.name || 'AGV-01'
    battery.value = newData.battery ?? 85
    isMoving.value = newData.isMoving || false
    status.value = newData.status || 'idle'
  }
})
</script>

<style scoped>
.agv-node {
  min-width: 140px;
  padding: 8px 12px;
  background: #fff;
  border-radius: 12px;
  border: 2px solid #722ed1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.agv-body {
  display: grid;
  grid-template-columns: 20px 1fr 20px;
  grid-template-rows: 20px 30px 20px;
  gap: 4px;
  padding: 4px;
}
.agv-wheel {
  width: 16px;
  height: 16px;
  background: #333;
  border-radius: 50%;
  border: 2px solid #666;
}
.agv-wheel-fl { grid-column: 1; grid-row: 1; }
.agv-wheel-fr { grid-column: 3; grid-row: 1; }
.agv-wheel-bl { grid-column: 1; grid-row: 3; }
.agv-wheel-br { grid-column: 3; grid-row: 3; }
.agv-center {
  grid-column: 2; grid-row: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border-radius: 6px;
  position: relative;
}
.agv-icon { font-size: 18px; }
.agv-battery {
  position: absolute;
  bottom: 2px;
  left: 4px;
  height: 3px;
  background: #52c41a;
  border-radius: 2px;
  transition: width 0.5s;
}
.agv-moving .agv-center { animation: agvShake 0.3s infinite alternate; }
@keyframes agvShake {
  0% { transform: translateX(-2px); }
  100% { transform: translateX(2px); }
}
.agv-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 4px;
}
.agv-name { font-weight: 500; color: #333; }
.agv-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: #999; }
.status-running { color: #52c41a; }
.status-charging { color: #faad14; }
.status-error { color: #ff4d4f; }
</style>