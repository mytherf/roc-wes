<!-- ═══════════════════════════════════════════════════════════════
     ChartNode.vue - 折线图节点（ECharts 实时趋势曲线）
     画布上的折线图图形：标题 + 平滑曲线 + 渐变面积填充。
     数据字段（node.getData() 读取）：
       - title: 标题（默认 实时曲线）
       - history: 历史数据数组（默认 20 个 0，最多保留 20 个点）
     数据变化监听：
       - change:data 事件 → 整体替换 history（数据绑定推送）
       - change:size 事件 → 同步 ECharts 画布尺寸（拖拽缩放）
     极简模式下释放图表实例，切回完整模式时重新初始化。
     组件通过 defineExpose 暴露 pushData() 供外部追加数据点。
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="title" />
  <div v-else class="chart-node">
    <div class="chart-title">
      <NodeIcon class="chart-icon" :icon="displayIcon" :size="iconSize" alt="折线图" />
      {{ title }}
    </div>
    <div class="chart-container" ref="chartRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import { useDisplayMode } from '@/composables/useDisplayMode'
import { useNodeIcon } from '@/composables/useNodeIcon'
import { useThemeStore } from '@/stores/theme'
import { readCssVar, hexToRgba } from '@/utils/themeCss'
import NodeMinimalView from './NodeMinimalView.vue'
import NodeIcon from './NodeIcon.vue'

const props = defineProps<{ node: any }>()

const { isMinimal } = useDisplayMode(props.node)
const { displayIcon, iconSize } = useNodeIcon(props.node, 'chart-node')

const chartRef = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null

const data = ref(props.node?.getData() || {})
const title = ref(data.value.title || '实时曲线')
// 初始窗口：优先取模板/旧工程持久化的 history；未绑定数据源的节点保持静态 0 线
const historyData = ref<number[]>(
  Array.isArray(data.value.history) && data.value.history.length > 0
    ? [...data.value.history]
    : Array(20).fill(0)
)

function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)

  // 颜色跟随当前主题（CSS 变量），主题切换时重新初始化
  const lineColor = readCssVar('--color-primary', '#1890ff')
  const mutedColor = readCssVar('--text-muted', '#999')
  const gridColor = readCssVar('--canvas-grid', '#f0f0f0')

  const option = {
    title: { show: false },
    grid: {
      left: '3%',
      right: '3%',
      bottom: '3%',
      top: '5%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: historyData.value.map((_, i) => `${i}s`),
      axisLabel: { fontSize: 9, color: mutedColor },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: gridColor, type: 'dashed' } },
      axisLabel: { fontSize: 9, color: mutedColor },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: lineColor, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexToRgba(lineColor, 0.3) },
            { offset: 1, color: hexToRgba(lineColor, 0.05) },
          ]),
        },
        data: historyData.value,
      },
    ],
  }

  chart.setOption(option)
}

/**
 * 追加新数据点（滑动窗口，最多 20 点）
 * 仅接受可转为有限数字的值（转换函数若返回对象/字符串则不画点，避免图表异常）
 */
function pushData(value: number) {
  const num = Number(value)
  if (!Number.isFinite(num)) return
  historyData.value.push(num)
  if (historyData.value.length > 20) {
    historyData.value.shift()
  }
  if (chart) {
    chart.setOption({
      xAxis: { data: historyData.value.map((_, i) => `${i}s`) },
      series: [{ data: historyData.value }],
    })
  }
}

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (!newData) return
  // 数据绑定推送：画面点实时值（useDataService 写入 data.value）→ 追加到滑动窗口
  if (newData.value !== undefined) {
    pushData(newData.value)
  } else if (Array.isArray(newData.history)) {
    // 兼容旧逻辑：外部显式整体替换 history（未走数据绑定的场景）
    historyData.value = newData.history
    if (chart) {
      chart.setOption({
        xAxis: { data: historyData.value.map((_, i) => `${i}s`) },
        series: [{ data: historyData.value }],
      })
    }
  }
  title.value = newData.title || '实时曲线'
})

// 监听节点尺寸变化（缩放拖拽），同步 ECharts 画布大小
props.node?.on('change:size', () => {
  nextTick(() => chart?.resize())
})

onMounted(() => {
  nextTick(initChart)
})

// 显示模式切换：极简模式下释放图表，切回图标模式时重新初始化
watch(isMinimal, (minimal) => {
  if (minimal) {
    chart?.dispose()
    chart = null
  } else {
    nextTick(initChart)
  }
})

// 主题切换：重新读取 CSS 变量重建图表配色
const themeStore = useThemeStore()
watch(
  () => themeStore.current,
  () => {
    if (isMinimal.value || !chartRef.value) return
    chart?.dispose()
    chart = null
    nextTick(initChart)
  }
)

onBeforeUnmount(() => {
  chart?.dispose()
})

defineExpose({ pushData })
</script>

<style scoped>
.chart-node {
  width: 100%;
  height: 100%;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chart-title {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: 4px;
  flex-shrink: 0;
}
.chart-container {
  width: 100%;
  flex: 1;
  min-height: 0;
}
</style>