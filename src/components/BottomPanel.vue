<template>
  <div class="bottom-panel" :class="{ collapsed: editorStore.bottomCollapsed }">
    <!-- 头部：标题 + 折叠开关 -->
    <div class="bottom-panel-header">
      <span class="bp-title">🛤️ 路线</span>
      <div class="bp-spacer" />
      <button
        class="bp-collapse-btn"
        :title="editorStore.bottomCollapsed ? '展开面板' : '折叠面板'"
        @click="editorStore.toggleBottomCollapsed()"
      >{{ editorStore.bottomCollapsed ? '▲' : '▼' }}</button>
    </div>

    <!-- 内容区：路线编辑器常驻挂载，折叠时隐藏（保留编辑状态） -->
    <div class="bottom-panel-content" v-show="!editorStore.bottomCollapsed">
      <RouteEditorDialog :canvas-ref="canvasRef" :active="routeActive" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import RouteEditorDialog from '@/components/RouteEditorDialog.vue'
import { useEditorStore } from '@/stores/editor'

defineProps<{
  canvasRef: any
}>()

const editorStore = useEditorStore()

// 路线编辑器仅在面板展开时才接管画布交互（如空白右键添加航点）
const routeActive = computed(() => !editorStore.bottomCollapsed)
</script>

<style scoped>
.bottom-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border-top: 1px solid var(--border-color);
  transition: background-color 0.25s ease, border-color 0.25s ease;
}

/* ===== 头部条 ===== */
.bottom-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
}
.bottom-panel.collapsed .bottom-panel-header {
  border-bottom: none;
}

.bp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.bp-spacer { flex: 1; }

.bp-collapse-btn {
  border: none;
  background: none;
  width: 28px;
  height: 24px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bp-collapse-btn:hover { background: var(--statusbar-bg); color: var(--text-primary); }

/* ===== 内容区 ===== */
.bottom-panel-content {
  height: 260px;
  display: flex;
  overflow: hidden;
}
.bottom-panel-content > * {
  flex: 1 1 0%;
  min-width: 0;
  height: 100%;
}
</style>
