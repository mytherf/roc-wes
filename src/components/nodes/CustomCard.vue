<template>
  <div class="custom-card" :style="{ borderColor: statusColor }">
    <div class="card-header">
      <span class="icon">{{ icon }}</span>
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

/**
 * Props 说明：
 * 通过 @antv/x6-vue-shape 注册的组件，默认会接收一个名为 'node' 的 prop，
 * 它是 X6 的 Node 实例。通过 node.getData() 可以获取节点自定义数据。
 */
const props = defineProps<{
  node: any; // X6 Node 实例
}>();

// 从节点数据中读取自定义属性
const data = computed(() => props.node.getData());
const title = computed(() => data.value?.title || '未命名');
const icon = computed(() => data.value?.icon || '📦');
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
</script>

<style scoped>
/* 卡片样式 —— 模拟 SCADA 工业卡片 */
.custom-card {
  width: 150px;
  padding: 10px 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 2px solid #d9d9d9;
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
  font-size: 20px;
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
  color: #666;
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