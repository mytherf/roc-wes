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
import { useNodeData } from '@/composables/useNodeData'
import { useNodeStatus } from '@/composables/useNodeStatus'

const props = defineProps<{
  node: any
}>()

const { name, speed, status, chutes } = useNodeData(props.node, {
  name: '分拣机-01',
  speed: 60,
  status: 'idle',
  chutes: [
    { label: 'A区', count: 0, active: false },
    { label: 'B区', count: 0, active: false },
    { label: 'C区', count: 0, active: false },
    { label: 'D区', count: 0, active: false },
  ],
})

const { statusClass, statusText } = useNodeStatus(status)
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