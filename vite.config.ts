// ========== Vite 构建配置 ==========
// Vite 是本项目的开发服务器 + 打包工具。这个文件定义了：
// 1. 使用的插件（Vue 支持、内置模拟数据服务）
// 2. 路径别名（@ 指向 src 目录）

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue' // Vue 3 单文件组件(.vue)编译插件
import path from 'path' // Node 内置模块：处理文件路径
import { startMockServers } from './mock/server.ts' // 自研的模拟数据服务（见 mock 目录）

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 内置模拟数据服务：随 dev server 自动启动（WS/HTTP/SSE/MQTT）
    // 这样前端在开发阶段不依赖真实工业设备，也能看到实时数据流
    {
      name: 'mock-data-servers',
      // configureServer 是 Vite 插件钩子：dev 服务器启动完成后被调用
      configureServer() {
        startMockServers()
      },
    },
  ],
  resolve: {
    alias: {
      // 路径别名：代码里 import xxx from '@/...' 会被解析为 src/... 目录下的文件
      '@': path.resolve(__dirname, './src')
    }
  }
})
