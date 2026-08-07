<!-- ═══════════════════════════════════════════════════════════════
     AgvNode.vue - AGV 小车节点（自动导引运输车）

     画布上的 AGV 图形：四轮车身 + 中央图标 + 电量条 + 方向箭头。
     数据字段（useNodeData 声明）：
       - name: 名称（默认 AGV-01）
       - battery: 电量百分比（绿色电量条宽度）
       - isMoving: 是否在移动（抖动动画 + 方向箭头，随路线运动更新）
       - routeAngle: 当前行驶方向角度（旋转箭头）
       - status: 运行状态（idle/running/charging/error，颜色区分）
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="name" :status="status" />
  <div v-else class="agv-node" :class="{ 'agv-moving': isMoving }">
    <div class="agv-body">
      <div class="agv-wheel agv-wheel-fl"></div>
      <div class="agv-wheel agv-wheel-fr"></div>
      <div class="agv-center">
        <NodeIcon class="agv-icon" :icon="displayIcon" :size="iconSize" alt="AGV" />
        <span class="agv-battery" :style="{ width: battery + '%' }"></span>
        <span v-if="isMoving" class="agv-direction" :style="{ transform: `rotate(${routeAngle}deg)` }">➤</span>
      </div>
      <div class="agv-wheel agv-wheel-bl"></div>
      <div class="agv-wheel agv-wheel-br"></div>
    </div>
    <div class="agv-info">
      <span class="agv-name">{{ name }}</span>
      <span class="agv-status" :class="statusClass">{{ statusText }}</span>
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

const props = defineProps<{
  node: any
}>()

const { isMinimal } = useDisplayMode(props.node)
const { displayIcon, iconSize } = useNodeIcon(props.node, 'agv-node')

const { name, battery, isMoving, status, routeAngle } = useNodeData(props.node, {
  name: 'AGV-01',
  battery: 85,
  isMoving: false,
  status: 'idle',
  routeAngle: 0,
})

const { statusClass, statusText } = useNodeStatus(status)
</script>

<style scoped>
.agv-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 8px 12px;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 2px solid #722ed1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.agv-body {
  display: grid;
  grid-template-columns: 20px 1fr 20px;
  grid-template-rows: 20px 30px 20px;
  gap: 4px;
  padding: 4px;
}
.agv-wheel {
  width: 16px;
  height: 16px;
  background: #333;
  border-radius: 50%;
  border: 2px solid #666;
}
.agv-wheel-fl { grid-column: 1; grid-row: 1; }
.agv-wheel-fr { grid-column: 3; grid-row: 1; }
.agv-wheel-bl { grid-column: 1; grid-row: 3; }
.agv-wheel-br { grid-column: 3; grid-row: 3; }
.agv-center {
  grid-column: 2; grid-row: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--statusbar-bg);
  border-radius: 6px;
  position: relative;
}
.agv-icon { display: inline-flex; align-items: center; }
.agv-battery {
  position: absolute;
  bottom: 2px;
  left: 4px;
  height: 3px;
  background: #52c41a;
  border-radius: 2px;
  transition: width 0.5s;
}
.agv-direction {
  position: absolute;
  top: 1px;
  right: 2px;
  font-size: 10px;
  color: #722ed1;
  transition: transform 0.1s linear;
}
.agv-moving .agv-center { animation: agvShake 0.3s infinite alternate; }
@keyframes agvShake {
  0% { transform: translateX(-2px); }
  100% { transform: translateX(2px); }
}
.agv-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 4px;
}
.agv-name { font-weight: 500; color: var(--text-primary); }
.agv-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: var(--text-muted); }
.status-running { color: #52c41a; }
.status-charging { color: #faad14; }
.status-error { color: #ff4d4f; }
</style>