<!-- ══════════════════════════════════════════════════════════════════════
     EditorToolbar.vue - 编辑器顶部工具栏（一排“主操作按钮”）

     按功能分组：
       1. 文件操作：保存（Ctrl+S，落盘 editor.json）；撤销/重做（X6 History 插件）
       2. 数据：数据源管理对话框
       3. 操作：下拉菜单（含显示模式切换：极简 / 图标；清空画布（二次确认））
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
        <div class="project-menu-item" @click="handleImportProject" title="Ctrl+O">📤 导入工程…</div>
        <div class="project-menu-item" @click="openProjectDialog">🗂 管理工程…</div>
      </div>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：文件操作 -->
    <div class="toolbar-group">
      <button class="toolbar-btn primary save-btn" :class="{ saved: savedTip }" @click="handleSave" title="保存画布到本地（Ctrl+S）">
        {{ savedTip ? '✅ 已保存' : '💾 保存' }}
      </button>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：撤销/重做（X6 History 插件命令栈，禁用态由 history:change 事件刷新） -->
    <div class="toolbar-group">
      <button class="toolbar-btn" :disabled="!canUndo" @click="handleUndo" title="撤销（Ctrl+Z）">
        ↩ 撤销
      </button>
      <button class="toolbar-btn" :disabled="!canRedo" @click="handleRedo" title="重做（Ctrl+Shift+Z / Ctrl+Y）">
        ↪ 重做
      </button>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：数据 -->
    <div class="toolbar-group">
      <button class="toolbar-btn" @click="showDataSourceDialog = true" title="管理数据源实例（Ctrl+Shift+D）">
        🔌 数据源
      </button>
    </div>

    <div class="toolbar-separator" />

    <!-- 分组：操作（下拉菜单，交互同工程选择器；当前包含「显示模式」子项） -->
    <div class="toolbar-group ops-selector">
      <button class="toolbar-btn ops-btn" @click.stop="toggleOpsMenu" title="操作菜单">
        🛠 操作 ▾
      </button>
      <div v-if="opsMenuOpen" class="ops-menu" @click.stop>
        <!-- 显示模式：点击后在菜单右侧弹出模式选项 -->
        <div class="ops-submenu-wrap">
          <div
            class="ops-menu-item"
            :class="{ active: modeSubOpen }"
            @click="modeSubOpen = !modeSubOpen"
          >
            <span class="ops-menu-name">🔲 显示模式</span>
            <span class="ops-menu-caret">▸</span>
          </div>
          <div v-if="modeSubOpen" class="ops-submenu">
            <div
              v-for="m in DISPLAY_MODES"
              :key="m.key"
              class="ops-menu-item"
              :class="{ active: displayMode === m.key }"
              @click="chooseDisplayMode(m.key)"
            >
              <span class="ops-menu-name">{{ m.icon }} {{ m.label }}</span>
              <span v-if="displayMode === m.key" class="ops-menu-check">✓</span>
            </div>
          </div>
        </div>

        <div class="ops-menu-divider" />
        <!-- 切换显示模式：图标 ↔ 极简（也可用快捷键 Ctrl+Shift+M） -->
        <div class="ops-menu-item" @click="toggleDisplayMode">
          <span class="ops-menu-name">🔁 切换显示模式</span>
          <span class="ops-menu-kbd">Ctrl+Shift+M</span>
        </div>
        <!-- 清空画布：打开应用内确认弹窗（Tauri WebView 会静默拦截 window.confirm，不能用原生弹框） -->
        <div class="ops-menu-item ops-danger" @click="handleClear">
          <span class="ops-menu-name">🗑 清空画布</span>
          <span class="ops-menu-kbd">Ctrl+Shift+Del</span>
        </div>
        <div class="ops-menu-divider" />
        <!-- 快捷键帮助：列出全部可用快捷键 -->
        <div class="ops-menu-item" @click="openShortcutHelp">
          <span class="ops-menu-name">⌨ 快捷键…</span>
          <span class="ops-menu-kbd">F1</span>
        </div>
      </div>
    </div>

    <!-- 快捷键帮助弹窗（应用内自定义，列出全部可用快捷键） -->
    <Teleport to="body">
      <div v-if="shortcutHelpOpen" class="kbd-mask" @click.self="shortcutHelpOpen = false">
        <div class="kbd-dialog" role="dialog" aria-modal="true" aria-label="快捷键列表">
          <div class="kbd-title">⌨ 快捷键</div>
          <div class="kbd-body">
            <div v-for="g in SHORTCUT_GROUPS" :key="g.name" class="kbd-group">
              <div class="kbd-group-name">{{ g.name }}</div>
              <div v-for="s in g.items" :key="s.desc" class="kbd-row">
                <span class="kbd-desc">{{ s.desc }}</span>
                <span class="kbd-key">{{ s.key }}</span>
              </div>
            </div>
          </div>
          <div class="kbd-actions">
            <button class="clear-btn" @click="shortcutHelpOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 清空画布确认弹窗（应用内自定义，替代被 WebView 拦截的 window.confirm） -->
    <Teleport to="body">
      <div v-if="clearConfirmOpen" class="clear-mask" @click.self="clearConfirmOpen = false">
        <div class="clear-dialog" role="alertdialog" aria-modal="true" aria-label="清空画布确认">
          <div class="clear-title">🗑 清空画布</div>
          <div class="clear-msg">确定要清空画布吗？清空后可通过撤销（Ctrl+Z）恢复。</div>
          <div class="clear-actions">
            <button class="clear-btn" @click="clearConfirmOpen = false">取消</button>
            <button class="clear-btn danger" @click="doClearCanvas">确定清空</button>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="toolbar-separator" />

    <!-- 分组：运行 -->
    <div class="toolbar-group">
      <button class="toolbar-btn run" @click="handleRun" title="运行模式（F5）">
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

    <!-- 保存成功 Toast（顶部居中滑入淡出，按钮与 Ctrl+S 保存共用） -->
    <Teleport to="body">
      <Transition name="save-toast">
        <div v-if="saveToast" class="save-toast" role="status">✅ 画布已保存</div>
      </Transition>
    </Teleport>

    <!-- 工程管理对话框（新建/切换/重命名/复制/删除） -->
    <ProjectManagerDialog v-if="showProjectDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project' // 多工程管理
import { serializeGraph } from '@/utils/graphSerializer'
import { writeJsonFile, getLastFileError } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）
import DataSourceDialog from '@/components/DataSourceDialog.vue'
import ProjectManagerDialog from '@/components/ProjectManagerDialog.vue'
import { useThemeStore, THEMES } from '@/stores/theme'
import { openRunWindow } from '@/platform/routeWindow' // 运行预览独立窗口（Tauri WebviewWindow，window.open 会被拦截）

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

// 点击工具栏以外区域关闭工程下拉菜单与操作菜单
function onDocClickCloseProjectMenu() {
  projectMenuOpen.value = false
  opsMenuOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClickCloseProjectMenu)
  window.addEventListener('keydown', onGlobalKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClickCloseProjectMenu)
  window.removeEventListener('keydown', onGlobalKeydown)
})
// 「已保存」反馈动画（按钮弹跳变绿 + 顶部 Toast）：
// 无论保存由「保存」按钮还是 Ctrl+S 触发，都由 store 的 saveFlashSeq 信号统一驱动
const savedTip = ref(false)
const saveToast = ref(false)
let savedTipTimer: number | null = null

/** 播放保存成功反馈动画（连续保存时重置计时器重新播放） */
function playSavedFeedback() {
  savedTip.value = true
  saveToast.value = true
  if (savedTipTimer) clearTimeout(savedTipTimer)
  savedTipTimer = window.setTimeout(() => {
    savedTip.value = false
    saveToast.value = false
    savedTipTimer = null
  }, 1500)
}

// 监听保存成功信号：按钮或 Ctrl+S 保存成功后都会自增，此处统一播动画
watch(() => editorStore.saveFlashSeq, (seq) => {
  if (seq > 0) playSavedFeedback()
})
onBeforeUnmount(() => {
  if (savedTipTimer) clearTimeout(savedTipTimer)
})

/**
 * 保存画布到文件（手动触发；异步写入应用配置目录的 editor.json）
 * 成功后的反馈动画由 saveFlashSeq 监听器播放，此处只处理失败提示
 */
async function handleSave() {
  const ok = await editorStore.saveToStorage()
  if (!ok) {
    // 展示具体失败原因（fileStorage 记录的最近一次错误），便于定位环境问题
    alert(`保存失败：${getLastFileError() || '未知错误，请查看控制台'}`)
  }
}

// 节点显示模式（图标模式 ↔ 极简模式）
const displayMode = computed(() => editorStore.displayMode)

// ---------- 撤销/重做（X6 History 插件） ----------
const canUndo = ref(false)
const canRedo = ref(false)

/** 刷新撤销/重做按钮禁用态（读 graph 命令栈状态） */
function refreshHistoryState() {
  const g = props.graph
  canUndo.value = !!g && typeof g.canUndo === 'function' && g.canUndo()
  canRedo.value = !!g && typeof g.canRedo === 'function' && g.canRedo()
}

// graph 实例由画布就绪后传入：绑定 history:change 事件实时刷新禁用态
watch(() => props.graph, (g, old) => {
  if (old) old.off('history:change', refreshHistoryState)
  if (g) g.on('history:change', refreshHistoryState)
  refreshHistoryState()
}, { immediate: true })

onBeforeUnmount(() => {
  props.graph?.off('history:change', refreshHistoryState)
})

function handleUndo() {
  if (props.graph && props.graph.canUndo()) props.graph.undo()
}

function handleRedo() {
  if (props.graph && props.graph.canRedo()) props.graph.redo()
}

// ---------- 全局快捷键（工具栏级操作；画布编辑类快捷键由 X6Canvas 的 Keyboard 插件负责） ----------
/** 快捷键帮助弹窗显隐 */
const shortcutHelpOpen = ref(false)

/** 快捷键分组数据（供帮助弹窗渲染） */
const SHORTCUT_GROUPS = [
  {
    name: '文件与运行',
    items: [
      { key: 'Ctrl+S', desc: '保存画布' },
      { key: 'F5', desc: '运行预览' },
      { key: 'Ctrl+O', desc: '导入工程' },
      { key: 'F1', desc: '打开本快捷键列表' },
    ],
  },
  {
    name: '视图与面板',
    items: [
      { key: 'Ctrl+Shift+D', desc: '打开数据源管理' },
      { key: 'Ctrl+Shift+M', desc: '切换显示模式（图标 ↔ 极简）' },
      { key: 'Ctrl+= / Ctrl+-', desc: '放大 / 缩小画布' },
      { key: 'Ctrl+0', desc: '重置画布缩放为 100%' },
      { key: '鼠标滚轮 / 右键拖拽', desc: '缩放 / 平移画布' },
    ],
  },
  {
    name: '画布编辑',
    items: [
      { key: 'Ctrl+C / Ctrl+X / Ctrl+V', desc: '复制 / 剪切 / 粘贴' },
      { key: 'Ctrl+D', desc: '复制一份选中内容' },
      { key: 'Delete / Backspace', desc: '删除选中' },
      { key: 'Ctrl+A', desc: '全选' },
      { key: '方向键（Shift 加速）', desc: '微调选中节点位置' },
      { key: 'Esc', desc: '取消选区' },
      { key: 'Ctrl+Z / Ctrl+Shift+Z（Ctrl+Y）', desc: '撤销 / 重做' },
      { key: 'Ctrl+Shift+Delete', desc: '清空画布（需确认）' },
    ],
  },
]

function openShortcutHelp() {
  opsMenuOpen.value = false
  modeSubOpen.value = false
  shortcutHelpOpen.value = true
}

/** 切换显示模式：图标 ↔ 极简（快捷键 Ctrl+Shift+M 与菜单项共用） */
function toggleDisplayMode() {
  opsMenuOpen.value = false
  modeSubOpen.value = false
  editorStore.setDisplayMode(displayMode.value === 'icon' ? 'full' : 'icon')
}

/**
 * 全局键盘监听：处理工具栏级操作的快捷键。
 * 画布编辑类快捷键（复制/粘贴/方向键等）由 X6 Canvas 的 Keyboard 插件绑定，
 * 此处只负责弹窗/菜单类操作。输入控件聚焦时不触发，避免干扰打字。
 */
function onGlobalKeydown(e: KeyboardEvent) {
  // 已被其他处理器（如 X6 Keyboard 插件）消费的事件不再处理
  if (e.defaultPrevented) return
  // 输入框/下拉框/可编辑区域聚焦时忽略快捷键（Ctrl+S 仍可用，其余一律放行）
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT' || target.isContentEditable)) {
    return
  }

  const ctrl = e.ctrlKey || e.metaKey
  const key = e.key

  // F5：运行预览（preventDefault 阻止 WebView 默认刷新）
  if (key === 'F5') {
    e.preventDefault()
    handleRun()
    return
  }
  // F1：打开快捷键帮助
  if (key === 'F1') {
    e.preventDefault()
    shortcutHelpOpen.value = !shortcutHelpOpen.value
    return
  }
  // Esc：关闭快捷键帮助弹窗
  if (key === 'Escape' && shortcutHelpOpen.value) {
    shortcutHelpOpen.value = false
    return
  }
  if (!ctrl) return
  const lower = key.length === 1 ? key.toLowerCase() : key

  // Ctrl+O：导入工程文件
  if (!e.shiftKey && lower === 'o') {
    e.preventDefault()
    handleImportProject()
    return
  }
  // Ctrl+Shift+D：打开数据源管理弹窗
  if (e.shiftKey && lower === 'd') {
    e.preventDefault()
    showDataSourceDialog.value = true
    return
  }
  // Ctrl+Shift+M：切换显示模式（图标 ↔ 极简）
  if (e.shiftKey && lower === 'm') {
    e.preventDefault()
    toggleDisplayMode()
    return
  }
  // Ctrl+Shift+Delete：清空画布（打开二次确认弹窗）
  if (e.shiftKey && key === 'Delete') {
    e.preventDefault()
    handleClear()
  }
}

/** 显示模式选项（key 对应 editorStore.DisplayMode） */
const DISPLAY_MODES = [
  { key: 'full' as const, label: '极简', icon: '🔲' },
  { key: 'icon' as const, label: '图标', icon: '🖼️' },
]

// ---------- 操作下拉菜单（交互同工程选择器） ----------
const opsMenuOpen = ref(false)
// 显示模式右侧子菜单是否展开
const modeSubOpen = ref(false)

function toggleOpsMenu() {
  opsMenuOpen.value = !opsMenuOpen.value
}

/** 选择显示模式：提交 store 并收起整个菜单 */
function chooseDisplayMode(key: 'full' | 'icon') {
  editorStore.setDisplayMode(key)
  opsMenuOpen.value = false
  modeSubOpen.value = false
}

/**
 * 运行模式：序列化画布写入 run-preview.json 文件，在新窗口打开运行态页面
 * （文件交接容量不受限，且新窗口可可靠读取）
 */
async function handleRun() {
  if (!props.graph) {
    console.warn('画布未初始化，无法运行')
    alert('画布未初始化，无法运行')
    return
  }

  const nodes = props.graph.getNodes()
  if (nodes.length === 0) {
    alert('画布为空，请先添加节点')
    return
  }

  // 整链异常兜底：任何一步失败都弹窗告知具体原因，避免“点了没反应”
  try {
    // 1. 获取当前画布数据
    const data = serializeGraph(props.graph)

    // 2. 写入预览快照文件（运行态窗口启动后由 RunView 读取）
    const ok = await writeJsonFile('run-preview.json', data)
    if (!ok) {
      alert(`运行数据写入失败：${getLastFileError() || '未知错误，请查看控制台'}`)
      return
    }

    // 3. 在新窗口打开运行态页面（Tauri WebviewWindow 创建独立 OS 窗口；
    //    不能 window.open——WebView 会静默拦截应用内 URL）
    await openRunWindow()
  } catch (err) {
    console.error('预览启动失败:', err)
    alert(`预览启动失败：${err instanceof Error ? err.message : String(err)}`)
  }
}

// 清空画布确认弹窗开关
const clearConfirmOpen = ref(false)

/**
 * 清空画布（操作菜单入口）：打开应用内确认弹窗，
 * 用户确认后才执行，避免误操作。
 * 注：不能用 window.confirm——Tauri WebView 会静默拦截，弹窗不出现。
 */
function handleClear() {
  opsMenuOpen.value = false
  modeSubOpen.value = false
  if (!props.graph) return
  clearConfirmOpen.value = true
}

/** 确认弹窗点「确定清空」：执行清空（删除命令进入 History 栈，可 Ctrl+Z 恢复） */
function doClearCanvas() {
  clearConfirmOpen.value = false
  if (!props.graph) return
  props.graph.clearCells()
  editorStore.resetGraph()
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
/* 禁用态（如无可撤销/重做的操作）：降低透明度且不响应悬停 */
.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.toolbar-btn:disabled:hover {
  border-color: var(--border-color);
  color: var(--text-primary);
  background: var(--panel-bg);
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

/* 保存成功反馈：按钮变绿并弹跳一下（按钮点击与 Ctrl+S 共用） */
.toolbar-btn.save-btn.saved {
  background: var(--color-success);
  border-color: var(--color-success);
  color: #fff;
  animation: save-pop 0.4s ease;
}
.toolbar-btn.save-btn.saved:hover {
  background: var(--color-success);
  border-color: var(--color-success);
  color: #fff;
}
@keyframes save-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  70% { transform: scale(0.96); }
  100% { transform: scale(1); }
}

/* 保存成功 Toast：顶部居中滑入淡出 */
.save-toast {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  background: var(--color-success);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 2000;
  pointer-events: none;
}
.save-toast-enter-active {
  transition: all 0.25s ease;
}
.save-toast-leave-active {
  transition: all 0.6s ease;
}
.save-toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
.save-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
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

/* 操作下拉菜单（交互与样式同工程选择器） */
.ops-selector {
  position: relative;
}
.ops-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: 4px;
}
.ops-menu-item {
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
.ops-menu-item:hover {
  background: var(--color-primary-light);
}
.ops-menu-item.active {
  color: var(--color-primary);
  font-weight: 500;
}
/* 显示模式右侧子弹层（相对菜单项定位，向右侧展开） */
.ops-submenu-wrap {
  position: relative;
}
.ops-submenu {
  position: absolute;
  top: -5px;
  left: calc(100% + 6px);
  min-width: 120px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: 101;
  padding: 4px;
}
/* 危险操作项（清空画布）：悬停时红色警示 */
.ops-danger:hover {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.06);
}
.ops-menu-caret,
.ops-menu-check {
  flex-shrink: 0;
  color: var(--color-primary);
}
/* 操作菜单分隔线 */
.ops-menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 6px;
}
/* 菜单项右侧快捷键提示文字（弱化色调，等宽字体） */
.ops-menu-kbd {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-family: Consolas, Menlo, monospace;
}

/* 快捷键帮助弹窗（样式对齐项目其他对话框：遮罩 + 居中卡片） */
.kbd-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.kbd-dialog {
  width: 460px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--panel-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.kbd-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}
.kbd-body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.kbd-group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 4px;
}
.kbd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
  font-size: 12.5px;
}
.kbd-desc {
  color: var(--text-secondary);
}
.kbd-key {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--border-color);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  background: var(--canvas-bg);
  color: var(--text-primary);
  font-family: Consolas, Menlo, monospace;
  font-size: 11.5px;
}
.kbd-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* 清空画布确认弹窗（样式对齐项目其他对话框：遮罩 + 居中卡片） */
.clear-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.clear-dialog {
  width: 320px;
  max-width: 90vw;
  padding: 16px;
  background: var(--panel-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.clear-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.clear-msg {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}
.clear-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.clear-btn {
  padding: 5px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--panel-bg);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.clear-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.clear-btn.danger {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}
.clear-btn.danger:hover {
  filter: brightness(1.1);
  color: #fff;
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
