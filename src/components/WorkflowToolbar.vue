<template>
  <div class="workflow-toolbar">
    <button class="toolbar-btn" @click="handleValidate" title="校验工作流">
      ✅ 校验
    </button>
    <button class="toolbar-btn primary" @click="handleExecute" title="执行工作流">
      ▶ 执行
    </button>
    <button class="toolbar-btn" @click="handleExport" title="导出为 JSON">
      📥 导出
    </button>
    <button class="toolbar-btn" @click="handleClear" title="清空画布">
      🗑 清空
    </button>
    <div class="toolbar-status" v-if="validationResult">
      <span v-if="validationResult.valid" class="status-valid">✅ 校验通过</span>
      <span v-else class="status-invalid">❌ 校验失败：{{ validationResult.errors.join('；') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { DagValidator } from '@/services/workflow/DagValidator'
import { WorkflowEngine } from '@/services/workflow/WorkflowEngine'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{
  graph: any
}>()

const editorStore = useEditorStore()
const validationResult = ref<any>(null)
const isExecuting = ref(false)

/**
 * 校验工作流
 */
function handleValidate() {
  if (!props.graph) return

  const validator = new DagValidator(props.graph)
  const result = validator.validate()
  validationResult.value = result

  if (result.valid) {
    console.log('✅ 工作流校验通过')
    if (result.warnings.length > 0) {
      console.warn('⚠️ 警告:', result.warnings)
    }
  } else {
    console.error('❌ 校验失败:', result.errors)
  }
}

/**
 * 执行工作流
 */
async function handleExecute() {
  if (!props.graph || isExecuting.value) return

  // 先校验
  const validator = new DagValidator(props.graph)
  const result = validator.validate()
  if (!result.valid) {
    alert(`工作流校验失败：\n${result.errors.join('\n')}`)
    return
  }

  // 查找开始节点
  const nodes = props.graph.getNodes()
  const startNode = nodes.find((n: any) => n.shape === 'workflow-start')
  if (!startNode) {
    alert('未找到开始节点')
    return
  }

  isExecuting.value = true
  try {
    const engine = new WorkflowEngine(props.graph, {
      // 可以从输入框或表单获取输入参数
      amount: 15000,
      userId: 'user-001',
    })

    const execResult = await engine.execute(startNode.id)
    console.log('执行结果:', execResult)

    if (execResult.success) {
      alert(`✅ 工作流执行成功！\n执行节点：${execResult.executedNodes.join(' → ')}`)
    } else {
      alert(`❌ 工作流执行失败：${execResult.error}`)
    }
  } catch (error: any) {
    alert(`执行异常：${error.message}`)
  } finally {
    isExecuting.value = false
  }
}

/**
 * 导出工作流为 JSON
 */
function handleExport() {
  if (!props.graph) return
  const data = props.graph.toJSON()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workflow-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 清空画布（带确认）
 */
function handleClear() {
  if (!props.graph) return
  if (confirm('确定要清空画布吗？')) {
    props.graph.clearCells()
    editorStore.resetGraph()
  }
}
</script>

<style scoped>
.workflow-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  flex-wrap: wrap;
}
.toolbar-btn {
  padding: 4px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.toolbar-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}
.toolbar-btn.primary {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}
.toolbar-btn.primary:hover {
  background: #40a9ff;
  border-color: #40a9ff;
}
.toolbar-status {
  margin-left: 12px;
  font-size: 13px;
}
.status-valid {
  color: #52c41a;
}
.status-invalid {
  color: #ff4d4f;
}
</style>