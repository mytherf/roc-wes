import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import router from './router'
import App from './App.vue'
import { register } from '@antv/x6-vue-shape'
// 引入X6的自定义VUE组件
import CustomCard from './components/nodes/CustomCard.vue'
import GaugeNode from './components/nodes/GaugeNode.vue'
import ChartNode from './components/nodes/ChartNode.vue'
import IndicatorNode from './components/nodes/IndicatorNode.vue'

import WorkflowStartNode from './components/nodes/workflow/WorkflowStartNode.vue'
import WorkflowEndNode from './components/nodes/workflow/WorkflowEndNode.vue'
import CustomCodeNode from './components/nodes/workflow/CustomCodeNode.vue'

/**
 * 注册自定义 Vue 节点形状
 * 作用：将 Vue 组件与 X6 的 shape 名称绑定，这样在 JSON 数据中
 *       使用 shape: 'custom-card' 时，X6 会自动渲染该 Vue 组件。
 *
 * 参数说明：
 *   shape   : 字符串，在 X6 节点中使用的形状名称（唯一）
 *   component: Vue 组件定义（支持 SFC 或 defineComponent）
 *
 * 注意：register 必须在 createApp 之前调用，确保全局注册生效。
 */
register({ shape: 'custom-card', component: CustomCard })

// 注册仪表盘节点
register({ shape: 'gauge-node', component: GaugeNode })
// 注册折线图节点
register({ shape: 'chart-node', component: ChartNode })
// 注册指示灯节点
register({ shape: 'indicator-node', component: IndicatorNode })
// 注册工作流节点
register({ shape: 'workflow-start', component: WorkflowStartNode })
register({ shape: 'workflow-end', component: WorkflowEndNode })
register({ shape: 'custom-code-node', component: CustomCodeNode })

// 创建 Pinia 实例并启用持久化插件
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).use(router).mount('#app')
