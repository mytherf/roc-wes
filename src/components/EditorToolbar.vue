<!-- ══════════════════════════════════════════════════════════════════════
     EditorToolbar.vue - 编辑器顶部工具栏（一排“主操作按钮”）

     按功能分组：
       1. 文件操作：保存（Ctrl+S，落盘 editor.json）/ 导出 JSON / 导入 JSON / 清空画布
       2. 数据：数据源管理对话框 / 路线面板
       3. 视图：节点显示模式切换（极简 / 图标）
       4. 运行：▶ 预览（序列化画布写入 run-preview.json 文件，新窗口打开运行态）
       5. 右侧：主题切换（暗色工业 / 亮色现代 / 深蓝科技）

     保存机制说明：本项目改为「手动保存」（Ctrl+S 或点按钮），
     不再实时自动保存；所有数据落盘到应用配置目录的 JSON 文件（Tauri FS）。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="editor-toolbar">
    <!-- 分组：文件操作 -->
    <div class="toolbar-group">
      <button class="toolbar-btn primary" @click="handleSave" title="保存画布到本地（Ctrl+S）">
        {{ savedTip ? '✅ 已保存' : '💾 保存' }}
      </button>
      <button class="toolbar-btn" @click="handleExport" title="导出为 JSON">
        📥 导出
      </button>
      <button class="toolbar-btn" @click="handleImport" title="从 JSON 文件导入">
        📤 导入
      </button>
      <button class="toolbar-btn danger" @click="handleClear" title="清空画布">
        🗑 清空
      </button>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：数据 -->
    <div class="toolbar-group">
      <button class="toolbar-btn" @click="showDataSourceDialog = true" title="管理数据源实例">
        🔌 数据源
      </button>
      <button class="toolbar-btn" @click="openRoutePanel" title="管理路线">
        🛤️ 路线
      </button>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：视图 -->
    <div class="toolbar-group">
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
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：运行 -->
    <div class="toolbar-group">
      <button class="toolbar-btn run" @click="handleRun" title="运行模式">
        ▶ 预览
      </button>
    </div>

    <!-- 右侧：主题切换 -->
    <div class="toolbar-spacer" />
    <div class="toolbar-group theme-switcher">
      <button
        v-for="t in THEMES"
        :key="t.key"
        class="theme-btn"
        :class="{ active: themeStore.current === t.key }"
        :title="t.description"
        @click="themeStore.applyTheme(t.key)"
      >{{ t.icon }}</button>
    </div>

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
import { useDataSourceStore } from '@/stores/dataSource'
import { useRouteStore } from '@/stores/route'
import { serializeGraph } from '@/utils/graphSerializer'
import { writeJsonFile } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）
import DataSourceDialog from '@/components/DataSourceDialog.vue'
import { useThemeStore, THEMES } from '@/stores/theme'

const props = defineProps<{
  graph: any
}>()

const editorStore = useEditorStore()
const themeStore = useThemeStore()
const routeStore = useRouteStore()
// 数据源管理对话框显隐
const showDataSourceDialog = ref(false)
// 「已保存」提示（保存成功后短暂显示）
const savedTip = ref(false)
let savedTipTimer: number | null = null

/**
 * 保存画布到文件（手动触发；异步写入应用配置目录的 editor.json）
 */
async function handleSave() {
  const ok = await editorStore.saveToStorage()
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

// 展开底部路线面板
function openRoutePanel() {
  editorStore.setBottomCollapsed(false)
}

/**
 * 运行模式：序列化画布写入 run-preview.json 文件，在新窗口打开运行态页面
 * （文件落盘替代 sessionStorage：文件容量不受限，且新窗口可可靠读取）
 */
async function handleRun() {
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

  // 2. 写入预览快照文件（运行态窗口启动后由 RunView 读取）
  const ok = await writeJsonFile('run-preview.json', data)
  if (!ok) {
    alert('运行数据写入失败，请检查控制台错误')
    return
  }

  // 3. 在新窗口打开运行态页面
  const runUrl = `${window.location.origin}/run`
  window.open(runUrl, '_blank')
}

/**
 * 导出画布为 JSON（Store 格式：{ nodes: [], edges: [], routes: [] }）
 * 路线数据随画布一并导出
 */
function handleExport() {
  if (!props.graph) return
  const data = serializeGraph(props.graph)
  const payload = { ...data, routes: routeStore.routes }
  const json = JSON.stringify(payload, null, 2)
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

        // 模板文件可携带 dataSources，导入时自动合并（跳过已存在的同 id 数据源）
        if (Array.isArray(json.dataSources) && json.dataSources.length > 0) {
          const dsStore = useDataSourceStore()
          let added = 0
          for (const ds of json.dataSources) {
            if (!ds.id || !ds.type || !ds.url) continue
            if (!dsStore.getDataSource(ds.id)) {
              dsStore.dataSources.push(ds)
              added++
            }
          }
          console.log(`✅ 导入数据源：新增 ${added} 个，跳过 ${json.dataSources.length - added} 个已存在`)
        }

        // 模板文件可携带 routes，导入时自动合并（按 id 去重）
        if (Array.isArray(json.routes) && json.routes.length > 0) {
          const res = routeStore.importRoutes(JSON.stringify(json.routes))
          console.log(`✅ 导入路线：新增 ${res.added} 条，跳过 ${res.skipped} 条已存在`)
        }

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
  gap: 0;
  padding: 6px 12px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  z-index: 10;
}

/* 按钮分组容器 */
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 分组分隔线 */
.toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 8px;
  flex-shrink: 0;
}

/* 弹性空间（将主题切换推到右侧） */
.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--panel-bg);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  transition: all 0.15s ease;
  white-space: nowrap;
}
.toolbar-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.toolbar-btn:active {
  transform: scale(0.97);
}
.toolbar-btn.primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.toolbar-btn.primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: #fff;
}
.toolbar-btn.danger:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.06);
}
.toolbar-btn.run {
  background: var(--color-success);
  color: #fff;
  border-color: var(--color-success);
}
.toolbar-btn.run:hover {
  filter: brightness(1.1);
  color: #fff;
}

/* 显示模式分段选择器 */
.mode-switcher {
  display: inline-flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--statusbar-bg);
}
.mode-option {
  padding: 5px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  white-space: nowrap;
}
.mode-option + .mode-option {
  border-left: 1px solid var(--border-color);
}
.mode-option:hover:not(.active) {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.mode-option.active {
  background: var(--color-primary);
  color: #fff;
  cursor: default;
}

/* 主题切换按钮组 */
.theme-switcher {
  gap: 2px;
  padding: 2px;
  background: var(--statusbar-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}
.theme-btn {
  width: 28px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
  opacity: 0.6;
}
.theme-btn:hover {
  opacity: 1;
  background: var(--color-primary-light);
}
.theme-btn.active {
  opacity: 1;
  background: var(--color-primary-light);
  box-shadow: 0 0 0 1.5px var(--color-primary);
}
</style>
