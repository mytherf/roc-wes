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
import { computed } from 'vue'
import { useNodeData } from '@/composables/useNodeData'
import { useNodeStatus } from '@/composables/useNodeStatus'

const props = defineProps<{
  node: any
}>()

const { name, position, status } = useNodeData(props.node, {
  name: '穿梭车-01',
  position: 50, // 0-100
  status: 'idle',
})

const { statusClass, statusText } = useNodeStatus(status)

const positionPercent = computed(() => Math.min(100, Math.max(0, position.value)))
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