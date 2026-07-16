<template>
  <div class="gauge-node" ref="containerRef">
    <div class="gauge-title">{{ title }}</div>
    <div class="gauge-chart" ref="chartRef"></div>
    <div class="gauge-value">
      {{ currentValue }} {{ unit }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'

/**
 * 仪表盘节点组件
 * 通过 node  prop 获取 X6 节点实例，从 node.getData() 读取配置
 */
const props = defineProps<{
  node: any // X6 Node 实例
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null

// 从节点数据中读取配置
const data = ref(props.node?.getData() || {})
const title = ref(data.value.title || '仪表盘')
const unit = ref(data.value.unit || '°C')
const min = ref(data.value.min ?? 0)
const max = ref(data.value.max ?? 100)
const currentValue = ref(data.value.value ?? 50)

/**
 * 初始化 ECharts 图表
 */
function initChart() {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)

  const option = {
    series: [
      {
        type: 'gauge',
        center: ['50%', '60%'],
        radius: '90%',
        startAngle: 210,
        endAngle: -30,
        min: min.value,
        max: max.value,
        progress: {
          show: true,
          width: 12,
          roundCap: true,
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [
              [0.3, '#ff4d4f'],
              [0.7, '#faad14'],
              [1, '#52c41a'],
            ],
          },
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          length: 10,
          lineStyle: {
            width: 2,
            color: '#999',
          },
        },
        axisLabel: {
          distance: 20,
          color: '#999',
          fontSize: 10,
        },
        pointer: {
          width: 4,
          length: '60%',
        },
        detail: {
          valueAnimation: true,
          formatter: `{value} ${unit.value}`,
          color: '#333',
          fontSize: 14,
          offsetCenter: [0, '40%'],
        },
        data: [{ value: currentValue.value }],
      },
    ],
  }

  chart.setOption(option)
}

/**
 * 更新仪表盘数值
 * 外部通过 node.setData() 更新数据时，组件会自动响应
 */
function updateValue(value: number) {
  currentValue.value = value
  if (chart) {
    chart.setOption({
      series: [{ data: [{ value }] }],
    })
  }
}

/**
 * 监听节点数据变化
 * X6 节点数据变化时会触发 'change:data' 事件
 */
function setupDataWatcher() {
  if (!props.node) return

  // 监听节点数据变化
  props.node.on('change:data', ({ current }: { current: any }) => {
    const newData = current || props.node.getData()
    if (newData) {
      data.value = newData
      title.value = newData.title || '仪表盘'
      unit.value = newData.unit || '°C'
      min.value = newData.min ?? 0
      max.value = newData.max ?? 100
      if (newData.value !== undefined) {
        updateValue(newData.value)
      }
      // 如果尺寸变化，重新适配
      chart?.resize()
    }
  })
}

onMounted(() => {
  nextTick(() => {
    initChart()
    setupDataWatcher()
  })
})

onBeforeUnmount(() => {
  if (chart) {
    chart.dispose()
    chart = null
  }
})

// 暴露更新方法，供外部调用
defineExpose({ updateValue })
</script>

<style scoped>
.gauge-node {
  width: 200px;
  height: 180px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.gauge-title {
  text-align: center;
  font-size: 12px;
  color: #666;
  font-weight: 500;
}
.gauge-chart {
  width: 100%;
  height: 120px;
}
.gauge-value {
  text-align: center;
  font-size: 13px;
  color: #333;
  margin-top: -10px;
}
</style>