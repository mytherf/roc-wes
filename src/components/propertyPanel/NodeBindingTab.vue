<!-- ══════════════════════════════════════════════════════════════════════
     NodeBindingTab.vue - 属性面板「绑定」标签页

     把节点绑定到数据源点位，实现实时数据驱动：
       - 数据源选择（数据源管理中的实例）
       - 点组编辑（点ID + 点名称 + 转换函数 + 备注，按组增删/批量导入）
       - 画面点指定（驱动节点画面 data.value 的点组）
       - 协议差异经点 ID 助手注册表（pointIdAssistantRegistry）驱动：
         助手协议（如 S7）点ID 只读、经助手对话框录入、点组按注册项归组分 tab

     绑定状态模型由 PropertyPanel 经 useNodeBinding 实例化后 provide，
     本组件 inject 使用（事件标签页共享同一份模型）。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div>
    <div class="field">
      <label>数据源
        <!-- 帮助按钮：数据源选择说明气泡（跟在标签文字后，内含跳转入口） -->
        <span class="field-help-wrap">
          <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'source'" title="数据源说明" @click="toggleFieldHelp('source')">?</button>
          <div v-if="fieldHelpOpen === 'source'" class="field-help-pop" role="note">
            必须选择「数据源管理」中已创建的数据源。<button type="button" class="no-source-btn" @click="gotoDataSourceManager">前往数据源管理</button>
          </div>
        </span>
      </label>
      <select v-model="binding.bindingSourceId" @change="binding.updateBinding()">
        <option value="">未选择数据源</option>
        <option
          v-for="ds in dataSourceStore.dataSources"
          :key="ds.id"
          :value="ds.id"
        >{{ ds.name }}（{{ getProtocolLabel(ds.type) }}）</option>
      </select>
    </div>
    <div v-if="binding.selectedDataSource" class="source-info">
      <div class="source-url" :title="binding.selectedDataSource.url">{{ binding.selectedDataSource.url }}</div>
      <div v-if="binding.selectedDataSource.description" class="source-desc">{{ binding.selectedDataSource.description }}</div>
    </div>
    <div class="field">
      <label>点ID
        <!-- 帮助按钮：点组说明气泡（跟在标签文字后） -->
        <span class="field-help-wrap">
          <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'point'" title="点ID 说明" @click="toggleFieldHelp('point')">?</button>
          <div v-if="fieldHelpOpen === 'point'" class="field-help-pop" role="note">
            点ID、点名称、转换函数与备注为一组，按组添加/删除；「画面点」单独指定（缺省首个点组），驱动节点画面，其余点实时值见节点详情。
          </div>
        </span>
      </label>
    </div>
    <button type="button" class="add-extra-point-btn" @click="handleAddPointGroup">＋ 添加点组（点ID + 点名称 + 转换函数 + 备注）</button>
    <!-- 导入点位：批量粘贴或从 txt/csv 文件导入点组（对话框内确认后合并） -->
    <button type="button" class="add-extra-point-btn import-points-btn" title="批量导入点组（粘贴文本或选择 txt/csv 文件）" @click="openImportDialog">⇪ 导入点位（批量）</button>

    <!-- 绑定点组列表：点组从零开始（仅添加/导入产生），全部可删、地位平等；
         画面点由下方「画面驱动」单独指定（缺省首个点组）；
         助手协议（如 S7）：点ID 一律经助手对话框产生（只读展示、点击回填编辑），点组按注册项归组分 tab 展示 -->
    <!-- 画面驱动：选择驱动节点画面（data.value）的点组；等于首个点组时不写入存档（运行期缺省即回落首点） -->
    <div v-if="binding.watchFieldOptions.length" class="display-point-section">
      <div class="section-divider">画面驱动</div>
      <div class="field">
        <label>画面点</label>
        <select v-model="binding.displayPointId" @change="binding.updateBinding()">
          <option v-for="g in binding.watchFieldOptions" :key="g.pointId" :value="g.pointId" :title="g.pointId">{{ g.label }}</option>
        </select>
      </div>
    </div>
    <div v-if="binding.bindingGroups.length === 0" class="empty-hint">暂无点组，点击下方按钮添加或导入</div>
    <!-- 点组归组 tab：由助手注册项 groupKeyOf 驱动（如 S7 按 DB 块），未注册归组的协议不渲染 -->
    <div v-if="groupTabs" class="db-tab-bar">
      <button
        v-for="tab in groupTabs"
        :key="tab.key"
        type="button"
        class="db-tab"
        :class="{ active: tab.key === currentGroupTabKey }"
        :title="`${tab.label}：${tab.items.length} 个点位`"
        @click="activeGroupTab = tab.key"
      >
        <span>{{ tab.label }}</span>
        <span class="db-tab-count">{{ tab.items.length }}</span>
        <span v-if="tab.hasDisplay" class="db-tab-primary" title="画面点在此组">画面</span>
      </button>
    </div>
    <div v-for="it in visibleBindingItems" :key="it.idx" class="binding-group-card">
      <div class="binding-group-head">
        <span class="binding-group-tag">点组 {{ it.idx + 1 }}</span>
        <span v-if="binding.isDisplayPoint(it.g.pointId)" class="binding-group-tag display" title="该点组驱动节点画面">画面</span>
        <button type="button" class="extra-point-remove" title="删除该点组" @click="binding.removePointGroup(it.idx)">×</button>
      </div>
      <!-- 点ID 行：缺省自由输入；助手协议（readOnly）只读展示，点击或 ⌗ 按钮打开助手对话框（回填编辑） -->
      <div class="binding-group-row">
        <label class="binding-row-label">点ID</label>
        <input
          v-if="!binding.assistantEntry?.readOnly"
          v-model="it.g.pointId"
          @input="binding.updateBinding()"
          placeholder="例如: sensor.temp.001"
        />
        <div
          v-else
          class="s7-pointid-view"
          :class="{ empty: !it.g.pointId.trim() }"
          title="点ID 仅能通过生成助手填写，点击编辑"
          @click="openAssistantDialog(it.idx)"
        >{{ it.g.pointId.trim() || '点击通过地址生成助手生成' }}</div>
        <button
          v-if="binding.assistantEntry?.readOnly"
          type="button"
          class="transform-expand-btn"
          title="点ID 生成助手"
          @click="openAssistantDialog(it.idx)"
        >⌗</button>
      </div>
      <!-- 点名称行：标签 + 输入框（可选，人类可读标识，不参与订阅） -->
      <div class="binding-group-row">
        <label class="binding-row-label">点名称</label>
        <input
          v-model="it.g.name"
          @input="binding.updateBinding()"
          placeholder="(可选) 例如: 堆垛机1号温度"
        />
      </div>
      <!-- 转换函数行：标签 + 输入框（可选）+ 弹出编辑按钮（打开大编辑对话框） -->
      <div class="binding-group-row">
        <label class="binding-row-label">转换函数</label>
        <input
          v-model="it.g.transformSource"
          @input="binding.updateBinding()"
          placeholder="(可选) (raw) => Math.round(raw)"
        />
        <button
          type="button"
          class="transform-expand-btn"
          title="弹出大编辑框（查看/编辑长函数）"
          @click="openTransformDialog(it.idx)"
        >⤢</button>
      </div>
      <!-- 备注行：标签 + 输入框（可选，纯说明性文字，不参与订阅与运行逻辑） -->
      <div class="binding-group-row">
        <label class="binding-row-label">备注</label>
        <input
          v-model="it.g.remark"
          @input="binding.updateBinding()"
          placeholder="(可选) 例如: DB1 温度传感器，每 5s 校准"
        />
      </div>
    </div>
    <div class="binding-status">
      <span v-if="binding.hasAnyPoint && !binding.bindingSourceId" class="status-warning">⚠ 请选择数据源，绑定方可生效</span>
      <span v-else-if="binding.hasAnyPoint" class="status-active">✅ 已启用数据绑定</span>
      <span v-else class="status-inactive">⏸ 未启用（请添加点组）</span>
    </div>

    <!-- 转换函数编辑对话框：点组卡片内 ⤢ 按钮打开，大号多行编辑区便于查看/编辑长函数；
         草稿模式——确定才写回点组，取消/遮罩点击/Esc 丢弃 -->
    <Teleport to="body">
      <div v-if="transformDialog" class="transform-dialog-mask" @click.self="cancelTransformDialog">
        <div class="transform-dialog" role="dialog" aria-modal="true" aria-label="编辑转换函数">
          <div class="transform-dialog-head">
            <h4>
              编辑转换函数
              <span class="binding-group-tag">
                点组 {{ transformDialog.groupIdx + 1 }}
              </span>
            </h4>
            <button type="button" class="transform-dialog-close" title="关闭（不保存）" @click="cancelTransformDialog">×</button>
          </div>
          <textarea
            v-model="transformDialog.draft"
            class="transform-editor transform-dialog-editor"
            placeholder="(可选) 例如: (raw) => Math.round(raw)"
          ></textarea>
          <div class="transform-dialog-foot">
            <button type="button" class="transform-dialog-btn" @click="cancelTransformDialog">取消</button>
            <button type="button" class="transform-dialog-btn primary" @click="confirmTransformDialog">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 点位导入对话框：批量粘贴或从 txt/csv 文件导入点组（点ID + 点名称 + 备注）；
         草稿模式——确定才合并进点组列表，取消/遮罩点击/Esc 丢弃；
         导入方式二选一：追加（保留现有点位，重复跳过）或覆盖（清空现有点组） -->
    <Teleport to="body">
      <div v-if="importDialog" class="transform-dialog-mask" @click.self="cancelImportDialog">
        <div class="transform-dialog import-dialog" role="dialog" aria-modal="true" aria-label="导入点位">
          <div class="transform-dialog-head">
            <h4>导入点位</h4>
            <button type="button" class="transform-dialog-close" title="关闭（不导入）" @click="cancelImportDialog">×</button>
          </div>
          <div class="import-dialog-toolbar">
            <button type="button" class="transform-dialog-btn" @click="pickImportFile">从文件导入…</button>
            <button type="button" class="transform-dialog-btn" title="下载带格式说明的示例模板，填写后可再导入" @click="downloadImportTemplate">下载模板</button>
            <span class="import-hint">支持 CSV / Excel（xlsx/xls）/ txt 文件导入；粘贴文本每行一个点位：点ID，点名称，备注（后两项可省略）</span>
          </div>
          <textarea
            v-model="importDialog.draft"
            class="transform-editor import-dialog-editor"
            placeholder="sensor.temp.001，温度1号&#10;sensor.humi.001，湿度1号&#10;# 井号开头为注释行"
          ></textarea>
          <!-- 导入方式：追加（缺省，安全）或覆盖现有点组 -->
          <div class="import-mode-row">
            <span class="import-mode-label">导入方式：</span>
            <label class="import-mode-option" title="保留现有点位，与现有点ID 重复的导入点自动跳过">
              <input type="radio" v-model="importDialog.overwrite" :value="false" />追加
            </label>
            <label class="import-mode-option" title="清空现有点组，以导入内容为准">
              <input type="radio" v-model="importDialog.overwrite" :value="true" />覆盖现有点组
            </label>
          </div>
          <div class="import-dialog-summary">
            <span v-if="importPreview.valid > 0">解析 {{ importPreview.valid }} 个点位<span v-if="importDialog.overwrite">，将覆盖现有 {{ importPreview.existingCount }} 个点组</span><span v-else-if="importPreview.conflict">，与现有点ID 重复跳过 {{ importPreview.conflict }}</span><span v-if="importPreview.invalid">，非法点ID 跳过 {{ importPreview.invalid }}</span><span v-if="importPreview.duplicate">，文本内重复跳过 {{ importPreview.duplicate }}</span><span v-if="importPreview.skipped">，空行/注释跳过 {{ importPreview.skipped }}</span></span>
            <span v-else class="import-empty-hint">尚未解析出有效点位</span>
            <span v-if="importError" class="import-error">{{ importError }}</span>
          </div>
          <div class="transform-dialog-foot">
            <button type="button" class="transform-dialog-btn" @click="cancelImportDialog">取消</button>
            <button type="button" class="transform-dialog-btn primary" :disabled="importPreview.valid === 0" @click="confirmImportDialog">{{ importPreview.valid > 0 ? `${importDialog.overwrite ? '覆盖导入' : '导入'} ${importPreview.valid} 个点位` : '导入' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 点 ID 助手对话框：由助手注册项 dialog 驱动（如 S7 地址生成助手）；
         草稿模式——确定才写回点组 pointId，取消/遮罩点击/Esc 丢弃 -->
    <component
      v-if="assistantDialog && binding.assistantEntry"
      :is="binding.assistantEntry.dialog"
      :point-id="binding.bindingGroups[assistantDialog.groupIdx]?.pointId ?? ''"
      :group-idx="assistantDialog.groupIdx"
      @confirm="confirmAssistantDialog"
      @cancel="cancelAssistantDialog"
    />

    <!-- 非 Tauri 环境降级：隐藏 file input（「从文件导入」在浏览器环境触发） -->
    <input
      ref="importFileInputRef"
      type="file"
      accept=".csv,.xlsx,.xls,.txt,text/csv"
      style="display: none"
      @change="onImportFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { inject, ref, computed, watch, onBeforeUnmount } from 'vue'
import { NODE_BINDING_KEY, type BindingGroupDraft } from '@/composables/useNodeBinding'
import { useEditorStore } from '@/stores/editor'
import { useDataSourceStore } from '@/stores/dataSource'
import { getProtocolLabel } from '@/components/dataSource/protocolConfigRegistry'
import { POINT_GROUP_OTHER_KEY } from '@/components/dataSource/pointIdAssistantRegistry'
import {
  parsePointImportText,
  isTxtPath,
  parseImportFileBytes,
  IMPORT_TEMPLATE_TEXT,
} from '@/utils/pointImport'
import { useFieldHelp } from './useFieldHelp'

// ===================== 依赖注入 =====================
// 绑定状态模型由 PropertyPanel 实例化后 provide（事件标签页共享同一份）
const binding = inject(NODE_BINDING_KEY)!
const editorStore = useEditorStore()
const dataSourceStore = useDataSourceStore()
const { fieldHelpOpen, toggleFieldHelp } = useFieldHelp()

/** 跳转到数据源管理对话框（帮助气泡内的引导入口，跳转同时关闭气泡） */
function gotoDataSourceManager() {
  fieldHelpOpen.value = null
  editorStore.setDataSourceDialogOpen(true)
}

// ===================== 转换函数编辑对话框 =====================
/** 转换函数编辑对话框状态（null = 未打开；draft 为编辑草稿，确定才写回点组） */
const transformDialog = ref<{ groupIdx: number; draft: string } | null>(null)
/** 打开转换函数编辑对话框（复制当前内容为草稿，避免边改边生效） */
function openTransformDialog(idx: number) {
  transformDialog.value = { groupIdx: idx, draft: binding.bindingGroups[idx]?.transformSource ?? '' }
}
/** 取消/关闭对话框：丢弃草稿，不写回 */
function cancelTransformDialog() {
  transformDialog.value = null
}
/** 确定：草稿写回对应点组并立即提交绑定 */
function confirmTransformDialog() {
  const dlg = transformDialog.value
  if (!dlg) return
  const g = binding.bindingGroups[dlg.groupIdx]
  if (g) {
    g.transformSource = dlg.draft
    binding.updateBinding()
  }
  transformDialog.value = null
}

// ===================== 点 ID 助手对话框（助手协议点ID 唯一录入入口：点ID 行点击/⌗ 按钮打开） =====================
/** 助手对话框状态（null = 未打开；组件由注册项提供，草稿模式确定才写回点组 pointId） */
const assistantDialog = ref<{ groupIdx: number } | null>(null)
/** 打开助手对话框（现有点ID 由对话框组件自行反解析回填） */
function openAssistantDialog(idx: number) {
  assistantDialog.value = { groupIdx: idx }
}
/** 取消/关闭：丢弃草稿，不写回 */
function cancelAssistantDialog() {
  assistantDialog.value = null
}
/** 确定：助手产生的点ID 写入对应点组并立即提交绑定 */
function confirmAssistantDialog(pointId: string) {
  const dlg = assistantDialog.value
  if (!dlg) return
  const g = binding.bindingGroups[dlg.groupIdx]
  if (pointId && g) {
    g.pointId = pointId
    binding.updateBinding()
  }
  assistantDialog.value = null
}

/** 任一编辑对话框（转换函数/导入点位/点ID 助手）打开期间 Esc 关闭（不保存） */
function onDialogKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (transformDialog.value) cancelTransformDialog()
  else if (importDialog.value) cancelImportDialog()
  else if (assistantDialog.value) cancelAssistantDialog()
}
onBeforeUnmount(() => {
  // 兜底清理对话框 Esc 监听，避免残留 document 监听器
  document.removeEventListener('keydown', onDialogKeydown)
})

// ===================== 点位导入对话框（批量粘贴/文件 → 合并进点组列表） =====================
/** 导入对话框状态（null = 未打开；draft 为待解析文本草稿，overwrite 为是否覆盖现有点组，确定才写入点组） */
const importDialog = ref<{ draft: string; overwrite: boolean } | null>(null)
/** 文件读取失败提示（展示在对话框汇总行） */
const importError = ref('')
// 非 Tauri 环境降级的隐藏 file input
const importFileInputRef = ref<HTMLInputElement | null>(null)

// 任一对话框打开期间挂 Esc 关闭监听
watch([transformDialog, importDialog, assistantDialog], ([t, i, a]) => {
  if (t || i || a) document.addEventListener('keydown', onDialogKeydown)
  else document.removeEventListener('keydown', onDialogKeydown)
})

// 切换选中节点时关闭编辑对话框（转换函数/导入点位/点ID 助手），避免草稿写回错误的节点
watch(
  () => editorStore.selectedElement?.data?.id,
  () => {
    transformDialog.value = null
    importDialog.value = null
    assistantDialog.value = null
    activeGroupTab.value = ''
  }
)

/** 打开导入对话框（草稿清空，缺省追加模式，重新录入） */
function openImportDialog() {
  importError.value = ''
  importDialog.value = { draft: '', overwrite: false }
}
/** 取消/关闭导入对话框：丢弃草稿，不合并 */
function cancelImportDialog() {
  importDialog.value = null
  importError.value = ''
}

/** 导入预览：解析草稿 + 统计与现有点组的关系（助手协议先经注册项 validate 严格校验；追加模式统计冲突跳过；覆盖模式统计将被替换的点组数） */
const importPreview = computed(() => {
  const dlg = importDialog.value
  if (!dlg) return { valid: 0, conflict: 0, duplicate: 0, skipped: 0, invalid: 0, existingCount: 0 }
  const { points: rawPoints, skippedLines, duplicateLines } = parsePointImportText(dlg.draft)
  // 助手协议点ID 一律经助手产生，导入同样严格校验：非法点ID 跳过并计数
  const validate = binding.assistantEntry?.validate
  const points = validate ? rawPoints.filter((p) => validate(p.pointId)) : rawPoints
  const invalid = rawPoints.length - points.length
  const existing = new Set(binding.bindingGroups.map((g) => g.pointId.trim()).filter(Boolean))
  const existingCount = existing.size
  if (dlg.overwrite) {
    // 覆盖模式：全部解析点有效，无冲突概念
    return { valid: points.length, conflict: 0, duplicate: duplicateLines, skipped: skippedLines, invalid, existingCount }
  }
  const fresh = points.filter((p) => !existing.has(p.pointId))
  return { valid: fresh.length, conflict: points.length - fresh.length, duplicate: duplicateLines, skipped: skippedLines, invalid, existingCount }
})

/**
 * 确定：解析草稿并按所选方式写入点组列表后立即提交绑定。
 * - 助手协议：非法点ID 行先过滤（与预览计数一致）；
 * - 追加（缺省）：与现有点ID 重复的导入点跳过，其余追加；
 * - 覆盖：点组列表整体替换为导入内容（原转换函数等一并清除）；
 * - 导入后画面点无效/未设时由 updateBinding 回落首个点组
 */
function confirmImportDialog() {
  const dlg = importDialog.value
  if (!dlg) return
  const { points: rawPoints } = parsePointImportText(dlg.draft)
  const validate = binding.assistantEntry?.validate
  const points = validate ? rawPoints.filter((p) => validate(p.pointId)) : rawPoints
  const toDraft = (p: { pointId: string; name?: string; remark?: string }) => ({
    pointId: p.pointId, name: p.name ?? '', transformSource: '', remark: p.remark ?? '',
  })
  const drafts = dlg.overwrite
    ? points.map(toDraft)
    : (() => {
        const existing = new Set(binding.bindingGroups.map((g) => g.pointId.trim()).filter(Boolean))
        return points.filter((p) => !existing.has(p.pointId)).map(toDraft)
      })()
  if (drafts.length === 0) {
    cancelImportDialog()
    return
  }
  if (dlg.overwrite) {
    binding.bindingGroups = drafts
  } else {
    binding.bindingGroups.push(...drafts)
  }
  binding.updateBinding()
  importDialog.value = null
  importError.value = ''
}

/**
 * 从文件导入：Tauri 下弹原生「打开文件」对话框（tauri-plugin-dialog）选路径，
 * txt 经 read_text_file 读文本，csv/xlsx/xls 经 read_file_bytes 读字节流后
 * 由 xlsx 库解析（均不受 fs capability scope 限制）；非 Tauri 环境降级为隐藏 file input。
 */
async function pickImportFile() {
  importError.value = ''
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await open({
        title: '选择点位清单文件',
        multiple: false,
        filters: [{ name: '点位清单（csv/xlsx/xls/txt）', extensions: ['csv', 'xlsx', 'xls', 'txt'] }],
      })
      if (!path || typeof path !== 'string') return // 用户取消（或选了目录）
      let content: string
      if (isTxtPath(path)) {
        content = await invoke<string>('read_text_file', { path })
      } else {
        const bytes = await invoke<number[]>('read_file_bytes', { path })
        content = await parseImportFileBytes(new Uint8Array(bytes), path.toLowerCase().endsWith('.csv'))
      }
      if (importDialog.value) importDialog.value.draft = content
    } else {
      importFileInputRef.value?.click()
    }
  } catch (e) {
    console.error('[PropertyPanel] 读取导入文件失败:', e)
    importError.value = `文件读取失败：${e}`
  }
}

/** 非 Tauri 降级：file input 选中后读文件填充草稿（txt 读文本，csv/xlsx/xls 读字节流经 xlsx 解析） */
function onImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (isTxtPath(file.name)) {
    const reader = new FileReader()
    reader.onload = () => {
      if (importDialog.value) importDialog.value.draft = String(reader.result ?? '')
    }
    reader.readAsText(file)
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const bytes = new Uint8Array(reader.result as ArrayBuffer)
      const draft = await parseImportFileBytes(bytes, file.name.toLowerCase().endsWith('.csv'))
      if (importDialog.value) importDialog.value.draft = draft
    } catch (err) {
      console.error('[PropertyPanel] 解析导入文件失败:', err)
      importError.value = `文件解析失败：${err}`
    }
  }
  reader.readAsArrayBuffer(file)
}

/**
 * 下载导入模板（CSV）：Tauri 下弹原生「另存为」对话框（tauri-plugin-dialog）选路径，
 * 再经 Rust 命令 export_project_file 落盘（WebView2 不处理 a.download 下载事件）；
 * 非 Tauri 环境降级为 Blob 下载。
 */
async function downloadImportTemplate() {
  importError.value = ''
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await save({
        title: '保存点位导入模板',
        defaultPath: '点位导入模板.csv',
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      })
      if (!path) return // 用户取消
      await invoke('export_project_file', { targetPath: path, defaultName: '点位导入模板.csv', content: IMPORT_TEMPLATE_TEXT })
    } else {
      const blob = new Blob([IMPORT_TEMPLATE_TEXT], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '点位导入模板.csv'
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch (e) {
    console.error('[PropertyPanel] 下载导入模板失败:', e)
    importError.value = `模板下载失败：${e}`
  }
}

/** 添加点组；助手协议（点ID 禁手输）新建后直接打开助手对话框录入（取消则保留空组可删） */
function handleAddPointGroup() {
  binding.addPointGroup()
  if (binding.assistantEntry?.readOnly) openAssistantDialog(binding.bindingGroups.length - 1)
}

// ===================== 点组归组 tab（由助手注册项 groupKeyOf 驱动，纯展示层） =====================
/** 归组 tab：助手注册项提供 groupKeyOf 时按归组键分组（如 S7 按 DB 前缀），否则不分组（null） */
interface GroupTab {
  key: string
  label: string
  items: { g: BindingGroupDraft; idx: number }[]
  hasDisplay: boolean
}
const groupTabs = computed<GroupTab[] | null>(() => {
  const entry = binding.assistantEntry
  const keyOf = entry?.groupKeyOf
  if (!keyOf) return null
  const order: string[] = []
  const items = new Map<string, { g: BindingGroupDraft; idx: number }[]>()
  binding.bindingGroups.forEach((g, idx) => {
    const key = keyOf(g.pointId)
    if (!items.has(key)) {
      items.set(key, [])
      order.push(key)
    }
    items.get(key)!.push({ g, idx })
  })
  // 首次出现顺序；「其他点位」等兜底组置尾
  const sorted = [
    ...order.filter((k) => k !== POINT_GROUP_OTHER_KEY),
    ...(items.has(POINT_GROUP_OTHER_KEY) ? [POINT_GROUP_OTHER_KEY] : []),
  ]
  const tabs: GroupTab[] = []
  for (const key of sorted) {
    const list = items.get(key)
    if (!list || list.length === 0) continue
    tabs.push({
      key,
      label: entry.groupLabel?.(key) ?? key,
      items: list,
      hasDisplay: list.some((it) => binding.isDisplayPoint(it.g.pointId)),
    })
  }
  return tabs
})

/** 当前激活的归组 tab（点击切换；不存在时回退首个 tab） */
const activeGroupTab = ref('')
const currentGroupTabKey = computed(() => {
  const tabs = groupTabs.value
  if (!tabs) return ''
  return tabs.some((t) => t.key === activeGroupTab.value) ? activeGroupTab.value : (tabs[0]?.key ?? '')
})

/**
 * 当前可见的点组：注册归组的协议取激活 tab 内的点组（同一对象引用，编辑仍原地生效），
 * 其余协议为全部点组（扁平渲染）。卡片内编辑点名称/转换函数/备注不改变归组，无跨 tab 迁移。
 */
const visibleBindingItems = computed(() => {
  const all = binding.bindingGroups.map((g, idx) => ({ g, idx }))
  const keyOf = binding.assistantEntry?.groupKeyOf
  if (!keyOf) return all
  const key = currentGroupTabKey.value
  return all.filter((it) => keyOf(it.g.pointId) === key)
})
</script>

<style scoped>
@import './panelShared.css';

/* ===================== 绑定点组（点ID + 点名称 + 转换函数 + 备注为一组，按组增删） ===================== */
.binding-group-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
  padding: 8px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--statusbar-bg);
}
.binding-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.binding-group-head .extra-point-remove {
  margin-left: auto;
}
.binding-group-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--border-light);
}
.binding-group-tag.display {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
/* 画面驱动设置区：与点组列表保持紧凑间距 */
.display-point-section {
  margin-bottom: 6px;
}
.binding-group-card input {
  width: 100%;
}
/* 点组内字段行：小标签 + 输入框同行（标签列固定宽度保证两行对齐） */
.binding-group-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.binding-row-label {
  flex-shrink: 0;
  width: 48px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}
/* 转换函数放大/收起按钮（单行 ⇄ 多行切换） */
.transform-expand-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.transform-expand-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* ===================== 转换函数编辑对话框 ===================== */
/* 半透明遮罩：点击遮罩本身（非对话框）即取消关闭 */
.transform-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.transform-dialog {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.transform-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.transform-dialog-head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.transform-dialog-close {
  border: none;
  background: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.transform-dialog-close:hover {
  background: var(--statusbar-bg);
  color: var(--text-primary);
}
/* 对话框内大编辑区：默认更高，可继续纵向拖拽（双类选择器保证覆盖 .transform-editor 的 min-height） */
.transform-editor.transform-dialog-editor {
  flex: 1;
  min-height: 220px;
}
.transform-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.transform-dialog-btn {
  padding: 5px 16px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--statusbar-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.transform-dialog-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.transform-dialog-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.transform-dialog-btn.primary:hover {
  opacity: 0.9;
  color: #fff;
}
.transform-dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 转换函数多行编辑区：等宽字体便于阅读代码，可纵向拖拽调整高度，
   悬停/聚焦状态与普通输入框一致 */
.transform-editor {
  width: 100%;
  box-sizing: border-box;
  min-height: 80px;
  padding: 6px 8px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-md);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-primary);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 11px;
  line-height: 1.5;
  resize: vertical;
  box-shadow: var(--shadow-sm, none);
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
.transform-editor:hover:not(:focus) {
  border-color: var(--input-border-hover, var(--color-primary));
}
.transform-editor:focus {
  border-color: var(--color-primary);
  outline: none;
  background: var(--panel-bg);
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.extra-point-remove {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}
.extra-point-remove:hover {
  color: #fff;
  background: var(--color-danger, #ff4d4f);
  border-color: var(--color-danger, #ff4d4f);
}
.add-extra-point-btn {
  width: 100%;
  margin-bottom: 6px;
  padding: 4px 0;
  border: 1px dashed var(--input-border, var(--border-color));
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.add-extra-point-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
/* 导入点位对话框：复用转换函数对话框骨架，略宽以容纳批量文本 */
.import-dialog {
  width: min(640px, calc(100vw - 48px));
}
.import-dialog-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.import-hint {
  flex: 1;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}
.import-dialog-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}
.import-empty-hint {
  color: var(--text-muted);
}
.import-error {
  color: var(--color-danger, #ff4d4f);
}
/* 导入方式单选行（追加/覆盖） */
.import-mode-row {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 11px;
  color: var(--text-secondary);
}
.import-mode-label {
  color: var(--text-muted);
}
.import-mode-option {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.import-mode-option input[type='radio'] {
  width: auto;
  margin: 0;
  accent-color: var(--color-primary);
  cursor: pointer;
}
/* 点组归组 tab 条（助手注册项提供 groupKeyOf 时渲染，如 S7 按 DB 块） */
.db-tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.db-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--statusbar-bg);
  border: 1px solid var(--divider-color, var(--border-light));
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background-color 0.15s;
}
.db-tab:hover {
  border-color: var(--color-primary);
}
.db-tab.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--panel-bg);
  font-weight: 600;
}
.db-tab-count {
  font-size: 11px;
  color: var(--text-muted);
}
.db-tab-primary {
  font-size: 10px;
  padding: 0 3px;
  border-radius: 3px;
  color: #fff;
  background: var(--color-primary);
}
/* 助手协议点ID 只读展示框（仅能经助手对话框填写，点击打开助手回填编辑） */
.s7-pointid-view {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  background: var(--statusbar-bg);
  border: 1px dashed var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: border-color 0.2s;
}
.s7-pointid-view:hover {
  border-color: var(--color-primary);
}
.s7-pointid-view.empty {
  font-family: inherit;
  color: var(--text-muted);
}

/* ===================== 绑定状态与数据源信息 ===================== */
.binding-status {
  margin-top: 8px;
  font-size: 12px;
}
.status-active {
  color: var(--color-success);
}
.status-inactive {
  color: var(--text-muted);
}
.status-warning {
  color: var(--color-warning);
}
/* 帮助气泡内嵌的跳转链接（文字链样式，前往数据源管理） */
.no-source-btn {
  padding: 0 2px;
  font-size: inherit;
  border: none;
  background: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.15s;
}
.no-source-btn:hover {
  opacity: 0.75;
}
/* 数据源信息展示 */
.source-info {
  margin: -4px 0 12px;
  padding: 8px 10px;
  background: var(--color-primary-light);
  border: 1px solid var(--color-primary-ring);
  border-radius: var(--radius-md);
}
.source-url {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-primary);
  word-break: break-all;
}
.source-desc {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}
</style>
