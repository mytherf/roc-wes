<template>
  <!-- X6 画布挂载的容器 -->
  <div id="x6-container" ref="containerRef"></div>
  <!-- 【关键】TeleportContainer 必须放在画布容器同级，Vue 节点才能正确渲染 -->
  <TeleportContainer/>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Graph, Dnd, Selection, Clipboard, Keyboard } from '@antv/x6'
import {getTeleport} from '@antv/x6-vue-shape';

const emit = defineEmits<{
  (e: 'ready', payload: { graph: Graph; dnd: Dnd }): void
}>()

// ===================== 1. 获取 Teleport 容器组件 =====================
// getTeleport() 返回一个 Vue 组件，用于承载所有 Vue 节点。
const TeleportContainer = getTeleport()

// ===================== 2. 响应式引用与实例变量 =====================
// 画布容器的 DOM 引用
const containerRef = ref<HTMLDivElement | null>(null)

// X6 Graph 实例（全局存储，方便后续操作）
let graph: Graph | null = null

// Dnd 拖拽实例（用于侧边栏拖拽）
let dnd: Dnd | null = null

// ===================== 3. 暴露实例给父组件 =====================
// 父组件（App.vue）可以通过 ref 获取到这些实例，用于侧边栏交互。
defineExpose({
  graph,
  dnd,
})




// ===================== 4. 组件挂载后初始化画布 =====================
onMounted(() => {
  // 4.1 确保容器存在
  if (!containerRef.value) return

  // 4.2 创建 Graph 实例
  graph = new Graph({
    container: containerRef.value, // DOM 容器
    width: 800,                    // 宽度（后续可以自适应）
    height: 600,                   // 高度
    grid: true,                    // 显示网格，便于对齐
    background: { color: '#f5f5f5' }, // 浅灰背景

    // ---------- 连线配置（Connecting） ----------
    connecting: {
      // 允许连接到节点（非连接桩也可）
      allowNode: true,
      // 允许连接到连接桩（Port）
      allowPort: true,
      // 不允许从空白处拖出连线（必须从节点开始）
      allowBlank: false,
      // 自动吸附：距离节点 20px 内自动吸附到节点边缘
      snap: {
        radius: 20,
      },
      // 自定义创建边（Edge）的样式
      createEdge: () => {
        return graph!.createEdge({
          shape: 'edge',
          attrs: {
            line: {
              stroke: '#1890ff',      // 蓝色主线
              strokeWidth: 2,
              targetMarker: {
                name: 'block',        // 箭头形状
                width: 12,
                height: 8,
              },
            },
          },
        })
      },
      // 校验连线是否合法（防止自连、重复连接）
      validateConnection: ({ sourceCell, targetCell }) => {
        // 不能连接自己
        if (sourceCell === targetCell) return false
        // 不允许重复连接（两个节点之间只能有一条边）
        const edges = graph!.getEdges()
        for (const edge of edges) {
          if (
              edge.getSourceCellId() === sourceCell?.id &&
              edge.getTargetCellId() === targetCell?.id
          ) {
            return false
          }
        }
        return true
      },
    },
  })

  // 4.3 注册核心插件（功能增强）
  // Selection: 框选 + 多选
  graph.use(
      new Selection({
        enabled: true,        // 启用选择
        multiple: true,       // 允许多选（Ctrl+点击）
        rubberband: true,     // 启用框选（拖动鼠标画框）
        movable: true,        // 选中后可拖动移动
        strict: false,        // 非严格模式（部分包含即选中）
        showNodeSelectionBox: true, // 显示选中框
      })
  )

  // Clipboard: 复制/剪切/粘贴
  graph.use(
      new Clipboard({
        enabled: true,
        useLocalStorage: false, // 不存入 localStorage，仅内存
      })
  )

  // Keyboard: 快捷键支持
  graph.use(
      new Keyboard({
        enabled: true,
        global: true, // 全局快捷键（即使焦点不在画布上也能生效）
      })
  )

  // 4.4 注册快捷键
  // Ctrl+C: 复制选中的节点/边
  graph.bindKey('ctrl+c', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.copy(cells)
    }
  })

  // Ctrl+V: 粘贴，偏移 20px 防止重叠
  graph.bindKey('ctrl+v', () => {
    if (!graph!.isClipboardEmpty()) {
      graph!.paste({ offset: { dx: 20, dy: 20 } })
    }
  })

  // Delete / Backspace: 删除选中的元素
  graph.bindKey('delete', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.removeCells(cells)
    }
  })
  graph.bindKey('backspace', () => {
    const cells = graph!.getSelectedCells()
    if (cells.length) {
      graph!.removeCells(cells)
    }
  })

  // Ctrl+A: 全选所有节点和边
  graph.bindKey('ctrl+a', () => {
    const allCells = graph!.getCells()
    graph!.select(allCells)
  })

  // 4.5 创建 Dnd 实例（用于侧边栏拖拽）
  dnd = new Dnd({
    target: graph, // 拖拽的目标画布
    // 拖拽过程中显示的节点样式（可以自定义）
    getDragNode: (node) => {
      // 克隆一个节点，并更改样式以表示正在拖拽
      const cloned = node.clone()
      cloned.setAttrs({
        body: {
          stroke: '#1890ff',
          strokeWidth: 2,
          fill: '#e6f7ff',
        },
      })
      return cloned
    },
    // 节点放置到画布后的回调（可在此调整位置或属性）
    getDropNode: (node) => {
      const { width, height } = node.size()
      // 返回一个新的节点作为实际放置到画布上的节点
      return node.clone().size(width * 1.2, height * 1.2)
    },
  })

  // 4.6 加载初始示例数据（展示 Hello World 和自定义节点）
  const data = {
    nodes: [
      {
        id: 'node1',
        shape: 'rect',
        x: 40,
        y: 40,
        width: 100,
        height: 40,
        label: 'Hello',
        attrs: {
          body: {
            stroke: '#8f8f8f',
            strokeWidth: 1,
            fill: '#fff',
            rx: 6,
            ry: 6,
          },
        },
        // 为节点添加连接桩（Port），使其可连线
        ports: {
          groups: {
            top: {
              position: 'top',
              attrs: {
                circle: {
                  r: 4,
                  magnet: true,     // 关键：允许连线
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
            { id: 'top1', group: 'top' },
            { id: 'bottom1', group: 'bottom' },
          ],
        },
      },
      {
        id: 'node2',
        shape: 'rect',
        x: 200,
        y: 180,
        width: 100,
        height: 40,
        label: 'World',
        attrs: {
          body: {
            stroke: '#8f8f8f',
            strokeWidth: 1,
            fill: '#fff',
            rx: 6,
            ry: 6,
          },
        },
        ports: {
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
            { id: 'top2', group: 'top' },
            { id: 'bottom2', group: 'bottom' },
          ],
        },
      },
      {
        id: 'node3',
        shape: 'custom-card', // 使用我们注册的自定义形状
        x: 160,
        y: 120,
        data: {
          title: '温度传感器',
          icon: '🌡️',
          status: '正常',
        },
        // 自定义节点也可以添加连接桩（需要在 Vue 组件中体现，这里省略）
      },
    ],
    edges: [
      {
        shape: 'edge',
        source: 'node1',
        target: 'node2',
        label: 'X6',
        attrs: {
          line: {
            stroke: '#8f8f8f',
            strokeWidth: 1,
          },
        },
      },
    ],
  }

  graph.fromJSON(data)
  graph.centerContent() // 居中显示所有内容


  // 4.7 可选：监听画布事件，便于调试
  graph.on('cell:click', ({ cell }) => {
    console.log('点击了元素:', cell.id)
  })

  // 监听连线完成事件
  graph.on('edge:connected', ({ edge }) => {
    console.log(
        '连线完成:',
        edge.getSourceCellId(),
        '->',
        edge.getTargetCellId()
    )
  })

  emit('ready', {
    graph: graph as Graph,
    dnd: dnd as Dnd,
  })
});

// ===================== 5. 组件卸载前清理 =====================
onBeforeUnmount(() => {
  if (graph) {
    graph.dispose() // 释放 X6 资源
    graph = null
  }
})



</script>



<style scoped>
#x6-container {
  width: 100%;
  height: 100%;
}
</style>