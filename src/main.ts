import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import router from './router'
import App from './App.vue'

// 统一注册所有 X6 自定义 Vue 节点（导入即注册）
import './components/nodes/registry'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).use(router).mount('#app')
