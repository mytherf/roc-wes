<template>
  <div class="timer-node">
    <div class="node-header">
      <span class="node-icon">⏱</span>
      <span class="node-title">{{ label }}</span>
    </div>
    <div class="node-body">
      <div class="config-row">
        <span class="config-label">等待时间：</span>
        <input
            type="number"
            :value="duration"
            @input="updateDuration($event)"
            class="config-input"
            min="0"
            step="1"
        />
        <select :value="unit" @change="updateUnit($event)" class="config-select">
          <option value="seconds">秒</option>
          <option value="minutes">分钟</option>
          <option value="hours">小时</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 定时器节点
 * 工作流执行到该节点时，等待指定时间后继续执行
 */
const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || '定时器')
const duration = ref(data.value.duration ?? 5)
const unit = ref(data.value.unit || 'seconds')

/**
 * 更新等待时长
 */
function updateDuration(event: Event) {
  const target = event.target as HTMLInputElement
  duration.value = parseFloat(target.value) || 0
  saveToNode()
}

/**
 * 更新时间单位
 */
function updateUnit(event: Event) {
  const target = event.target as HTMLSelectElement
  unit.value = target.value
  saveToNode()
}

/**
 * 保存到节点数据
 */
function saveToNode() {
  if (props.node) {
    const currentData = props.node.getData() || {}
    props.node.setData({
      ...currentData,
      label: label.value,
      duration: duration.value,
      unit: unit.value,
    })
  }
}

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    label.value = newData.label || '定时器'
    duration.value = newData.duration ?? 5
    unit.value = newData.unit || 'seconds'
  }
})

defineExpose({
  getConfig: () => ({ duration: duration.value, unit: unit.value }),
})
</script>

<style scoped>
.timer-node {
  min-width: 180px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #1890ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.node-icon {
  font-size: 18px;
}
.node-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.node-body {
  font-size: 12px;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.config-label {
  color: #666;
}
.config-input {
  width: 60px;
  padding: 2px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
.config-select {
  padding: 2px 4px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
</style>