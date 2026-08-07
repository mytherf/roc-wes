<!-- ═══════════════════════════════════════════════════════════════
     IndicatorNode.vue - 指示灯节点
     画布上的指示灯图形：标签 + 圆形指示灯 + 状态文字。
     指示灯颜色由状态驱动（on 绿色常亮 / off 灰色 / warning 黄色闪烁 /
     error 红色快速闪烁），通过 useNodeStatus 的 prefix: 'light' 定制
     CSS 类名（light-on / light-off / light-warning / light-error）。
     数据字段（useNodeData 声明）：
       - label: 标签文字（默认 指示灯）
       - status: 灯状态（on/off/warning/error，默认 off）
     组件通过 defineExpose 暴露 setStatus()，供外部（如事件脚本）
     动态切换灯的状态。
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="label" :status="status" />
  <div v-else class="indicator-node">
    <div class="indicator-label">
      <NodeIcon class="indicator-icon" :icon="displayIcon" :size="Math.min(iconSize, 24)" alt="指示灯" />
      {{ label }}
    </div>
    <div class="indicator-body">
      <div class="indicator-light" :class="statusClass"></div>
      <span class="indicator-status">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNodeData } from '@/composables/useNodeData'
import { useNodeStatus } from '@/composables/useNodeStatus'
import { useDisplayMode } from '@/composables/useDisplayMode'
import { useNodeIcon } from '@/composables/useNodeIcon'
import NodeMinimalView from './NodeMinimalView.vue'
import NodeIcon from './NodeIcon.vue'

const props = defineProps<{ node: any }>()

const { isMinimal } = useDisplayMode(props.node)
const { displayIcon, iconSize } = useNodeIcon(props.node, 'indicator-node')

const { label, status } = useNodeData(props.node, {
  label: '指示灯',
  status: 'off',
})

const { statusClass, statusText } = useNodeStatus(status, {
  prefix: 'light',
  labels: { on: '运行中', off: '已停止', warning: '告警', error: '故障' },
})

// 暴露更新方法
defineExpose({ setStatus: (s: string) => { status.value = s } })
</script>

<style scoped>
.indicator-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  padding: 10px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  justify-content: center;
  user-select: none;
}
.indicator-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.indicator-body {
  display: flex;
  align-items: center;
  gap: 10px;
}
.indicator-light {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  transition: all 0.3s;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
}
.light-on {
  background: #52c41a;
  box-shadow: 0 0 12px rgba(82, 196, 26, 0.5);
}
.light-off {
  background: #d9d9d9;
}
.light-warning {
  background: #faad14;
  box-shadow: 0 0 12px rgba(250, 173, 20, 0.5);
  animation: blink 0.8s infinite;
}
.light-error {
  background: #ff4d4f;
  box-shadow: 0 0 12px rgba(255, 77, 79, 0.5);
  animation: blink 0.5s infinite;
}
.indicator-status {
  font-size: 13px;
  color: var(--text-primary);
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>