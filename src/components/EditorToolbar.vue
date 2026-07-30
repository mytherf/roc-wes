<template>
  <div class="editor-toolbar">
    <button class="toolbar-btn primary" @click="handleSave" title="保存画布到本地（Ctrl+S）">
      {{ savedTip ? '✅ 已保存' : '💾 保存' }}
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
    <button class="toolbar-btn" @click="showDataSourceDialog = true" title="管理数据源实例">
      🔌 数据源管理
    </button>
    <!-- 显示模式分段选择器：高亮当前模式，点击另一项切换 -->
    <div class="mode-switcher" title="节点显示模式">
      <button
        class="mode-option"
        :class="{ active: displayMode === 'full' }"
        @click="editorStore.setDisplayMode('full')"
      >🔲 极简</button>
      <button
        class="mode-option"
        :class="{ active: displayMode === 'icon' }"
        @click="editorStore.setDisplayMode('icon')"
      >🖼️ 图标</button>
    </div>
    <button class="toolbar-btn run" @click="handleRun" title="运行模式">
      ▶ 预览
    </button>
    <!-- 数据源管理对话框 -->
    <DataSourceDialog
      v-if="showDataSourceDialog"
      @close="showDataSourceDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { serializeGraph } from '@/utils/graphSerializer'
import DataSourceDialog from '@/components/DataSourceDialog.vue'

const props = defineProps<{
  graph: any
}>()

const editorStore = useEditorStore()
// 数据源管理对话框显隐
const showDataSourceDialog = ref(false)
// 「已保存」提示（保存成功后短暂显示）
const savedTip = ref(false)
let savedTipTimer: number | null = null

/**
 * 保存画布到本地（手动触发，替代此前的实时自动保存）
 */
function handleSave() {
  const ok = editorStore.saveToStorage()
  if (!ok) {
    alert('保存失败，请检查控制台错误')
    return
  }
  savedTip.value = true
  if (savedTipTimer) clearTimeout(savedTipTimer)
  savedTipTimer = window.setTimeout(() => {
    savedTip.value = false
    savedTipTimer = null
  }, 1500)
}

// 节点显示模式（图标模式 ↔ 极简模式）
const displayMode = computed(() => editorStore.displayMode)

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
  const data = serializeGraph(props.graph)

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
 * 导出画布为 JSON（Store 格式：{ nodes: [], edges: [] }）
 */
function handleExport() {
  if (!props.graph) return
  const data = serializeGraph(props.graph)
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scada-${Date.now()}.json`
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
.editor-toolbar {
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
.toolbar-btn.run {
  background: #52c41a;
  color: #fff;
  border-color: #52c41a;
}
.toolbar-btn.run:hover {
  background: #73d13d;
  border-color: #73d13d;
}
/* 显示模式分段选择器 */
.mode-switcher {
  display: inline-flex;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
}
.mode-option {
  padding: 4px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #666;
  transition: all 0.2s;
  white-space: nowrap;
}
.mode-option + .mode-option {
  border-left: 1px solid #d9d9d9;
}
.mode-option:hover:not(.active) {
  color: #1890ff;
  background: #e6f7ff;
}
.mode-option.active {
  background: #1890ff;
  color: #fff;
  cursor: default;
}
</style>
