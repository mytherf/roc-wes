<template>
  <div class="robot-node">
    <div class="robot-arm">
      <div class="arm-base"></div>
      <div class="arm-joint" :style="{ transform: 'rotate(' + jointAngle + 'deg)' }">
        <div class="arm-link"></div>
        <div class="arm-gripper" :class="{ 'gripper-open': isOpen }"></div>
      </div>
    </div>
    <div class="robot-info">
      <span class="robot-name">{{ name }}</span>
      <span class="robot-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '机械手-01')
const jointAngle = ref(data.value.jointAngle || 0)
const isOpen = ref(data.value.isOpen || false)
const status = ref(data.value.status || 'idle')

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
    name.value = newData.name || '机械手-01'
    jointAngle.value = newData.jointAngle || 0
    isOpen.value = newData.isOpen || false
    status.value = newData.status || 'idle'
  }
})
</script>

<style scoped>
.robot-node {
  min-width: 120px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #eb2f96;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.robot-arm {
  height: 60px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
}
.arm-base {
  width: 20px;
  height: 10px;
  background: #666;
  border-radius: 4px 4px 0 0;
  position: absolute;
  bottom: 0;
}
.arm-joint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform-origin: bottom center;
  transition: transform 0.5s ease;
}
.arm-link {
  width: 4px;
  height: 30px;
  background: #1890ff;
  margin: 0 auto;
  border-radius: 2px;
}
.arm-gripper {
  width: 12px;
  height: 6px;
  background: #666;
  margin: 0 auto;
  border-radius: 2px 2px 4px 4px;
  transition: all 0.3s;
}
.gripper-open { width: 16px; height: 4px; }
.robot-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 8px;
}
.robot-name { font-weight: 500; color: #333; }
.robot-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: #999; }
.status-running { color: #eb2f96; }
.status-error { color: #ff4d4f; }
</style>