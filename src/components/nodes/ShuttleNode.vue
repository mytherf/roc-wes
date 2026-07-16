<template>
  <div class="shuttle-node">
    <div class="shuttle-body">
      <div class="shuttle-track">
        <div class="shuttle-car" :style="{ left: positionPercent + '%' }">
          <span class="shuttle-icon">🚗</span>
        </div>
      </div>
    </div>
    <div class="shuttle-info">
      <span class="shuttle-name">{{ name }}</span>
      <span class="shuttle-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '穿梭车-01')
const position = ref(data.value.position || 50) // 0-100
const status = ref(data.value.status || 'idle')

const positionPercent = computed(() => Math.min(100, Math.max(0, position.value)))

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
    name.value = newData.name || '穿梭车-01'
    position.value = newData.position ?? 50
    status.value = newData.status || 'idle'
  }
})
</script>

<style scoped>
.shuttle-node {
  min-width: 180px;
  padding: 10px 14px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #13c2c2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.shuttle-body { padding: 8px 0; }
.shuttle-track {
  height: 30px;
  background: #f0f0f0;
  border-radius: 15px;
  position: relative;
  border: 1px solid #d9d9d9;
}
.shuttle-car {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.5s ease;
}
.shuttle-icon { font-size: 20px; }
.shuttle-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 4px;
}
.shuttle-name { font-weight: 500; color: #333; }
.shuttle-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: #999; }
.status-running { color: #13c2c2; }
.status-error { color: #ff4d4f; }
</style>