<!-- ══════════════════════════════════════════════════════════════════════
     EditorToolbar.vue - 编辑器顶部工具栏（一排“主操作按钮”）

     按功能分组：
       1. 文件操作：保存（Ctrl+S，落盘 editor.json）/ 清空画布（工程导入导出在工程管理弹窗中）
       2. 数据：数据源管理对话框
       3. 视图：节点显示模式切换（极简 / 图标）
       4. 运行：▶ 预览（序列化画布写入 run-preview.json 文件，新窗口打开运行态）
       5. 右侧：主题切换（暗色工业 / 亮色现代 / 深蓝科技）

     保存机制说明：本项目改为「手动保存」（Ctrl+S 或点按钮），
     不再实时自动保存；所有数据落盘到应用配置目录的 JSON 文件（Tauri FS）。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="editor-toolbar">
    <!-- 分组：工程（多工程选择器：切换 / 新建 / 管理） -->
    <div class="toolbar-group project-selector">
      <button class="toolbar-btn project-btn" @click.stop="toggleProjectMenu" title="切换或管理工程">
        📁 {{ projectStore.currentProject?.name ?? '工程' }} ▾
      </button>
      <div v-if="projectMenuOpen" class="project-menu" @click.stop>
        <div class="project-menu-title">切换到工程</div>
        <div
          v-for="p in projectStore.projects"
          :key="p.id"
          class="project-menu-item"
          :class="{ active: p.id === projectStore.currentId }"
          @click="chooseProject(p.id)"
        >
          <span class="project-menu-name">{{ p.name }}</span>
          <span v-if="p.id === projectStore.currentId" class="project-menu-check">✓</span>
        </div>
        <div class="project-menu-divider" />
        <div class="project-menu-item" @click="openProjectDialog">➕ 新建工程…</div>
        <div class="project-menu-item" @click="handleImportProject">📤 导入工程…</div>
        <div class="project-menu-item" @click="openProjectDialog">🗂 管理工程…</div>
      </div>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：文件操作 -->
    <div class="toolbar-group">
      <button class="toolbar-btn primary" @click="handleSave" title="保存画布到本地（Ctrl+S）">
        {{ savedTip ? '✅ 已保存' : '💾 保存' }}
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

    <!-- 工程管理对话框（新建/切换/重命名/复制/删除） -->
    <ProjectManagerDialog v-if="showProjectDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project' // 多工程管理
import { serializeGraph } from '@/utils/graphSerializer'
import { writeJsonFile, getLastFileError } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）
import DataSourceDialog from '@/components/DataSourceDialog.vue'
import ProjectManagerDialog from '@/components/ProjectManagerDialog.vue'
import { useThemeStore, THEMES } from '@/stores/theme'

const props = defineProps<{
  graph: any
}>()

const editorStore = useEditorStore()
const themeStore = useThemeStore()
const projectStore = useProjectStore()
// 数据源管理对话框显隐（绑定 store，属性面板等兄弟组件也可跳转打开）
const showDataSourceDialog = computed({
  get: () => editorStore.dataSourceDialogOpen,
  set: (v: boolean) => editorStore.setDataSourceDialogOpen(v),
})
// 工程管理对话框显隐（绑定 store，供工程管理弹窗内部关闭时同步状态）
const showProjectDialog = computed(() => editorStore.projectDialogOpen)

// ---------- 工程选择器下拉 ----------
const projectMenuOpen = ref(false)

function toggleProjectMenu() {
  projectMenuOpen.value = !projectMenuOpen.value
}

/** 选择切换到某个工程（先保存当前工程再重载） */
async function chooseProject(id: string) {
  projectMenuOpen.value = false
  await projectStore.switchProject(id)
}

/** 打开工程管理弹窗（新建/管理共用） */
function openProjectDialog() {
  projectMenuOpen.value = false
  editorStore.setProjectDialogOpen(true)
}

/**
 * 导入工程文件（一级菜单入口）：选择 JSON → 新建一个工程并载入三件套 → 切换过去。
 * 兼容 rocwes-project 工程文件格式与旧版画布格式 { nodes, edges }。
 */
function handleImportProject() {
  projectMenuOpen.value = false
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result as string)
        const meta = await projectStore.importProjectFile(payload)
        if (!meta) {
          alert('无效的工程文件：需要 rocwes-project 格式，或旧版画布格式 { nodes: [], edges: [] }')
          return
        }
        console.log(`✅ 导入工程成功：「${meta.name}」`)
      } catch (err) {
        console.error('导入失败:', err)
        alert('JSON 解析失败，请检查文件格式')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

// 点击工具栏以外区域关闭工程下拉菜单
function onDocClickCloseProjectMenu() {
  projectMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClickCloseProjectMenu))
onBeforeUnmount(() => document.removeEventListener('click', onDocClickCloseProjectMenu))
// 「已保存」提示（保存成功后短暂显示）
const savedTip = ref(false)
let savedTipTimer: number | null = null

/**
 * 保存画布到文件（手动触发；异步写入应用配置目录的 editor.json）
 */
async function handleSave() {
  const ok = await editorStore.saveToStorage()
  if (!ok) {
    // 展示具体失败原因（fileStorage 记录的最近一次错误），便于定位环境问题
    alert(`保存失败：${getLastFileError() || '未知错误，请查看控制台'}`)
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
 * 运行模式：序列化画布写入 run-preview.json 文件，在新窗口打开运行态页面
 * （文件交接容量不受限，且新窗口可可靠读取）
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
    alert(`运行数据写入失败：${getLastFileError() || '未知错误，请查看控制台'}`)
    return
  }

  // 3. 在新窗口打开运行态页面
  const runUrl = `${window.location.origin}/run`
  window.open(runUrl, '_blank')
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

/* ---------- 工程选择器下拉菜单 ---------- */
.project-selector {
  position: relative;
}
.project-btn {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.project-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  max-width: 280px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: 4px;
}
.project-menu-title {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
}
.project-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
}
.project-menu-item:hover {
  background: var(--color-primary-light);
}
.project-menu-item.active {
  color: var(--color-primary);
  font-weight: 500;
}
.project-menu-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.project-menu-check {
  flex-shrink: 0;
  color: var(--color-primary);
}
.project-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 6px;
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
