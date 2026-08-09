// ========== 应用入口文件 ==========
// 桌面端 WebView 加载 index.html 后会执行本文件，把 Vue 应用启动起来。
// 整个应用的“启动顺序”：创建 Vue 实例 → 挂载状态管理 → 挂载路由 → 渲染到页面

import { createApp } from 'vue' // Vue 3 核心：createApp 用来创建一个应用实例
import { createPinia } from 'pinia' // Pinia 状态管理库：集中管理全局数据（如画布节点、主题）
import './style.css' // 全局基础样式
import router from './router' // 路由配置（见 src/router/index.ts）
import App from './App.vue' // 根组件（整个应用的入口组件）

// 统一注册所有 X6 自定义 Vue 节点（导入即注册）
// 注意：registry.ts 内部会调用 X6 的 register 方法，必须在使用画布前导入一次
import './components/nodes/registry'

// 创建 Pinia 实例（全局状态容器）
// 持久化说明：各 store 自行通过 platform/fileStorage.ts 落盘到应用配置目录（Tauri FS），不再使用插件
const pinia = createPinia()

// 创建 Vue 应用 → 安装 Pinia（状态管理）→ 安装路由 → 挂载到 index.html 的 #app 元素
createApp(App).use(pinia).use(router).mount('#app')
