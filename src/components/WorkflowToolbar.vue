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
    <button class="toolbar-btn" @click="handleImport" title="从 JSON 文件导入">
      📤 导入
    </button>
    <button class="toolbar-btn" @click="handleClear" title="清空画布">
      🗑 清空
    </button>
    <button class="toolbar-btn run" @click="handleRun" title="运行模式">
      ▶ 运行
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
 * 运行模式：导出数据到 sessionStorage，在新窗口打开运行态页面
 */
function handleRun() {
  if (!props.graph) {
    console.warn('画布未初始化，无法运行')
    return
  }

  const nodes = props.graph.getNodes()
  if (nodes.length === 0) {
    alert('画布为空，请先添加节点')
    return
  }

  // 1. 获取当前画布数据
  const rawData = props.graph.toJSON()
  const data = {
    nodes: rawData.cells.filter((cell: any) => !('source' in cell && 'target' in cell)),
    edges: rawData.cells.filter((cell: any) => 'source' in cell && 'target' in cell),
  }

  // 2. 存入 sessionStorage
  try {
    const jsonStr = JSON.stringify(data)
    if (jsonStr.length > 4.5 * 1024 * 1024) {
      alert('画布数据过大（超过 4.5MB），请精简内容后重试')
      return
    }
    sessionStorage.setItem('scada-run-data', jsonStr)

    // 3. 在新窗口打开运行态页面
    const runUrl = `${window.location.origin}/run`
    window.open(runUrl, '_blank')
  } catch (error) {
    console.error('运行数据保存失败:', error)
    alert('运行数据保存失败，请检查控制台错误')
  }
}

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
 * 导出工作流为 JSON（Store 格式：{ nodes: [], edges: [] }）
 */
function handleExport() {
  if (!props.graph) return
  const rawData = props.graph.toJSON()
  const data = {
    nodes: rawData.cells
        .filter((cell: any) => !('source' in cell && 'target' in cell))
        .map((node: any) => ({
          ...node,
          x: node.position?.x ?? node.x ?? 0,
          y: node.position?.y ?? node.y ?? 0,
        })),
    edges: rawData.cells.filter(
        (cell: any) => 'source' in cell && 'target' in cell
    ),
  }
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
 * 从 JSON 文件导入画布数据（Store 格式：{ nodes: [], edges: [] }）
 */
function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        if (!json.nodes || !json.edges) {
          alert('无效的 JSON 格式，需要 { nodes: [], edges: [] } 结构')
          return
        }
        editorStore.setGraphData({ nodes: json.nodes, edges: json.edges })
        editorStore.pushHistory()
        console.log(`✅ 导入成功：${json.nodes.length} 个节点，${json.edges.length} 条边`)
      } catch (err) {
        console.error('导入失败:', err)
        alert('JSON 解析失败，请检查文件格式')
      }
    }
    reader.readAsText(file)
  }
  input.click()
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
.toolbar-btn.run {
  background: #52c41a;
  color: #fff;
  border-color: #52c41a;
}
.toolbar-btn.run:hover {
  background: #73d13d;
  border-color: #73d13d;
}
</style>