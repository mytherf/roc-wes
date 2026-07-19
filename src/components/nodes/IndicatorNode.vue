<template>
  <div class="indicator-node">
    <div class="indicator-label">{{ label }}</div>
    <div class="indicator-body">
      <div class="indicator-light" :class="statusClass"></div>
      <span class="indicator-status">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ node: any }>()

const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || '指示灯')
const status = ref(data.value.status || 'off') // 'on' | 'off' | 'warning' | 'error'

const statusClass = computed(() => ({
  'light-on': status.value === 'on',
  'light-off': status.value === 'off',
  'light-warning': status.value === 'warning',
  'light-error': status.value === 'error',
}))

const statusText = computed(() => {
  const map: Record<string, string> = {
    on: '运行中',
    off: '已停止',
    warning: '告警',
    error: '故障',
  }
  return map[status.value] || '未知'
})

// 监听数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    label.value = newData.label || '指示灯'
    status.value = newData.status || 'off'
  }
})

// 暴露更新方法
defineExpose({ setStatus: (s: string) => { status.value = s } })
</script>

<style scoped>
.indicator-node {
  width: 120px;
  height: 70px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  padding: 10px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  justify-content: center;
  user-select: none;
}
.indicator-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 6px;
}
.indicator-body {
  display: flex;
  align-items: center;
  gap: 10px;
}
.indicator-light {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  transition: all 0.3s;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
}
.light-on {
  background: #52c41a;
  box-shadow: 0 0 12px rgba(82, 196, 26, 0.5);
}
.light-off {
  background: #d9d9d9;
}
.light-warning {
  background: #faad14;
  box-shadow: 0 0 12px rgba(250, 173, 20, 0.5);
  animation: blink 0.8s infinite;
}
.light-error {
  background: #ff4d4f;
  box-shadow: 0 0 12px rgba(255, 77, 79, 0.5);
  animation: blink 0.5s infinite;
}
.indicator-status {
  font-size: 13px;
  color: #333;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>