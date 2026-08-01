<template>
  <NodeMinimalView v-if="isMinimal" icon="🚗" :name="name" :status="status" />
  <div v-else class="shuttle-node">
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
import { useDisplayMode } from '@/composables/useDisplayMode'
import NodeMinimalView from './NodeMinimalView.vue'

const props = defineProps<{
  node: any
}>()

const { isMinimal } = useDisplayMode(props.node)

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
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 10px 14px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid #13c2c2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.shuttle-body { padding: 8px 0; }
.shuttle-track {
  height: 30px;
  background: var(--statusbar-bg);
  border-radius: 15px;
  position: relative;
  border: 1px solid var(--border-color);
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
.shuttle-name { font-weight: 500; color: var(--text-primary); }
.shuttle-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: var(--text-muted); }
.status-running { color: #13c2c2; }
.status-error { color: #ff4d4f; }
</style>