<template>
  <div class="sidebar">
    <h3 class="title">📦 组件库</h3>
    <p class="hint">拖拽到画布</p>
    <div class="node-list">
      <!-- 遍历模板列表，每个项目绑定 mousedown 触发拖拽 -->
      <div
          v-for="item in nodeTemplates"
          :key="item.type"
          class="node-item"
          @mousedown="handleDragStart($event, item)"
      >
        <span class="icon">{{ item.icon }}</span>
        <span class="label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nodeTemplates, buildNodeConfig, type NodeTemplate } from '@/components/nodes/nodeTemplates'

// 从父组件接收 graph 和 dnd 实例
const props = defineProps<{
  graph: any // Graph 实例
  dnd: any   // Dnd 实例
}>()

/**
 * 处理鼠标按下事件，启动 Dnd 拖拽
 *
 * 节点配置完全由 nodeTemplates 注册表驱动，
 * 此处仅负责：校验依赖 → 构建配置 → 创建节点 → 启动拖拽。
 */
const handleDragStart = (e: MouseEvent, item: NodeTemplate) => {
  if (!props.dnd || !props.graph) {
    console.warn('Dnd 或 Graph 未初始化')
    return
  }

  const nodeConfig = buildNodeConfig(item, props.graph)
  const node = props.graph.createNode(nodeConfig)
  props.dnd.start(node, e)
}
</script>

<style scoped>
.sidebar {
  width: 180px;
  min-width: 140px;
  flex-shrink: 0;
  height: 100%;
  background: #f0f2f5;
  padding: 16px;
  border-right: 1px solid #e8e8e8;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.title {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #333;
}

.hint {
  margin: 0 0 16px 0;
  font-size: 12px;
  color: #999;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* ===== 单个节点卡片 ===== */
.node-item {
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  user-select: none;
  min-width: 0;
}

.node-item:hover {
  border-color: #1890ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.15);
}

.node-item:active {
  cursor: grabbing;
}

.icon {
  font-size: 18px;
}

.label {
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .sidebar {
    width: 140px;
    padding: 12px;
  }
  .title {
    font-size: 14px;
  }
  .node-item {
    padding: 8px 10px;
    gap: 6px;
  }
  .icon {
    font-size: 16px;
  }
  .label {
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .sidebar {
    width: 56px;
    min-width: 56px;
    padding: 8px;
    align-items: center;
  }
  .title,
  .hint {
    display: none;
  }
  .label {
    display: none;
  }
  .node-item {
    justify-content: center;
    padding: 10px 8px;
  }
}
</style>