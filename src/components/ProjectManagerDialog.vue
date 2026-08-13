<!-- ══════════════════════════════════════════════════════════════════════
     ProjectManagerDialog.vue - 工程管理对话框

     多工程管理入口：画布、数据源、路线按工程完全隔离。
     功能一览：
       1. 新建工程（输入名称）
       2. 列表：显示名称、最近保存时间，当前工程标记「当前」
       3. 行操作：切换 / 导出（打包为工程文件）/ 重命名（行内输入）/ 复制 / 删除（带确认）
     导入工程在工具栏工程下拉菜单中（一级菜单入口）。
     数据由 project store 统一管理（索引 projects.json + projects/<id>/ 目录）。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <Teleport to="body">
    <div class="pm-mask" @click.self="handleClose">
      <div class="pm-dialog">
        <div class="pm-header">
          <span class="pm-title">工程管理</span>
          <button class="pm-close" @click="handleClose" title="关闭">✕</button>
        </div>

        <div class="pm-body">
          <!-- 新建工程 -->
          <div class="pm-create">
            <input
              v-model="newName"
              class="pm-input"
              placeholder="新工程名称"
              @keyup.enter="handleCreate"
            />
            <button class="pm-btn primary" @click="handleCreate">＋ 新建工程</button>
          </div>

          <div class="pm-count">共 {{ projectStore.projects.length }} 个工程</div>

          <div class="pm-list">
            <div
              v-for="p in sortedProjects"
              :key="p.id"
              class="pm-item"
              :class="{ current: p.id === projectStore.currentId }"
              @dblclick="handleSwitch(p.id)"
            >
              <div class="pm-item-main">
                <!-- 重命名中：行内输入框 -->
                <input
                  v-if="renamingId === p.id"
                  v-model="renameText"
                  class="pm-input"
                  @keyup.enter="confirmRename(p.id)"
                  @keyup.esc="renamingId = null"
                  @click.stop
                />
                <div v-else class="pm-item-name">
                  {{ p.name }}
                  <span v-if="p.id === projectStore.currentId" class="pm-cur-tag">当前</span>
                </div>
                <div class="pm-item-meta">
                  创建 {{ fmtTime(p.createdAt) }} · 最近保存 {{ fmtTime(p.updatedAt) }}
                </div>
              </div>
              <div class="pm-item-actions" @click.stop>
                <button
                  v-if="p.id !== projectStore.currentId"
                  class="pm-btn small primary"
                  @click="handleSwitch(p.id)"
                >切换</button>
                <button class="pm-btn small" @click="startRename(p)">重命名</button>
                <button class="pm-btn small" @click="handleDuplicate(p.id)">复制</button>
                <button class="pm-btn small" @click="handleExport(p)" title="导出为工程文件（画布+数据源+路线）">导出</button>
                <button class="pm-btn small danger" @click="handleDelete(p)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除工程确认浮层（应用内自定义；window.confirm 被 Tauri WebView 静默拦截，不能用） -->
      <div v-if="deleteConfirm" class="pm-confirm-mask" @click.self="deleteConfirm = null">
        <div class="pm-confirm" role="alertdialog" aria-modal="true" aria-label="删除工程确认">
          <div class="pm-confirm-msg">{{ deleteConfirm.tip }}</div>
          <div class="pm-confirm-actions">
            <button class="pm-btn" @click="deleteConfirm = null">取消</button>
            <button class="pm-btn danger solid" @click="doDelete">确定删除</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore, type ProjectMeta } from '@/stores/project'
import { useEditorStore } from '@/stores/editor'

const emit = defineEmits<{ (e: 'close'): void }>()

const projectStore = useProjectStore()
const editorStore = useEditorStore()

// ---------- 新建 ----------
const newName = ref('')

/** 新建工程并切换过去 */
async function handleCreate() {
  await projectStore.createProject(newName.value)
  newName.value = ''
}

// ---------- 导出（行操作：把指定工程打包为工程文件保存） ----------
// 桌面版不能用浏览器式 Blob 下载（Tauri WebView2 不处理下载事件，点击会静默失效）：
// 先弹原生「另存为」对话框（tauri-plugin-dialog）让用户选择目录与文件名，
// 再由 Rust 命令 export_project_file 写入所选路径；
// 非 Tauri 环境（直接浏览器访问 vite）降级为 Blob 下载。
async function handleExport(p: ProjectMeta) {
  const payload = await projectStore.exportProject(p.id)
  if (!payload) return
  const json = JSON.stringify(payload, null, 2)
  // 默认文件名：工程名（剔除非法字符）+ 时间戳
  const safeName = p.name.replace(/[\\/:*?"<>|]/g, '_')
  const fileName = `${safeName}-${Date.now()}.json`
  if ((window as any).__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { save } = await import('@tauri-apps/plugin-dialog')
      // 原生另存为对话框：用户选择保存目录与文件名（取消时返回 null）
      const targetPath = await save({
        title: '导出工程文件',
        defaultPath: fileName,
        filters: [{ name: '工程文件（JSON）', extensions: ['json'] }],
      })
      if (!targetPath) return // 用户取消
      const savedPath = await invoke<string>('export_project_file', {
        defaultName: fileName,
        content: json,
        targetPath,
      })
      alert(`导出成功：${savedPath}`)
    } catch (e) {
      console.error('导出工程失败:', e)
      alert(`导出失败：${e}`)
    }
    return
  }
  // 非 Tauri 环境降级：Blob 下载
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- 导入：已移至工具栏工程下拉菜单（一级菜单入口），此处不再提供 ----------

// ---------- 列表（当前工程置顶，其余按最近保存时间倒序） ----------
const sortedProjects = computed(() => {
  const list = [...projectStore.projects]
  return list.sort((a, b) => {
    if (a.id === projectStore.currentId) return -1
    if (b.id === projectStore.currentId) return 1
    return b.updatedAt - a.updatedAt
  })
})

// ---------- 切换 ----------
async function handleSwitch(id: string) {
  await projectStore.switchProject(id)
  handleClose()
}

// ---------- 重命名 ----------
const renamingId = ref<string | null>(null)
const renameText = ref('')

function startRename(p: ProjectMeta) {
  renamingId.value = p.id
  renameText.value = p.name
}

async function confirmRename(id: string) {
  await projectStore.renameProject(id, renameText.value)
  renamingId.value = null
}

// ---------- 复制 ----------
async function handleDuplicate(id: string) {
  await projectStore.duplicateProject(id)
}

// ---------- 删除（带确认） ----------
// Tauri WebView 会静默拦截 window.confirm（弹窗不出现），改用应用内确认浮层
const deleteConfirm = ref<{ id: string; tip: string } | null>(null)

function handleDelete(p: ProjectMeta) {
  const isCurrent = p.id === projectStore.currentId
  const tip = isCurrent
    ? `确定删除当前工程「${p.name}」吗？将切换到其他工程，其画布/数据源/路线会被永久删除。`
    : `确定删除工程「${p.name}」吗？其画布/数据源/路线会被永久删除。`
  deleteConfirm.value = { id: p.id, tip }
}

/** 确认浮层点「确定删除」：执行删除 */
async function doDelete() {
  const target = deleteConfirm.value
  deleteConfirm.value = null
  if (!target) return
  await projectStore.deleteProject(target.id)
}

/** 时间格式化：YYYY-MM-DD HH:mm */
function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function handleClose() {
  editorStore.setProjectDialogOpen(false)
  emit('close')
}
</script>

<style scoped>
.pm-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.pm-dialog {
  width: 560px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.pm-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.pm-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.pm-close:hover {
  color: var(--text-primary);
  background: var(--statusbar-bg);
}
.pm-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.pm-create {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.pm-create .pm-input {
  flex: 1;
}
.pm-count {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.pm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: border-color 0.2s;
}
.pm-item:hover {
  border-color: var(--color-primary);
}
.pm-item.current {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.pm-item-main {
  flex: 1;
  min-width: 0;
}
.pm-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.pm-cur-tag {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-primary);
  background: var(--panel-bg);
  border: 1px solid var(--color-primary-ring);
  border-radius: 3px;
  padding: 0 5px;
  line-height: 16px;
}
.pm-item-meta {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}
.pm-item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.pm-input {
  padding: 6px 10px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  font-size: 13px;
  outline: none;
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.pm-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-ring);
}
.pm-btn {
  padding: 4px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--panel-bg);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  white-space: nowrap;
}
.pm-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.pm-btn.primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.pm-btn.primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: #fff;
}
.pm-btn.small {
  padding: 2px 10px;
  font-size: 12px;
}
.pm-btn.danger:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
/* 删除确认浮层：覆盖在工程管理弹窗之上 */
.pm-confirm-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}
.pm-confirm {
  width: 360px;
  max-width: 90vw;
  padding: 16px;
  background: var(--panel-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.pm-confirm-msg {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 14px;
}
.pm-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
/* 实心红色危险按钮（确认删除） */
.pm-btn.danger.solid {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}
.pm-btn.danger.solid:hover {
  filter: brightness(1.1);
  color: #fff;
}
</style>
