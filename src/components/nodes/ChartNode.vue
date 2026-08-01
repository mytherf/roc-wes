<template>
  <NodeMinimalView v-if="isMinimal" icon="📈" :name="title" />
  <div v-else class="chart-node">
    <div class="chart-title">{{ title }}</div>
    <div class="chart-container" ref="chartRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import { useDisplayMode } from '@/composables/useDisplayMode'
import NodeMinimalView from './NodeMinimalView.vue'

const props = defineProps<{ node: any }>()

const { isMinimal } = useDisplayMode(props.node)

const chartRef = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null

const data = ref(props.node?.getData() || {})
const title = ref(data.value.title || '实时曲线')
const historyData = ref<number[]>(data.value.history || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)

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
      axisLabel: { fontSize: 9, color: '#999' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
      axisLabel: { fontSize: 9, color: '#999' },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#1890ff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(24,144,255,0.3)' },
            { offset: 1, color: 'rgba(24,144,255,0.05)' },
          ]),
        },
        data: historyData.value,
      },
    ],
  }

  chart.setOption(option)
}

/**
 * 追加新数据点（滑动窗口）
 */
function pushData(value: number) {
  historyData.value.push(value)
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
  if (newData?.history) {
    historyData.value = newData.history
    if (chart) {
      chart.setOption({
        xAxis: { data: historyData.value.map((_, i) => `${i}s`) },
        series: [{ data: historyData.value }],
      })
    }
  }
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