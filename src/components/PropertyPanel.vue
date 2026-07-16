<template>
  <div class="property-panel">
    <h3>属性面板</h3>

    <!-- 未选中任何元素 -->
    <div v-if="!element" class="empty">请选择一个元素</div>

    <!-- 已选中元素 -->
    <div v-else>
      <!-- 基本信息 -->
      <div class="field">
        <label>ID</label>
        <span>{{ element.data.id }}</span>
      </div>
      <div class="field">
        <label>类型</label>
        <span>{{ element.type === 'node' ? '节点' : '连线' }}</span>
      </div>

      <!-- ====== 节点特有属性 ====== -->
      <template v-if="element.type === 'node'">
        <div class="field">
          <label>标签</label>
          <input v-model="element.data.label" @input="updateNodeLabel" />
        </div>

        <!-- 自定义数据（卡片节点等） -->
        <template v-if="element.data.data">
          <div class="field">
            <label>标题</label>
            <input v-model="element.data.data.title" @input="updateNodeData" />
          </div>
          <div class="field">
            <label>状态</label>
            <select v-model="element.data.data.status" @change="updateNodeData">
              <option value="正常">正常</option>
              <option value="告警">告警</option>
              <option value="故障">故障</option>
              <option value="停止">停止</option>
            </select>
          </div>
        </template>

        <!-- 位置 -->
        <div class="field">
          <label>X</label>
          <input type="number" v-model.number="element.data.x" @input="updateNodePosition" />
        </div>
        <div class="field">
          <label>Y</label>
          <input type="number" v-model.number="element.data.y" @input="updateNodePosition" />
        </div>

        <!-- ====== 数据绑定配置（仅节点） ====== -->
        <div class="binding-section">
          <div class="section-header" @click="showBinding = !showBinding">
            <span>📡 数据绑定</span>
            <span>{{ showBinding ? '▼' : '▶' }}</span>
          </div>
          <div v-show="showBinding" class="binding-body">
            <!-- 数据源类型 -->
            <div class="field">
              <label>数据源类型</label>
              <select v-model="bindingSourceType" @change="updateBinding">
                <option value="websocket">WebSocket</option>
                <option value="mqtt">MQTT</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </div>
            <!-- 数据源地址（WebSocket/MQTT/HTTP/SSE 需要） -->
            <div class="field">
              <label>数据源地址 <span class="hint">（不填则使用模拟数据）</span></label>
              <input
                  v-model="bindingSourceUrl"
                  @input="updateBinding"
                  placeholder="ws://localhost:8080/ws"
              />
            </div>
            <!-- 点ID（核心字段，填写即启用） -->
            <div class="field">
              <label>点ID <span class="hint">（填写即启用数据绑定）</span></label>
              <input
                  v-model="bindingPointId"
                  @input="updateBinding"
                  placeholder="例如: sensor.temp.001"
              />
            </div>
            <!-- 转换函数（可选） -->
            <div class="field">
              <label>转换函数 (可选)</label>
              <input
                  v-model="bindingTransform"
                  @input="updateBinding"
                  placeholder="(raw) => Math.round(raw)"
              />
            </div>
            <!-- 绑定状态提示 -->
            <div class="binding-status">
              <span v-if="bindingPointId.trim()" class="status-active">✅ 已启用数据绑定</span>
              <span v-else class="status-inactive">⏸ 未启用（请填写点ID）</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ====== 边特有属性 ====== -->
      <template v-if="element.type === 'edge'">
        <div class="field">
          <label>标签</label>
          <input v-model="element.data.label" @input="updateEdgeLabel" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEditorStore } from '@/stores/editor'

// ===================== 依赖注入 =====================
const editorStore = useEditorStore()

const props = defineProps<{
  canvasRef: any
}>()

// ===================== 辅助方法：获取 Graph 实例 =====================
// canvasRef.graph 现在是一个 ref（来自 X6Canvas 的 defineExpose），需要读取 .value
function getGraph(): any {
  const g = props.canvasRef?.graph
  // 如果是 ref，取 .value；否则直接返回（兼容旧写法）
  return g?.value !== undefined ? g.value : g
}

// ===================== 当前选中元素 =====================
const element = computed(() => editorStore.selectedElement)

// ===================== 数据绑定配置的本地状态 =====================
const showBinding = ref(true)
const bindingSourceType = ref('websocket')
const bindingSourceUrl = ref('')
const bindingPointId = ref('')
const bindingTransform = ref('')

let isUpdatingFromWatch = false

// ===================== 监听选中元素变化，加载绑定配置 =====================
watch(
    () => element.value,
    (newElement) => {
      if (newElement && newElement.type === 'node') {
        const data = newElement.data
        let binding = data?.binding || {}

        // 如果 store 中没有 binding 数据，尝试从 X6 节点实例直接读取
        if (!binding.pointId) {
          const graph = getGraph()
          if (graph) {
            const node = graph.getCellById(newElement.data.id)
            if (node && node.isNode()) {
              const nodeData = node.getData()
              if (nodeData?.binding?.pointId) {
                binding = nodeData.binding
              }
            }
          }
        }

        bindingSourceType.value = binding.sourceType || 'websocket'
        bindingSourceUrl.value = binding.sourceUrl || ''
        bindingPointId.value = binding.pointId || ''
        bindingTransform.value = binding.transform ? binding.transform.toString() : ''
      } else {
        bindingPointId.value = ''
      }
    },
    { immediate: true, deep: true }
)

// ===================== 核心方法：更新绑定配置 =====================
function updateBinding() {
  if (!element.value || element.value.type !== 'node') {
    console.warn('[PropertyPanel] 未选中节点，跳过绑定更新')
    return
  }

  if (isUpdatingFromWatch) return

  const nodeId = element.value.data.id
  const pointId = bindingPointId.value.trim()

  let binding: any = null

  if (pointId) {
    binding = {
      pointId,
      sourceType: bindingSourceType.value,
    }
    if (bindingSourceUrl.value.trim()) {
      binding.sourceUrl = bindingSourceUrl.value.trim()
    }
    if (bindingTransform.value.trim()) {
      try {
        binding.transform = new Function('raw', `return (${bindingTransform.value})(raw)`)
      } catch (e) {
        console.warn('[PropertyPanel] 转换函数无效:', e)
      }
    }
  } else {
    binding = undefined
  }



  // 触发画布重新绑定
  try {
    const graph = getGraph()
    if (!graph) {
      console.warn('[PropertyPanel] canvasRef.graph 未就绪')
      return
    }

    const node = graph.getCellById(nodeId)
    if (!node || !node.isNode()) {
      console.warn('[PropertyPanel] 节点实例未找到')
      return
    }

    // 将 binding 同步写入 X6 节点数据
    const currentData = node.getData() || {}
    node.setData({
      ...currentData,
      binding: binding ? { pointId: binding.pointId, sourceType: binding.sourceType, sourceUrl: binding.sourceUrl, } : undefined,
    })

    // 取消旧订阅
    if (props.canvasRef.unbindNodeData) {
      props.canvasRef.unbindNodeData(nodeId)
    }

    // 如果有点ID，则绑定新订阅
    if (pointId && props.canvasRef.bindNodeData) {
      props.canvasRef.bindNodeData(node)
    }
  } catch (error) {
    console.error('[PropertyPanel] 更新数据绑定时发生错误:', error)
  }

  // 最后更新 store（会触发 watcher → loadGraphData，但此时 X6 节点已带有 binding）
  editorStore.updateNode(nodeId, { binding })
}

// ===================== 其他属性更新方法 =====================
function updateNodeLabel() {
  if (!element.value || element.value.type !== 'node') return
  editorStore.updateNode(element.value.data.id, { label: element.value.data.label })
}

function updateNodeData() {
  if (!element.value || element.value.type !== 'node') return
  editorStore.updateNode(element.value.data.id, { data: element.value.data.data })
}

function updateNodePosition() {
  if (!element.value || element.value.type !== 'node') return
  const { x, y } = element.value.data
  editorStore.updateNode(element.value.data.id, { x, y })
}

function updateEdgeLabel() {
  if (!element.value || element.value.type !== 'edge') return
  editorStore.updateEdge(element.value.data.id, { label: element.value.data.label })
}
</script>

<style scoped>
/* ===================== 面板整体样式 ===================== */
.property-panel {
  width: 220px;
  min-width: 180px;
  flex-shrink: 0;
  height: 100%;
  background: #fafafa;
  padding: 16px;
  border-left: 1px solid #e8e8e8;
  box-sizing: border-box;
  overflow-y: auto;
}
.property-panel h3 {
  margin-top: 0;
  font-size: 16px;
  color: #333;
}
.empty {
  color: #999;
  text-align: center;
  margin-top: 40px;
}

/* ===================== 字段样式 ===================== */
.field {
  margin-bottom: 12px;
}
.field label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 2px;
}
.field .hint {
  font-weight: normal;
  color: #999;
  font-size: 11px;
}
.field input,
.field select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
  min-width: 0;
  background: #fff;
}
.field input:focus,
.field select:focus {
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

/* ===================== 数据绑定折叠区 ===================== */
.binding-section {
  margin-top: 12px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px;
  border-top: 1px solid #e8e8e8;
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
}
.section-header:hover {
  background-color: #f0f0f0;
}
.binding-body {
  padding-left: 12px;
  border-left: 3px solid #1890ff;
  margin: 4px 0 8px;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.binding-status {
  margin-top: 8px;
  font-size: 13px;
}
.status-active {
  color: #52c41a;
}
.status-inactive {
  color: #999;
}

/* ===================== 响应式适配 ===================== */
@media (max-width: 768px) {
  .property-panel {
    width: 180px;
    padding: 12px;
  }
  .field label {
    font-size: 11px;
  }
  .field input,
  .field select {
    font-size: 12px;
    padding: 3px 6px;
  }
}
@media (max-width: 480px) {
  .property-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 200px;
    height: 100%;
    z-index: 100;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    border-left: none;
    border-radius: 0;
  }
  .property-panel:hover {
    transform: translateX(0);
  }
}
</style>
