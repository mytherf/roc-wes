<template>
  <div class="workflow-end-node">
    <div class="node-icon">■</div>
    <div class="node-label">{{ label }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 工作流结束节点
 * 工作流的终点，可以有多个结束节点
 */
const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || '结束')

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current.getData()
  if (newData) {
    label.value = newData.label || '结束'
  }
})

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
.workflow-end-node {
  width: 120px;
  height: 50px;
  background: #ff4d4f;
  border-radius: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(255, 77, 79, 0.3);
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