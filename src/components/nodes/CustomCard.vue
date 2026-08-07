<!-- ═══════════════════════════════════════════════════════════════
     CustomCard.vue - 自定义卡片节点（通用信息卡片）
     画布上的卡片图形：图标 + 标题 + 可插槽内容区 + 状态徽章。
     与其它节点不同，本组件不使用 useNodeData / useNodeStatus，
     而是直接通过 node.getData() 读取自定义属性：
       - title: 卡片标题（默认 未命名）
       - status: 状态文字（默认 正常），支持 正常/告警/故障/停止
     状态颜色映射（工业场景惯例）：正常绿 / 告警黄 / 故障红 / 停止灰。
     极简模式下会把中文状态翻译成英文（on/warning/error/off）交给
     NodeMinimalView 渲染。
     图标模式（isMinimal）下由 NodeMinimalView 统一渲染。
     ═══════════════════════════════════════════════════════════════ -->
<template>
  <NodeMinimalView v-if="isMinimal" :icon="displayIcon" :icon-size="iconSize" :name="title" :status="minimalStatus" />
  <div v-else class="custom-card" :style="{ borderColor: statusColor }">
    <div class="card-header">
      <NodeIcon class="icon" :icon="displayIcon" :size="iconSize" alt="卡片图标" />
      <span class="title">{{ title }}</span>
    </div>
    <div class="card-body">
      <slot></slot> <!-- 可选的额外内容 -->
    </div>
    <div class="card-footer">
      <span class="status" :style="{ background: statusColor }">{{ statusText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// 这个组件会接收一个名为 'node' 的 prop，即 X6 的 Node 实例
import { computed } from 'vue';
import { useDisplayMode } from '@/composables/useDisplayMode'
import { useNodeIcon } from '@/composables/useNodeIcon'
import NodeMinimalView from './NodeMinimalView.vue'
import NodeIcon from './NodeIcon.vue'

/**
 * Props 说明：
 * 通过 @antv/x6-vue-shape 注册的组件，默认会接收一个名为 'node' 的 prop，
 * 它是 X6 的 Node 实例。通过 node.getData() 可以获取节点自定义数据。
 */
const props = defineProps<{
  node: any; // X6 Node 实例
}>();

const { isMinimal } = useDisplayMode(props.node)
// 图标：data.icon 优先（模板默认注入），否则取形状默认图标；响应式跟随 change:data
const { displayIcon, iconSize } = useNodeIcon(props.node, 'custom-card')

// 从节点数据中读取自定义属性
const data = computed(() => props.node.getData());
const title = computed(() => data.value?.title || '未命名');
const statusText = computed(() => data.value?.status || '正常');

// 根据状态文字映射颜色（工业场景常用）
const statusColor = computed(() => {
  const map: Record<string, string> = {
    '正常': '#52c41a',
    '告警': '#faad14',
    '故障': '#ff4d4f',
    '停止': '#8c8c8c',
  }
  return map[statusText.value] || '#d9d9d9'
})

// 极简模式状态映射（中文状态 → NodeMinimalView 的英文状态）
const minimalStatus = computed(() => {
  const map: Record<string, string> = {
    '正常': 'on',
    '告警': 'warning',
    '故障': 'error',
    '停止': 'off',
  }
  return map[statusText.value] || 'idle'
})
</script>

<style scoped>
/* 卡片样式 —— 模拟 SCADA 工业卡片 */
.custom-card {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding: 10px 12px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  font-family: 'Segoe UI', sans-serif;
  transition: all 0.2s;
  cursor: pointer;
  user-select: none;
}

.custom-card:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 6px;
}

.icon {
  display: inline-flex;
  align-items: center;
}

.title {
  flex: 1;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-body {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  min-height: 18px;
}

.card-footer {
  display: flex;
  justify-content: flex-end;
}

.status {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 12px;
  color: #fff;
  background: #d9d9d9;
}
</style>