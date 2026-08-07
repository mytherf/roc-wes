<!-- ══════════════════════════════════════════════════════════════════════
     RouteWindowView.vue - 路线编辑器独立窗口页面（多屏支持）

     由 platform/routeWindow.ts 打开的独立 OS 窗口（Tauri WebviewWindow，
     label: route-editor）加载本路由（/route-window）。独立窗口是真实的
     操作系统窗口，可以自由拖动到任意显示器。

     与主窗口的关系：
       - 本页面没有画布（canvasRef 传 null），RouteEditorDialog 内部的
         画布操作函数检测到无画布会自动跳过；「添加航点 / 预览动画」等
         依赖画布的按钮会被禁用
       - 路线数据通过 routeStore 的跨窗口同步机制与主窗口实时保持一致
         （Tauri 事件广播 / 浏览器 BroadcastChannel），落盘文件为 routes.json
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="route-window-page">
    <!-- 顶部提示条：说明独立窗口形态与主窗口的联动方式 -->
    <header class="route-window-header">
      <span class="route-window-title">🛤️ 路线编辑器</span>
      <span class="route-window-hint">独立窗口 · 可拖到任意屏幕 · 数据与主窗口实时同步</span>
    </header>

    <!-- 路线编辑器：无画布（canvasRef=null），仅数据编辑能力；
         active=true 保持与浮动窗口一致的行为 -->
    <div class="route-window-body">
      <RouteEditorDialog :canvas-ref="null" :active="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import RouteEditorDialog from '@/components/RouteEditorDialog.vue'
import { useThemeStore } from '@/stores/theme'

// 独立窗口是全新的页面实例，需要自行初始化主题（应用 data-theme 属性）
useThemeStore()
</script>

<style scoped>
.route-window-page {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--panel-bg);
}

.route-window-header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 14px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  user-select: none;
}

.route-window-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.route-window-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.route-window-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
