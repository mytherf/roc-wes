/**
 * 节点注册表 - 统一管理所有 X6 自定义 Vue 节点的注册
 *
 * 消除 main.ts 和 RunView.vue 中重复且不一致的节点注册逻辑。
 * 只需在应用入口 import 此文件即可完成全部注册。
 *
 * 新增节点时只需在下方 nodeRegistry 数组中添加一项即可。
 */
import { register } from '@antv/x6-vue-shape'

// IoT / 基础节点
import CustomCard from './CustomCard.vue'
import GaugeNode from './GaugeNode.vue'
import ChartNode from './ChartNode.vue'
import IndicatorNode from './IndicatorNode.vue'

// WCS 设备节点
import StackerNode from './StackerNode.vue'
import ConveyorNode from './ConveyorNode.vue'
import AgvNode from './AgvNode.vue'
import ShuttleNode from './ShuttleNode.vue'
import SorterNode from './SorterNode.vue'
import ElevatorNode from './ElevatorNode.vue'
import RobotNode from './RobotNode.vue'
import RackNode from './RackNode.vue'

// 工作流节点
import WorkflowStartNode from './workflow/WorkflowStartNode.vue'
import WorkflowEndNode from './workflow/WorkflowEndNode.vue'
import ConditionNode from './workflow/ConditionNode.vue'
import TimerNode from './workflow/TimerNode.vue'
import HttpRequestNode from './workflow/HttpRequestNode.vue'
import CustomCodeNode from './workflow/CustomCodeNode.vue'

/** 节点形状名 → 组件 映射表 */
const nodeRegistry: { shape: string; component: any }[] = [
  // IoT / 基础
  { shape: 'custom-card', component: CustomCard },
  { shape: 'gauge-node', component: GaugeNode },
  { shape: 'chart-node', component: ChartNode },
  { shape: 'indicator-node', component: IndicatorNode },
  // WCS 设备
  { shape: 'stacker-node', component: StackerNode },
  { shape: 'conveyor-node', component: ConveyorNode },
  { shape: 'agv-node', component: AgvNode },
  { shape: 'shuttle-node', component: ShuttleNode },
  { shape: 'sorter-node', component: SorterNode },
  { shape: 'elevator-node', component: ElevatorNode },
  { shape: 'robot-node', component: RobotNode },
  { shape: 'rack-node', component: RackNode },
  // 工作流
  { shape: 'workflow-start', component: WorkflowStartNode },
  { shape: 'workflow-end', component: WorkflowEndNode },
  { shape: 'condition-node', component: ConditionNode },
  { shape: 'timer-node', component: TimerNode },
  { shape: 'http-request-node', component: HttpRequestNode },
  { shape: 'custom-code-node', component: CustomCodeNode },
]

/** 注册所有节点（幂等，多次调用安全） */
let registered = false
export function registerAllNodes() {
  if (registered) return
  for (const { shape, component } of nodeRegistry) {
    register({ shape, component })
  }
  registered = true
}

// 模块被导入时自动注册
registerAllNodes()
