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
  server: {
    // 固定开发端口为 1420（Tauri 官方推荐端口）：
    // 5173 在部分 Windows 机器上会落入 Hyper-V/WinNAT 动态保留端口范围，
    // 导致 listen EACCES（permission denied）；strictPort 保证端口固定，
    // 与 tauri.conf.json 的 devUrl 保持一致（被占用时直接报错而非静默换端口）
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      // 路径别名：代码里 import xxx from '@/...' 会被解析为 src/... 目录下的文件
      '@': path.resolve(__dirname, './src')
    }
  }
})
