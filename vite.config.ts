// ========== Vite 构建配置 ==========
// Vite 是本项目的开发服务器 + 打包工具。这个文件定义了：
// 1. 使用的插件（Vue 支持）
// 2. 路径别名（@ 指向 src 目录）
//
// 注：Node 版内置模拟数据服务（原 mock/ 目录）已移除，
// 桌面端演示模式数据由 Tauri Rust 网关内置 DemoAdapter 生成（见 src-tauri/crates/gateway-demo）。

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue' // Vue 3 单文件组件(.vue)编译插件
import path from 'path' // Node 内置模块：处理文件路径

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      // 路径别名：代码里 import xxx from '@/...' 会被解析为 src/... 目录下的文件
      '@': path.resolve(__dirname, './src')
    }
  }
})
