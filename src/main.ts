import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { register } from '@antv/x6-vue-shape'
// 引入自定义组件
import CustomCard from './components/nodes/CustomCard.vue'

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
register({
    shape: 'custom-card',
    component: CustomCard,
})

createApp(App).mount('#app')
