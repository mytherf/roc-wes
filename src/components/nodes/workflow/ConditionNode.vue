<template>
  <div class="condition-node">
    <div class="node-header">
      <span class="node-icon">◇</span>
      <span class="node-title">{{ label }}</span>
    </div>
    <div class="node-body">
      <div class="condition-editor">
        <div
            v-for="(branch, index) in branches"
            :key="index"
            class="branch-item"
        >
          <span class="branch-label">{{ branch.label }}</span>
          <span class="branch-expression">{{ branch.expression || '未配置' }}</span>
        </div>
        <button class="add-branch-btn" @click.stop="addBranch">+ 添加分支</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 条件判断节点
 * 支持多分支条件判断，每个分支有一个表达式
 * 工作流运行时根据表达式的结果选择对应分支
 */
const props = defineProps<{
  node: any
}>()

// 从节点数据读取配置
const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || '条件判断')

// 分支列表：每个分支包含 label（分支名称）和 expression（条件表达式）
const branches = ref<Array<{ id: string; label: string; expression: string }>>(
    data.value.branches || [
      { id: 'branch-1', label: '分支 1', expression: '${amount} > 10000' },
      { id: 'branch-2', label: '分支 2', expression: '${amount} <= 10000' },
    ]
)

/**
 * 添加新分支
 */
function addBranch() {
  const newBranch = {
    id: `branch-${Date.now()}`,
    label: `分支 ${branches.value.length + 1}`,
    expression: '',
  }
  branches.value.push(newBranch)
  saveToNode()
}

/**
 * 删除分支
 */
function removeBranch(index: number) {
  if (branches.value.length <= 2) {
    console.warn('条件判断至少需要 2 个分支')
    return
  }
  branches.value.splice(index, 1)
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
      branches: branches.value,
    })
  }
}

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    label.value = newData.label || '条件判断'
    if (newData.branches) {
      branches.value = newData.branches
    }
  }
})

defineExpose({
  getBranches: () => branches.value,
  addBranch,
  removeBranch,
})
</script>

<style scoped>
.condition-node {
  min-width: 200px;
  min-height: 120px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #faad14;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 12px;
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
  color: #faad14;
}
.node-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.node-body {
  font-size: 12px;
}
.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: #fafafa;
  border-radius: 4px;
  margin-bottom: 4px;
}
.branch-label {
  font-weight: 500;
  color: #333;
  min-width: 50px;
}
.branch-expression {
  color: #666;
  font-family: monospace;
  font-size: 11px;
}
.add-branch-btn {
  margin-top: 4px;
  padding: 2px 12px;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  background: transparent;
  color: #1890ff;
  cursor: pointer;
  font-size: 12px;
}
.add-branch-btn:hover {
  border-color: #1890ff;
  background: #e6f7ff;
}
</style>