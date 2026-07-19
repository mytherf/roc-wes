<template>
  <div class="sorter-node">
    <div class="sorter-header">
      <span class="sorter-icon">📦</span>
      <span class="sorter-name">{{ name }}</span>
    </div>
    <div class="sorter-body">
      <div class="sorter-chutes">
        <div v-for="(chute, index) in chutes" :key="index" class="sorter-chute" :class="{ 'chute-active': chute.active }">
          <span class="chute-label">{{ chute.label }}</span>
          <span class="chute-count">{{ chute.count }}</span>
        </div>
      </div>
      <div class="sorter-status">
        <span class="status-dot" :class="statusClass"></span>
        <span class="status-text">{{ statusText }}</span>
        <span class="sorter-speed">{{ speed }} 件/分</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '分拣机-01')
const speed = ref(data.value.speed || 60)
const status = ref(data.value.status || 'idle')
const chutes = ref(data.value.chutes || [
  { label: 'A区', count: 0, active: false },
  { label: 'B区', count: 0, active: false },
  { label: 'C区', count: 0, active: false },
  { label: 'D区', count: 0, active: false },
])

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
  const newData = current || props.node.getData()
  if (newData) {
    name.value = newData.name || '分拣机-01'
    speed.value = newData.speed || 60
    status.value = newData.status || 'idle'
    if (newData.chutes) chutes.value = newData.chutes
  }
})
</script>

<style scoped>
.sorter-node {
  min-width: 220px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #faad14;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.sorter-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sorter-icon { font-size: 20px; }
.sorter-name { font-size: 14px; font-weight: 600; color: #333; }
.sorter-chutes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}
.sorter-chute {
  text-align: center;
  padding: 4px;
  background: #fafafa;
  border-radius: 4px;
  border: 1px solid #f0f0f0;
  transition: all 0.3s;
}
.chute-active { border-color: #1890ff; background: #e6f7ff; }
.chute-label { font-size: 11px; color: #666; display: block; }
.chute-count { font-size: 14px; font-weight: 600; color: #333; }
.sorter-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-idle { background: #d9d9d9; }
.status-running { background: #52c41a; animation: pulse 1s infinite; }
.status-error { background: #ff4d4f; animation: pulse 0.5s infinite; }
.sorter-speed { margin-left: auto; color: #999; }
</style>