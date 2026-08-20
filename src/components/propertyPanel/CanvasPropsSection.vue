<!-- ══════════════════════════════════════════════════════════════════════
     CanvasPropsSection.vue - 属性面板「画布属性」区块

     点击画布空白处时展示：画布统计（节点/连线数量）与画布设置
     （背景色 / 网格显隐 / 网格大小与类型），直接作用于 X6 Graph 实例。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div>
    <div class="field">
      <label>类型</label>
      <span>画布</span>
    </div>
    <div class="field">
      <label>节点数量</label>
      <span>{{ nodeCount }}</span>
    </div>
    <div class="field">
      <label>连线数量</label>
      <span>{{ edgeCount }}</span>
    </div>

    <div class="section-divider">画布设置</div>

    <div class="field">
      <label>背景颜色</label>
      <input type="color" class="color-input" v-model="canvasBgColor" @input="updateCanvasBackground" />
    </div>

    <div class="field checkbox-field">
      <label class="checkbox-label">
        <input type="checkbox" v-model="canvasGridVisible" @change="updateGridVisible" />
        <span>显示网格</span>
      </label>
    </div>

    <div class="field">
      <label>网格大小</label>
      <input type="number" min="1" v-model.number="canvasGridSize" @input="updateGridSize" :disabled="!canvasGridVisible" />
    </div>

    <div class="field">
      <label>网格类型</label>
      <select v-model="canvasGridType" @change="updateGridType" :disabled="!canvasGridVisible">
        <option value="dot">点状</option>
        <option value="mesh">网格线</option>
        <option value="fixedDot">固定点</option>
        <option value="doubleMesh">双层网格</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{
  canvasRef: any
}>()

const editorStore = useEditorStore()

// ===================== 辅助方法：获取 Graph 实例 =====================
// canvasRef.graph 是一个 ref（来自 X6Canvas 的 defineExpose），需要读取 .value
function getGraph(): any {
  const g = props.canvasRef?.graph
  // 如果是 ref，取 .value；否则直接返回（兼容旧写法）
  return g?.value !== undefined ? g.value : g
}

// ===================== 画布统计与设置 =====================
// 画布统计信息（来源于 store 的 graphData，随数据变化自动更新）
const nodeCount = computed(() => editorStore.graphData.nodes.length)
const edgeCount = computed(() => editorStore.graphData.edges.length)

// 画布设置的本地状态（与 X6Canvas 的初始配置保持一致）
const canvasBgColor = ref('#f8fafc')
const canvasGridVisible = ref(true)
const canvasGridSize = ref(10)
const canvasGridType = ref<'dot' | 'mesh' | 'fixedDot' | 'doubleMesh'>('dot')

// 选中画布时，从 Graph 实例同步可读的当前状态（如网格大小）
watch(
    () => editorStore.canvasSelected,
    (selected) => {
      if (!selected) return
      const graph = getGraph()
      if (graph) {
        canvasGridSize.value = graph.getGridSize()
      }
    },
    { immediate: true }
)

/** 更新画布背景颜色 */
function updateCanvasBackground() {
  getGraph()?.drawBackground({ color: canvasBgColor.value })
}

/** 切换网格显隐 */
function updateGridVisible() {
  const graph = getGraph()
  if (!graph) return
  canvasGridVisible.value ? graph.showGrid() : graph.hideGrid()
}

/** 更新网格大小 */
function updateGridSize() {
  const graph = getGraph()
  if (!graph) return
  canvasGridSize.value = Math.max(canvasGridSize.value || 1, 1)
  graph.setGridSize(canvasGridSize.value)
}

/** 更新网格类型 */
function updateGridType() {
  getGraph()?.drawGrid({ type: canvasGridType.value })
}
</script>

<style scoped>
@import './panelShared.css';
</style>
