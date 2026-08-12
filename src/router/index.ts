// ========== 路由配置 ==========
// Vue Router 负责“URL 地址 ↔ 页面组件”的映射：
// 用户访问不同地址时，自动显示不同的页面。

import { createRouter, createWebHistory } from 'vue-router' // 创建路由实例 + 使用 HTML5 History 模式（URL 中不带 #）
import MainLayout from '@/layouts/MainLayout.vue' // 主布局组件（编辑器主界面），直接导入（首屏就要用）

// 创建路由实例
const router = createRouter({
    // createWebHistory：使用浏览器原生 history API，地址栏显示为 /xxx 而非 /#/xxx
    history: createWebHistory(),
    // 路由表：列出所有 URL 路径与组件的对应关系
    routes: [
        {
            path: '/', // 访问根路径时
            name: 'main', // 路由名称（可用于编程式跳转）
            component: MainLayout, // 渲染主布局（编辑器界面）
        },
        {
            path: '/run', // 访问 /run 时
            name: 'run',
            // 懒加载：只有真正访问 /run 时才下载 RunView 的代码，减少首屏体积
            component: () => import('@/views/RunView.vue'),
        },
        {
            path: '/route-window', // 路线编辑器独立窗口（多屏支持）
            name: 'route-window',
            // 由 platform/routeWindow.ts 打开的独立 OS 窗口加载本路由（多屏支持）
            component: () => import('@/views/RouteWindowView.vue'),
        },
        {
            path: '/node-detail', // 节点详情独立窗口（运行预览中双击节点打开，?nodeId=xxx）
            name: 'node-detail',
            // 由 platform/routeWindow.ts 的 openNodeDetailWindow 创建的独立 OS 窗口加载本路由
            component: () => import('@/views/NodeDetailView.vue'),
        },
    ],
})

export default router // 导出给 main.ts 使用