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

import { PointIdGenerator } from '@/services/PointIdGenerator'

/**
 * 节点模板定义
 * type: X6 节点形状名称（需已在 main.ts 中注册）
 * label: 显示名称
 * icon: 图标
 * pointIdTemplate: 预设点ID模板（null 表示不预设）
 */
const nodeTemplates = [
  // ===== 基础节点（无预设点ID） =====
  { type: 'rect', label: '矩形', icon: '▭', pointIdTemplate: null },
  { type: 'circle', label: '圆形', icon: '◯', pointIdTemplate: null },
  { type: 'custom-card', label: '卡片节点', icon: '📋', pointIdTemplate: null },

  // ===== IoT 节点（预设点ID） =====
  {
    type: 'gauge-node',
    label: '仪表盘',
    icon: '📊',
    pointIdTemplate: 'sensor.temp'
  },
  {
    type: 'chart-node',
    label: '折线图',
    icon: '📈',
    pointIdTemplate: 'sensor.chart'
  },
  {
    type: 'indicator-node',
    label: '指示灯',
    icon: '💡',
    pointIdTemplate: 'device.status'
  },

  // ===== 工作流节点（无预设点ID） =====
  { type: 'workflow-start', label: '开始节点', icon: '▶', pointIdTemplate: null },
  { type: 'workflow-end', label: '结束节点', icon: '■', pointIdTemplate: null },
  { type: 'condition-node', label: '条件判断', icon: '◇', pointIdTemplate: null },
  { type: 'timer-node', label: '定时器', icon: '⏱', pointIdTemplate: null },
  { type: 'http-request-node', label: 'HTTP 请求', icon: '🌐', pointIdTemplate: null },
  { type: 'custom-code-node', label: '自定义代码', icon: '{ }', pointIdTemplate: null },
]

// 从父组件接收 graph 和 dnd 实例
const props = defineProps<{
  graph: any // Graph 实例
  dnd: any   // Dnd 实例
}>()



/**
 * 处理鼠标按下事件，启动 Dnd 拖拽
 * @param e 鼠标事件
 * @param item 模板项
 */
const handleDragStart = (e: MouseEvent, item: typeof nodeTemplates[0]) => {

  // 检查依赖是否存在
  if (!props.dnd || !props.graph) {
    console.warn('Dnd 或 Graph 未初始化')
    return
  }

  // 根据模板类型创建节点
  let nodeConfig: any = {
    shape: item.type,
    width: 120,
    height: 60,
  }

  // 根据不同形状设置不同的默认样式
  if (item.type === 'rect') {
    nodeConfig.attrs = {
      body: {
        fill: '#fff',
        stroke: '#333',
        rx: 6,
        ry: 6,
      },
      label: {
        text: item.label,
        fill: '#333',
        fontSize: 14,
      },
    }
    // 为矩形添加连接桩（Port）
    nodeConfig.ports = {
      groups: {
        top: {
          position: 'top',
          attrs: {
            circle: {
              r: 4,
              magnet: true,
              stroke: '#31d0c6',
              strokeWidth: 2,
              fill: '#fff',
            },
          },
        },
        bottom: {
          position: 'bottom',
          attrs: {
            circle: {
              r: 4,
              magnet: true,
              stroke: '#31d0c6',
              strokeWidth: 2,
              fill: '#fff',
            },
          },
        },
      },
      items: [
        { id: 'top', group: 'top' },
        { id: 'bottom', group: 'bottom' },
      ],
    }
  }
  // 圆形节点
  else if (item.type === 'circle') {
    nodeConfig.attrs = {
      body: {
        fill: '#fff',
        stroke: '#333',
        rx: '50%', // 圆形
      },
      label: {
        text: item.label,
        fill: '#333',
        fontSize: 14,
      },
    }
  }
  // 自定义卡片节点
  else if (item.type === 'custom-card') {
    const generator = PointIdGenerator.getInstance()
    // 从画布初始化已用点ID
    generator.initFromNodes(props.graph.getNodes())
    const pointId = generator.generate(item.pointIdTemplate || 'device.card')

    // 自定义节点通过 data 传递数据
    nodeConfig.data = {
      title: item.label,
      icon: item.icon,
      status: '正常',
      pointId,
      binding: {
        pointId,
        sourceType: 'websocket',
      }
    }
    // 自定义节点大小由 Vue 组件决定，这里设置一个宽高占位
    nodeConfig.width = 160
    nodeConfig.height = 80
  }
  // 仪表盘节点
  else if (item.type === 'gauge-node') {
    const generator = PointIdGenerator.getInstance()
    generator.initFromNodes(props.graph.getNodes())
    const pointId = generator.generate(item.pointIdTemplate || 'sensor.temp')

    nodeConfig.data = {
      title: '温度',
      unit: '°C',
      min: 0,
      max: 100,
      value: 50,
      pointId,
      binding: {
        pointId,
        sourceType: 'websocket',
        transform: (raw: any) => Math.round(raw * 10) / 10,
      },
    }
    nodeConfig.width = 200
    nodeConfig.height = 180
  }
  // 折线图节点
  else if (item.type === 'chart-node') {
    const generator = PointIdGenerator.getInstance()
    generator.initFromNodes(props.graph.getNodes())
    const pointId = generator.generate(item.pointIdTemplate || 'sensor.chart')

    nodeConfig.data = {
      title: '实时曲线',
      history: Array(20).fill(0), // 20个初始数据点
      pointId,
      binding: {
        pointId,
        sourceType: 'websocket',
        transform: (raw: any) => Math.round(raw * 10) / 10,
      }
    }
    nodeConfig.width = 260
    nodeConfig.height = 160
  }
  // 指示灯节点
  else if (item.type === 'indicator-node') {
    const generator = PointIdGenerator.getInstance()
    generator.initFromNodes(props.graph.getNodes())
    const pointId = generator.generate(item.pointIdTemplate || 'device.status')

    nodeConfig.data = {
      label: '设备状态',
      status: 'off',
      pointId,
      binding: {
        pointId,
        sourceType: 'websocket',
        transform: (raw: any) => {
          // 将数值映射为状态字符串
          if (raw > 80) return 'on'
          if (raw > 50) return 'warning'
          if (raw > 20) return 'off'
          return 'error'
        }
      }
    }
    nodeConfig.width = 130
    nodeConfig.height = 70
  } else if (item.type === 'workflow-start') {
    nodeConfig.data = { label: '开始' }
    nodeConfig.width = 120
    nodeConfig.height = 50
  } else if (item.type === 'workflow-end') {
    nodeConfig.data = { label: '结束' }
    nodeConfig.width = 120
    nodeConfig.height = 50
  } else if (item.type === 'condition-node') {
    nodeConfig.data = {
      label: '条件判断',
      branches: [
        { id: 'branch-1', label: '分支 1', expression: '${amount} > 10000' },
        { id: 'branch-2', label: '分支 2', expression: '${amount} <= 10000' },
      ]
    }
    nodeConfig.width = 200
    nodeConfig.height = 120
  } else if (item.type === 'timer-node') {
    nodeConfig.data = {
      label: '定时器',
      duration: 5,
      unit: 'seconds',
    }
    nodeConfig.width = 180
    nodeConfig.height = 100
  } else if (item.type === 'http-request-node') {
    nodeConfig.data = {
      label: 'HTTP 请求',
      method: 'GET',
      url: '',
      body: '',
      timeout: 30,
    }
    nodeConfig.width = 280
    nodeConfig.height = 150
  } else if (item.type === 'custom-code-node') {
    nodeConfig.data = {
      label: '自定义代码',
      code: '// 编写你的代码\nreturn { next: null };',
    }
    nodeConfig.width = 280
    nodeConfig.height = 140
  }

  // 创建节点并启动拖拽
  // 使用 Graph 的 createNode 方法创建节点实例
  const node = props.graph.createNode(nodeConfig)

  // 启动 Dnd 拖拽（传入节点和鼠标事件）
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