<!-- ═══════════════════════════════════════════════════════════════
     StackerNode.vue - 堆垛机节点（自动化立体仓库的核心设备）

     画布上的堆垛机图形：头部图标/名称 + 状态点 + 巷道/货位 + 移动进度条。
     数据字段（useNodeData 声明）：
       - name: 名称（默认 堆垛机-01）
       - lane: 所在巷道（如 A01）
       - position: 当前货位（如 05-12-03）
       - isMoving / progress / routeAngle: 移动状态与进度（随路线运动更新）
       - status: 运行状态（idle/running/warning/error，颜色+闪烁区分）
     额外暴露 setStatus/setMoving/setProgress 方法供外部控制。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="name" :status="status" />
  <div v-else class="stacker-node" :class="{ 'stacker-moving': isMoving }">
    <div class="stacker-header">
      <NodeIcon class="stacker-icon" :icon="displayIcon" :size="iconSize" alt="堆垛机" />
      <span class="stacker-name">{{ name }}</span>
      <span v-if="isMoving" class="stacker-direction" :style="{ transform: `rotate(${routeAngle}deg)` }">➤</span>
    </div>
    <div class="stacker-body">
      <div class="stacker-status">
        <span class="status-dot" :class="statusClass"></span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      <div class="stacker-info">
        <span>巷道: {{ lane }}</span>
        <span>货位: {{ position }}</span>
      </div>
      <div class="stacker-progress" v-if="isMoving">
        <div class="progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
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
const { displayIcon, iconSize } = useNodeIcon(props.node, 'stacker-node')

const { name, lane, position, status, isMoving, progress, routeAngle } = useNodeData(props.node, {
  name: '堆垛机-01',
  lane: 'A01',
  position: '05-12-03',
  status: 'idle',
  isMoving: false,
  progress: 0,
  routeAngle: 0,
})

const { statusClass, statusText } = useNodeStatus(status, {
  labels: { warning: '告警' },
})

defineExpose({
  setStatus: (s: string) => { status.value = s },
  setMoving: (moving: boolean) => { isMoving.value = moving },
  setProgress: (p: number) => { progress.value = Math.min(100, Math.max(0, p)) },
})
</script>

<style scoped>
.stacker-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 12px 16px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.stacker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.stacker-icon { display: inline-flex; align-items: center; }
.stacker-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.stacker-direction {
  font-size: 10px;
  color: var(--color-primary);
  transition: transform 0.1s linear;
  margin-left: auto;
}
.stacker-body { font-size: 12px; }
.stacker-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.status-idle { background: var(--status-idle); }
.status-running { background: var(--status-ok); animation: pulse 1s infinite; }
.status-warning { background: var(--status-warn); animation: pulse 0.8s infinite; }
.status-error { background: var(--status-err); animation: pulse 0.5s infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.status-text { color: var(--text-secondary); }
.stacker-info {
  display: flex;
  gap: 12px;
  color: var(--text-muted);
}
.stacker-moving .stacker-info { color: var(--color-primary); }
.stacker-progress {
  margin-top: 4px;
  height: 4px;
  background: var(--statusbar-bg);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: var(--color-primary);
  border-radius: 2px;
  transition: width 0.3s;
}
</style>