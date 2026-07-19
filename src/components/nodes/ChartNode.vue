<template>
  <div class="chart-node" ref="containerRef">
    <div class="chart-title">{{ title }}</div>
    <div class="chart-container" ref="chartRef"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'

const props = defineProps<{ node: any }>()

const containerRef = ref<HTMLDivElement | null>(null)
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

onMounted(() => {
  nextTick(initChart)
})

onBeforeUnmount(() => {
  chart?.dispose()
})

defineExpose({ pushData })
</script>

<style scoped>
.chart-node {
  width: 260px;
  height: 160px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.chart-title {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  margin-bottom: 4px;
}
.chart-container {
  width: 100%;
  height: calc(100% - 24px);
}
</style>