<!-- ========== 根组件 ==========
     整个应用的顶层组件，只做一件事：把当前路由对应的页面渲染出来。
     路由配置见 src/router/index.ts：
     - 路径 /     → 主布局 MainLayout（编辑器界面）
     - 路径 /run  → 运行视图 RunView（模拟运行界面） -->
<template>
  <!-- router-view：路由出口，Vue Router 会根据当前 URL 自动换成对应的页面组件 -->
  <router-view />
</template>

<script setup lang="ts">
// script setup：Vue 3 的组合式 API 写法，此组件无需任何逻辑
// 仅作为路由出口
</script>

<style>
/* 全局样式在 main.ts 或 index.html 中引入 */
</style>