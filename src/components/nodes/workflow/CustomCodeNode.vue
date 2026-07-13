<template>
  <div class="custom-code-node">
    <div class="node-header">
      <span class="node-icon">{ }</span>
      <span class="node-title">{{ label }}</span>
    </div>
    <div class="node-body">
      <textarea
          :value="code"
          @input="updateCode($event)"
          class="code-editor"
          rows="4"
          placeholder='// 编写自定义 JavaScript 代码
// 可用变量：context（上下文对象）
// 返回值：继续执行或跳转到指定节点
return { next: "node-id" };'
      ></textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 自定义代码节点
 * 允许用户编写任意 JavaScript 代码，实现灵活的编排逻辑
 */
const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || '自定义代码')
const code = ref(data.value.code || '// 编写你的代码\nreturn { next: null };')

function updateCode(event: Event) {
  const target = event.target as HTMLTextAreaElement
  code.value = target.value
  saveToNode()
}

function saveToNode() {
  if (props.node) {
    const currentData = props.node.getData() || {}
    props.node.setData({
      ...currentData,
      label: label.value,
      code: code.value,
    })
  }
}

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current.getData()
  if (newData) {
    label.value = newData.label || '自定义代码'
    code.value = newData.code || '// 编写你的代码\nreturn { next: null };'
  }
})

defineExpose({
  getCode: () => code.value,
  setCode: (newCode: string) => {
    code.value = newCode
    saveToNode()
  },
})
</script>

<style scoped>
.custom-code-node {
  min-width: 280px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #13c2c2;
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
  color: #13c2c2;
}
.node-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.node-body {
  font-size: 12px;
}
.code-editor {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  background: #fafafa;
  resize: vertical;
  min-height: 80px;
}
.code-editor:focus {
  outline: none;
  border-color: #13c2c2;
  box-shadow: 0 0 0 2px rgba(19, 194, 194, 0.2);
}
</style>