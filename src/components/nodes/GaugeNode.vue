<!-- ═══════════════════════════════════════════════════════════════
     GaugeNode.vue - 仪表盘节点（ECharts 仪表盘图表）
     画布上的仪表盘图形：标题 + 半圆形指针仪表 + 实时数值。
     数据字段（node.getData() 读取）：
       - title: 标题（默认 仪表盘）
       - unit: 数值单位（默认 °C）
       - min/max: 仪表量程（默认 0~100）
       - value: 当前数值（默认 50）
     仪表盘颜色分段：低值红色 / 中值黄色 / 高值绿色（工业惯例）。
     数据变化监听：
       - change:data 事件 → 刷新标题/量程/数值
       - change:size 事件 → 同步 ECharts 画布尺寸（拖拽缩放）
     极简模式下释放图表实例，切回完整模式时重新初始化。
     组件通过 defineExpose 暴露 updateValue() 供外部更新数值。
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="title" />
  <div v-else class="gauge-node">
    <div class="gauge-title">
      <NodeIcon class="gauge-icon" :icon="displayIcon" :size="iconSize" alt="仪表盘" />
      {{ title }}
    </div>
    <div class="gauge-chart" ref="chartRef"></div>
    <div class="gauge-value">
      {{ currentValue }} {{ unit }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import { useDisplayMode } from '@/composables/useDisplayMode'
import { useNodeIcon } from '@/composables/useNodeIcon'
import { useThemeStore } from '@/stores/theme'
import { readCssVar } from '@/utils/themeCss'
import NodeMinimalView from './NodeMinimalView.vue'
import NodeIcon from './NodeIcon.vue'

/**
 * 仪表盘节点组件
 * 通过 node  prop 获取 X6 节点实例，从 node.getData() 读取配置
 */
const props = defineProps<{
  node: any // X6 Node 实例
}>()

const { isMinimal } = useDisplayMode(props.node)
const { displayIcon, iconSize } = useNodeIcon(props.node, 'gauge-node')

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

  // 颜色跟随当前主题：分段色=状态语义色（低危红/中危琥珀/正常绿），刻度与文字=主题灰阶
  const errColor = readCssVar('--status-err', '#ff4d4f')
  const warnColor = readCssVar('--status-warn', '#faad14')
  const okColor = readCssVar('--status-ok', '#52c41a')
  const mutedColor = readCssVar('--text-muted', '#999')
  const textColor = readCssVar('--text-primary', '#333')

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
              [0.3, errColor],
              [0.7, warnColor],
              [1, okColor],
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
            color: mutedColor,
          },
        },
        axisLabel: {
          distance: 20,
          color: mutedColor,
          fontSize: 10,
        },
        pointer: {
          width: 4,
          length: '60%',
        },
        detail: {
          valueAnimation: true,
          formatter: `{value} ${unit.value}`,
          color: textColor,
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
      chart?.resize()
    }
  })

  // 监听节点尺寸变化（缩放拖拽），同步 ECharts 画布大小
  props.node.on('change:size', () => {
    nextTick(() => chart?.resize())
  })
}

onMounted(() => {
  nextTick(() => {
    initChart()
    setupDataWatcher()
  })
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

// 主题切换：重新读取 CSS 变量重建仪表盘配色
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
.gauge-title {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  flex-shrink: 0;
}
.gauge-chart {
  width: 100%;
  flex: 1;
  min-height: 0;
}
.gauge-value {
  text-align: center;
  font-size: 13px;
  color: var(--text-primary);
  flex-shrink: 0;
}
</style>