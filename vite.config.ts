import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { startMockServers } from './mock/server.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 内置模拟数据服务：随 dev server 自动启动（WS/HTTP/SSE/MQTT）
    {
      name: 'mock-data-servers',
      configureServer() {
        startMockServers()
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
