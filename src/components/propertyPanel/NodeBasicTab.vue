<!-- ══════════════════════════════════════════════════════════════════════
     NodeBasicTab.vue - 属性面板「基础」标签页

     选中节点的基础属性编辑：
       - ID（只读）、名称、类型（只读）、标签
       - 节点图标：默认图标 / 预设 / 上传自定义 / 尺寸
       - 货架维度（排/列/层）、自定义数据（卡片标题/状态）
       - 位置（X/Y）与尺寸（宽/高）：双写 X6 节点与 Store，
         画布拖拽时经 rAF 轮询实时回填输入框
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div>
    <div class="field field-compact">
      <label>ID</label>
      <span class="id-value" :title="element.data.id">{{ element.data.id }}</span>
    </div>
    <!-- 名称（所有节点常显；节点未预置 name 字段时输入即创建） -->
    <div class="field field-compact">
      <label>名称</label>
      <input :value="element.data.name ?? ''" placeholder="未设置" @input="onNameInput" />
    </div>
    <div class="field field-compact">
      <label>类型</label>
      <span>{{ nodeTypeLabel }}</span>
    </div>
    <div class="field field-compact">
      <label>标签</label>
      <input v-model="element.data.label" @input="updateNodeLabel" />
    </div>

    <!-- ====== 节点图标（默认图标 / 预设 / 上传自定义 / 尺寸） ====== -->
    <template v-if="iconEditable">
      <div class="section-divider">图标</div>
      <div class="icon-picker" ref="iconPickerRef">
        <!-- 当前图标 + 点击展开预设选择面板 -->
        <div class="icon-current">
          <button
            type="button"
            class="icon-picker-trigger"
            :aria-expanded="iconPickerOpen"
            aria-haspopup="true"
            title="点击选择预设图标"
            @click="toggleIconPicker"
          >
            <span class="icon-preview" aria-hidden="true">
              <NodeIcon :icon="currentIcon" :size="Math.min(iconSizeModel, 24)" />
            </span>
            <span class="icon-current-info">
              <span class="icon-current-label">
                {{ isCustomImage ? '自定义图片' : isDefaultIcon ? '默认图标' : '预设图标' }}
              </span>
            </span>
            <span class="icon-picker-caret" :class="{ open: iconPickerOpen }" aria-hidden="true">▾</span>
          </button>
          <button v-if="!isDefaultIcon" class="icon-reset-btn" @click="resetIcon">恢复默认</button>
        </div>

        <!-- 预设图标下拉面板（点击触发按钮展开，选中或点击外部关闭） -->
        <div v-show="iconPickerOpen" class="icon-picker-panel">
          <div class="icon-grid" role="radiogroup" aria-label="选择预设图标">
            <button
              v-for="ic in PRESET_ICONS"
              :key="ic"
              type="button"
              class="icon-grid-item"
              :class="{ active: element.data.icon === ic }"
              :title="'选择图标 ' + ic"
              :aria-pressed="element.data.icon === ic"
              @click="selectIcon(ic)"
            >{{ ic }}</button>
          </div>
        </div>
      </div>

      <input
        ref="iconFileInput"
        type="file"
        :accept="ICON_UPLOAD_ACCEPT"
        class="icon-file-input"
        aria-label="上传自定义图标图片"
        @change="onIconFileChange"
      />
      <div class="icon-upload-row">
        <button class="icon-upload-btn" :disabled="iconUploading" @click="triggerIconUpload">
          {{ iconUploading ? '处理中…' : '⬆ 上传图片' }}
        </button>
        <!-- 帮助按钮：点击弹出上传格式说明气泡，点击外部关闭 -->
        <span class="icon-help-wrap" ref="iconHelpWrapRef">
          <button
            type="button"
            class="icon-help-btn"
            :aria-expanded="iconUploadHelpOpen"
            title="上传格式说明"
            @click="iconUploadHelpOpen = !iconUploadHelpOpen"
          >?</button>
          <div v-if="iconUploadHelpOpen" class="icon-help-pop" role="note">
            PNG / JPG / WebP / SVG，≤2MB，自动压缩至 128px 内
          </div>
        </span>
      </div>
      <div v-if="iconError" class="icon-error" role="alert">{{ iconError }}</div>

      <div class="field">
        <label>图标尺寸 <span class="hint">({{ iconSizeModel }}px)</span></label>
        <input
          type="range"
          :min="ICON_SIZE_MIN"
          :max="ICON_SIZE_MAX"
          step="1"
          v-model.number="iconSizeModel"
          @input="updateNodeIconSize"
        />
      </div>
    </template>

    <!-- 货架维度属性：排/列/层 -->
    <template v-if="element.data.rows !== undefined">
      <div class="field">
        <label>排 (rows)</label>
        <input type="number" min="1" v-model.number="element.data.rows" @input="updateNodeDataField('rows')" />
      </div>
    </template>
    <template v-if="element.data.cols !== undefined">
      <div class="field">
        <label>列 (cols)</label>
        <input type="number" min="1" v-model.number="element.data.cols" @input="updateNodeDataField('cols')" />
      </div>
    </template>
    <template v-if="element.data.floors !== undefined">
      <div class="field">
        <label>层 (floors)</label>
        <input type="number" min="1" v-model.number="element.data.floors" @input="updateNodeDataField('floors')" />
      </div>
    </template>

    <!-- 自定义数据（卡片节点等） -->
    <template v-if="element.data.data">
      <div class="field">
        <label>标题</label>
        <input v-model="element.data.data.title" @input="updateNodeData" />
      </div>
      <div class="field">
        <label>状态</label>
        <select v-model="element.data.data.status" @change="updateNodeData">
          <option value="正常">正常</option>
          <option value="告警">告警</option>
          <option value="故障">故障</option>
          <option value="停止">停止</option>
        </select>
      </div>
    </template>

    <!-- 位置（X/Y 同行显示） -->
    <div class="section-divider">位置</div>
    <div class="field-row">
      <div class="field field-compact">
        <label>X</label>
        <input type="number" v-model.number="posX" @input="onPositionInput" />
      </div>
      <div class="field field-compact">
        <label>Y</label>
        <input type="number" v-model.number="posY" @input="onPositionInput" />
      </div>
    </div>

    <!-- 尺寸（宽度/高度同行显示） -->
    <div class="section-divider">尺寸</div>
    <div class="field-row">
      <div class="field field-compact">
        <label>宽度</label>
        <input type="number" min="40" v-model.number="nodeWidth" @input="onSizeInput" />
      </div>
      <div class="field field-compact">
        <label>高度</label>
        <input type="number" min="40" v-model.number="nodeHeight" @input="onSizeInput" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import NodeIcon from '@/components/nodes/NodeIcon.vue'
import { nodeTemplates } from '@/components/nodes/nodeTemplates'
import {
  PRESET_ICONS,
  ICON_SIZE_MIN,
  ICON_SIZE_MAX,
  ICON_SIZE_DEFAULT,
  ICON_UPLOAD_ACCEPT,
  ICON_UPLOAD_MAX_BYTES,
  ICON_UPLOAD_MAX_DIMENSION,
  isImageIcon,
  resolveNodeIcon,
  clampIconSize,
  iconOnlyNodeSize,
  isMinimalIconShape,
} from '@/components/nodes/nodeIcons'

const props = defineProps<{
  canvasRef: any
  /** 当前选中的节点元素（type === 'node' 时渲染本组件） */
  element: any
}>()

const editorStore = useEditorStore()

// ===================== 辅助方法：获取 Graph 实例 =====================
function getGraph(): any {
  const g = props.canvasRef?.graph
  return g?.value !== undefined ? g.value : g
}

// ===================== 基础属性更新 =====================
/** 当前选中元素的类型显示名（与节点详情对话框一致：取 nodeTemplates 模板 label，兜底形状名） */
const nodeTypeLabel = computed(() => {
  const shape = props.element?.type === 'node' ? (props.element.data.shape || '') : ''
  return nodeTemplates.find((t) => t.type === shape)?.label || shape || '未知'
})

function updateNodeLabel() {
  if (!props.element || props.element.type !== 'node') return
  editorStore.updateNode(props.element.data.id, { label: props.element.data.label })
}

function updateNodeName() {
  if (!props.element || props.element.type !== 'node') return
  const nodeId = props.element.data.id
  const newName = props.element.data.name

  const storeNode = editorStore.graphData.nodes.find(n => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), name: newName } })
  }

  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      const currentData = node.getData() || {}
      node.setData({ ...currentData, name: newName })
    }
  }
}

/** 名称输入（所有节点可用；节点 data 未预置 name 时先写入再同步，避免 v-model 对 undefined 字段失效） */
function onNameInput(e: Event) {
  if (!props.element || props.element.type !== 'node') return
  props.element.data.name = (e.target as HTMLInputElement).value
  updateNodeName()
}

function updateNodeData() {
  if (!props.element || props.element.type !== 'node') return
  editorStore.updateNode(props.element.data.id, { data: props.element.data.data })
}

/** 同步货架等节点的 data 子字段（rows/cols/floors）到 store 和 X6 节点 */
function updateNodeDataField(field: string) {
  if (!props.element || props.element.type !== 'node') return
  const nodeId = props.element.data.id
  const newValue = props.element.data[field]

  // 通过 updateNode 不可变更新 store
  const storeNode = editorStore.graphData.nodes.find(n => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), [field]: newValue } })
  }

  // 同步更新 X6 节点 data
  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      const currentData = node.getData() || {}
      node.setData({ ...currentData, [field]: newValue })
    }
  }
}

// ===================== 节点图标（默认 / 预设 / 上传自定义 / 尺寸控制） =====================
// 原生形状（rect/circle）不走 Vue 节点渲染，不支持图标编辑
const NATIVE_SHAPES = ['rect', 'circle']
const iconEditable = computed(() =>
  !!props.element &&
  props.element.type === 'node' &&
  !NATIVE_SHAPES.includes(props.element.data.shape)
)

/** 当前选中节点的形状名（用于解析默认图标） */
const nodeShape = computed(() =>
  props.element?.type === 'node' ? (props.element.data.shape || '') : ''
)

/** 当前实际生效的图标（data.icon 优先，否则形状默认图标） */
const currentIcon = computed(() =>
  resolveNodeIcon(nodeShape.value, props.element?.type === 'node' ? props.element.data.icon : '')
)

/** 是否为上传的图片图标（data: URL） */
const isCustomImage = computed(() =>
  props.element?.type === 'node' ? isImageIcon(props.element.data.icon) : false
)

/** 是否使用默认图标（data.icon 未设置） */
const isDefaultIcon = computed(() =>
  props.element?.type === 'node' ? !props.element.data.icon : true
)

// 图标尺寸本地模型（选中节点变化时从节点数据同步）
const iconSizeModel = ref(ICON_SIZE_DEFAULT)
const iconFileInput = ref<HTMLInputElement | null>(null)
const iconUploading = ref(false)
const iconError = ref('')
// 上传帮助说明弹出状态（点击上传按钮旁的 ? 按钮切换，点击外部关闭）
const iconUploadHelpOpen = ref(false)
const iconHelpWrapRef = ref<HTMLElement | null>(null)

// 预设图标下拉面板状态（点击触发按钮展开，选中图标或点击面板外部关闭）
const iconPickerOpen = ref(false)
const iconPickerRef = ref<HTMLElement | null>(null)

/** 切换预设图标下拉面板展开/收起 */
function toggleIconPicker() {
  iconPickerOpen.value = !iconPickerOpen.value
}

/** 点击面板外部时关闭下拉面板与上传帮助气泡 */
function onDocumentClickForIconPicker(e: MouseEvent) {
  if (iconPickerOpen.value) {
    const root = iconPickerRef.value
    if (root && e.target instanceof Node && !root.contains(e.target)) {
      iconPickerOpen.value = false
    }
  }
  if (iconUploadHelpOpen.value) {
    const wrap = iconHelpWrapRef.value
    if (wrap && e.target instanceof Node && !wrap.contains(e.target)) {
      iconUploadHelpOpen.value = false
    }
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentClickForIconPicker)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentClickForIconPicker)
})

/** 双写图标字段到 store 与 X6 节点 data（沿用面板既有同步模式） */
function applyNodeIconData(patch: Record<string, any>) {
  if (!props.element || props.element.type !== 'node') return
  const nodeId = props.element.data.id

  const storeNode = editorStore.graphData.nodes.find((n) => n.id === nodeId)
  if (storeNode) {
    editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), ...patch } })
  }

  const graph = getGraph()
  if (graph) {
    const node = graph.getCellById(nodeId)
    if (node && node.isNode()) {
      node.setData({ ...(node.getData() || {}), ...patch })
    }
  }
}

/** 选择预设图标（选中后自动收起下拉面板） */
function selectIcon(ic: string) {
  iconError.value = ''
  applyNodeIconData({ icon: ic })
  iconPickerOpen.value = false
}

/** 恢复默认图标（清除 icon/iconSize，回退到形状默认图标与默认尺寸） */
function resetIcon() {
  iconError.value = ''
  applyNodeIconData({ icon: undefined, iconSize: undefined })
  iconSizeModel.value = ICON_SIZE_DEFAULT
  syncIconModeNodeSize()
}

/** 更新图标显示尺寸 */
function updateNodeIconSize() {
  iconSizeModel.value = clampIconSize(iconSizeModel.value)
  applyNodeIconData({ iconSize: iconSizeModel.value })
  syncIconModeNodeSize()
}

/**
 * 图标模式下节点模型尺寸随 iconSize 联动：
 * 纯图标渲染时选择框需与图标视觉匹配，尺寸 = iconSize + 内边距（见 iconOnlyNodeSize）。
 * 有效模式 = 节点级覆盖 ?? 全局；仅对支持极简视图的形状生效。
 */
function syncIconModeNodeSize() {
  if (!props.element || props.element.type !== 'node') return
  if (!isMinimalIconShape(props.element.data.shape)) return
  const effectiveMode = props.element.data.displayMode ?? editorStore.displayMode
  if (effectiveMode !== 'icon') return
  const size = iconOnlyNodeSize(iconSizeModel.value)
  props.canvasRef?.updateNodeSize?.(props.element.data.id, size.width, size.height)
}

/** 切换选中节点时同步图标尺寸与清除错误提示 */
watch(
  () => props.element?.data?.id,
  () => {
    iconError.value = ''
    iconPickerOpen.value = false // 切换选中节点时收起下拉面板
    iconUploadHelpOpen.value = false // 切换选中节点时关闭帮助气泡
    const graph = getGraph()
    if (!graph || !props.element || props.element.type !== 'node') {
      iconSizeModel.value = ICON_SIZE_DEFAULT
      return
    }
    const node = graph.getCellById(props.element.data.id)
    iconSizeModel.value = clampIconSize(node?.getData()?.iconSize || undefined)
  },
  { immediate: true }
)

/** 触发隐藏的文件选择框 */
function triggerIconUpload() {
  iconFileInput.value?.click()
}

/** 文件选择后：校验类型/大小 → canvas 压缩为 data URL → 写入节点 */
async function onIconFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (!file) return

  iconError.value = ''
  if (!file.type.startsWith('image/')) {
    iconError.value = '请选择图片文件（PNG / JPG / WebP / SVG）'
    return
  }
  if (file.size > ICON_UPLOAD_MAX_BYTES) {
    iconError.value = '图片超过 2MB，请压缩后再上传'
    return
  }

  iconUploading.value = true
  try {
    const dataUrl = await compressImageToDataUrl(file)
    // 图片图标过大时同步降一档默认显示尺寸，避免撑破节点头部
    applyNodeIconData({ icon: dataUrl })
  } catch (err: any) {
    iconError.value = err?.message || '图片处理失败，请更换文件重试'
  } finally {
    iconUploading.value = false
  }
}

/**
 * 读取图片 → canvas 等比缩放至 ICON_UPLOAD_MAX_DIMENSION 内 → 导出 PNG data URL。
 * 压缩后体积通常仅数 KB，写入节点 data 后随工程文件落盘持久化。
 */
function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败，文件可能已损坏'))
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) {
          reject(new Error('无法读取图片尺寸（SVG 需声明 width/height）'))
          return
        }
        const scale = Math.min(1, ICON_UPLOAD_MAX_DIMENSION / Math.max(w, h))
        const tw = Math.max(1, Math.round(w * scale))
        const th = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = tw
        canvas.height = th
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('当前环境不支持 Canvas'))
          return
        }
        ctx.drawImage(img, 0, 0, tw, th)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// ===================== 位置与尺寸独立管理（绕过 store 响应式链） =====================
const posX = ref(0)
const posY = ref(0)
const nodeWidth = ref(0)
const nodeHeight = ref(0)
let positionRafId: number | null = null
let lastSyncedNodeId: string | null = null

function onPositionInput() {
  // 位置输入框变化 → 调用 X6Canvas 暴露的 updateNodePosition 更新节点位置
  if (!props.element || props.element.type !== 'node') return
  const id = props.element.data.id
  const x = posX.value || 0
  const y = posY.value || 0

  if (props.canvasRef?.updateNodePosition) {
    props.canvasRef.updateNodePosition(id, x, y)
  }
}

function onSizeInput() {
  // 尺寸输入框变化 → 调用 X6Canvas 暴露的 updateNodeSize 更新节点尺寸（最小 40px）
  if (!props.element || props.element.type !== 'node') return
  const id = props.element.data.id
  const w = Math.max(nodeWidth.value || 40, 40)
  const h = Math.max(nodeHeight.value || 40, 40)

  if (props.canvasRef?.updateNodeSize) {
    props.canvasRef.updateNodeSize(id, w, h)
  }
}

function syncPositionFromCanvas() {
  // 从画布读取选中节点的位置/尺寸，同步到输入框显示
  // （画布拖拽时输入框数字实时跟随，而不是等输入才更新）
  const graph = getGraph()
  if (!graph || !editorStore.selectedId) return
  const cell = graph.getCellById(editorStore.selectedId)
  if (cell && cell.isNode()) {
    const pos = cell.getPosition()
    if (posX.value !== Math.round(pos.x) || posY.value !== Math.round(pos.y)) {
      posX.value = Math.round(pos.x)
      posY.value = Math.round(pos.y)
    }
    const size = cell.getSize()
    if (nodeWidth.value !== Math.round(size.width) || nodeHeight.value !== Math.round(size.height)) {
      nodeWidth.value = Math.round(size.width)
      nodeHeight.value = Math.round(size.height)
    }
  }
}

function startPositionPolling() {
  // 用 requestAnimationFrame 持续轮询画布状态（比定时器更流畅），
  // 实现“画布上拖拽 → 输入框数字实时跟随”
  stopPositionPolling()
  const poll = () => {
    syncPositionFromCanvas()
    positionRafId = requestAnimationFrame(poll)
  }
  poll()
}

function stopPositionPolling() {
  // 停止轮询（切换选中/组件卸载时调用，避免空转浪费性能）
  if (positionRafId !== null) {
    cancelAnimationFrame(positionRafId)
    positionRafId = null
  }
}

watch(
    () => editorStore.selectedId,
    (newId) => {
      if (newId && newId !== lastSyncedNodeId) {
        lastSyncedNodeId = newId
        syncPositionFromCanvas()
        startPositionPolling()
      } else if (!newId) {
        lastSyncedNodeId = null
        stopPositionPolling()
      }
    },
    { immediate: true }
)

onBeforeUnmount(() => {
  stopPositionPolling()
})
</script>

<style scoped>
@import './panelShared.css';

/* ===================== 节点图标选择区 ===================== */
.icon-picker {
  position: relative;
  margin-bottom: 10px;
}
.icon-current {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* 当前图标触发按钮（点击展开/收起预设图标面板） */
.icon-picker-trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--statusbar-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: border-color 0.15s, background-color 0.15s;
}
.icon-picker-trigger:hover {
  border-color: var(--color-primary);
}
.icon-picker-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.icon-picker-trigger[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.icon-preview {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
}
.icon-current-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.icon-current-label {
  font-size: 11px;
  color: var(--text-secondary);
}
.icon-picker-caret {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.icon-picker-caret.open {
  transform: rotate(180deg);
}
/* 预设图标下拉面板（紧凑布局：多列小图标 + 限高滚动） */
.icon-picker-panel {
  margin-top: 6px;
  padding: 6px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 150px;
  overflow-y: auto;
}
.icon-reset-btn {
  border: none;
  background: none;
  padding: 2px 0;
  font-size: 11px;
  color: var(--color-primary);
  cursor: pointer;
  transition: opacity 0.15s;
}
.icon-reset-btn:hover {
  opacity: 0.75;
  text-decoration: underline;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 3px;
}
.icon-grid-item {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  padding: 0;
}
.icon-grid-item:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.icon-grid-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-ring);
}
.icon-grid-item.active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.icon-file-input {
  display: none;
}
.icon-upload-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-upload-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--panel-bg);
  color: var(--color-primary);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}
.icon-upload-btn:hover:not(:disabled) {
  background: var(--color-primary-light);
}
.icon-upload-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
/* 上传帮助按钮（? 圆形小按钮，点击展开格式说明） */
.icon-help-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--panel-bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.icon-help-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.icon-help-btn[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
/* 帮助按钮定位容器（弹出气泡以此为锚点） */
.icon-help-wrap {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
}
/* 上传帮助气泡（绝对定位悬浮在按钮下方，不占布局空间） */
.icon-help-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: 172px;
  padding: 8px 10px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.icon-error {
  margin: -2px 0 8px;
  font-size: 11px;
  color: var(--color-danger);
  line-height: 1.4;
}
input[type='range'] {
  width: 100%;
  height: 4px;
  accent-color: var(--color-primary);
  cursor: pointer;
}
</style>
