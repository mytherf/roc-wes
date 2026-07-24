<template>
  <div class="workflow-start-node">
    <div class="node-icon">▶</div>
    <div class="node-label">{{ label }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 工作流开始节点
 * 工作流的唯一入口，每个工作流有且仅有一个开始节点
 */
const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || '开始')

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    label.value = newData.label || '开始'
  }
})

// 暴露方法
defineExpose({
  getLabel: () => label.value,
  setLabel: (newLabel: string) => {
    label.value = newLabel
    if (props.node) {
      const currentData = props.node.getData() || {}
      props.node.setData({ ...currentData, label: newLabel })
    }
  },
})
</script>

<style scoped>
.workflow-start-node {
  width: 120px;
  height: 50px;
  background: #52c41a;
  border-radius: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(82, 196, 26, 0.3);
  user-select: none;
  cursor: pointer;
}
.node-icon {
  font-size: 16px;
}
.node-label {
  font-size: 14px;
}
</style>