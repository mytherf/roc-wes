<!-- ═══════════════════════════════════════════════════════════════
     ShuttleNode.vue - 穿梭车节点（轨道上往复运输的小车）

     画布上的穿梭车图形：轨道 + 沿轨道滑动的小车（带方向箭头）。
     数据字段（useNodeData 声明）：
       - name: 名称（默认 穿梭车-01）
       - position: 在轨道上的位置百分比（0-100，小车 left 定位）
       - isMoving / routeAngle: 移动状态与方向（随路线运动更新）
       - status: 运行状态（idle/running/error，颜色区分）
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="name" :status="status" />
  <div v-else class="shuttle-node" :class="{ 'shuttle-moving': isMoving }">
    <div class="shuttle-body">
      <div class="shuttle-track">
        <div class="shuttle-car" :style="{ left: positionPercent + '%' }">
          <NodeIcon class="shuttle-icon" :icon="displayIcon" :size="iconSize" alt="穿梭车" />
          <span v-if="isMoving" class="shuttle-direction" :style="{ transform: `rotate(${routeAngle}deg)` }">➤</span>
        </div>
      </div>
    </div>
    <div class="shuttle-info">
      <span class="shuttle-name">{{ name }}</span>
      <span class="shuttle-status" :class="statusClass">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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
const { displayIcon, iconSize } = useNodeIcon(props.node, 'shuttle-node')

const { name, position, status, isMoving, routeAngle } = useNodeData(props.node, {
  name: '穿梭车-01',
  position: 50, // 0-100
  status: 'idle',
  isMoving: false,
  routeAngle: 0,
})

const { statusClass, statusText } = useNodeStatus(status)

const positionPercent = computed(() => Math.min(100, Math.max(0, position.value)))
</script>

<style scoped>
.shuttle-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 10px 14px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid var(--accent-shuttle);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.shuttle-body { padding: 8px 0; }
.shuttle-track {
  height: 30px;
  background: var(--statusbar-bg);
  border-radius: 15px;
  position: relative;
  border: 1px solid var(--border-color);
}
.shuttle-car {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.5s ease;
}
.shuttle-icon { font-size: 20px; }
.shuttle-direction {
  position: absolute;
  top: -8px;
  right: -6px;
  font-size: 9px;
  color: var(--accent-shuttle);
  transition: transform 0.1s linear;
}
.shuttle-moving .shuttle-track {
  border-color: var(--accent-shuttle);
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent-shuttle) 30%, transparent);
}
.shuttle-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 4px;
}
.shuttle-name { font-weight: 500; color: var(--text-primary); }
.shuttle-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: var(--text-muted); }
.status-running { color: var(--status-ok); }
.status-error { color: var(--status-err); }
</style>