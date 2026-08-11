<!-- ═══════════════════════════════════════════════════════════════
     RobotNode.vue - 机械手节点（工业机器人）
     画布上的机械手图形：底座 + 可旋转关节 + 机械臂 + 可开合夹爪。
     数据字段（useNodeData 声明）：
       - name: 名称（默认 机械手-01）
       - jointAngle: 关节旋转角度（旋转机械臂，单位：度）
       - isOpen: 夹爪是否张开（gripper-open 样式切换）
       - status: 运行状态（idle/running/error，颜色区分）
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="name" :status="status" />
  <div v-else class="robot-node">
    <div class="robot-arm">
      <div class="arm-base"></div>
      <div class="arm-joint" :style="{ transform: 'rotate(' + jointAngle + 'deg)' }">
        <div class="arm-link"></div>
        <div class="arm-gripper" :class="{ 'gripper-open': isOpen }"></div>
      </div>
    </div>
    <div class="robot-info">
      <NodeIcon class="robot-icon" :icon="displayIcon" :size="iconSize" alt="机械手" />
      <span class="robot-name">{{ name }}</span>
      <span class="robot-status" :class="statusClass">{{ statusText }}</span>
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
const { displayIcon, iconSize } = useNodeIcon(props.node, 'robot-node')

const { name, jointAngle, isOpen, status } = useNodeData(props.node, {
  name: '机械手-01',
  jointAngle: 0,
  isOpen: false,
  status: 'idle',
})

const { statusClass, statusText } = useNodeStatus(status)
</script>

<style scoped>
.robot-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 12px 16px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid var(--accent-robot);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.robot-arm {
  height: 60px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
}
.arm-base {
  width: 20px;
  height: 10px;
  background: #666;
  border-radius: 4px 4px 0 0;
  position: absolute;
  bottom: 0;
}
.arm-joint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform-origin: bottom center;
  transition: transform 0.5s ease;
}
.arm-link {
  width: 4px;
  height: 30px;
  background: var(--color-primary);
  margin: 0 auto;
  border-radius: 2px;
}
.arm-gripper {
  width: 12px;
  height: 6px;
  background: #666;
  margin: 0 auto;
  border-radius: 2px 2px 4px 4px;
  transition: all 0.3s;
}
.gripper-open { width: 16px; height: 4px; }
.robot-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 8px;
}
.robot-name { font-weight: 500; color: var(--text-primary); }
.robot-status { padding: 0 8px; border-radius: 10px; font-size: 11px; }
.status-idle { color: var(--text-muted); }
.status-running { color: var(--status-ok); }
.status-error { color: var(--status-err); }
</style>