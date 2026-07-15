<template>
  <div class="property-panel">
    <h3>属性面板</h3>
    <div v-if="element">
      <div class="field">
        <label>ID</label>
        <span>{{ element.data.id }}</span>
      </div>
      <div class="field">
        <label>类型</label>
        <span>{{ element.type === 'node' ? '节点' : '连线' }}</span>
      </div>
      <!-- 如果是节点，显示更多属性 -->
      <template v-if="element.type === 'node'">
        <div class="field">
          <label>标签</label>
          <input v-model="element.data.label" @input="updateNodeLabel" />
        </div>
        <!-- 如果有 data 字段（自定义节点） -->
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
        <!-- 位置信息 -->
        <div class="field">
          <label>X</label>
          <input type="number" v-model.number="element.data.x" @input="updateNodePosition" />
        </div>
        <div class="field">
          <label>Y</label>
          <input type="number" v-model.number="element.data.y" @input="updateNodePosition" />
        </div>
      </template>
      <!-- 如果是边 -->
      <template v-if="element.type === 'edge'">
        <div class="field">
          <label>标签</label>
          <input v-model="element.data.label" @input="updateEdgeLabel" />
        </div>
      </template>

      <!-- 数据绑定配置（仅节点） -->
      <div v-if="element.type === 'node'" class="binding-section">
        <div class="section-header" @click="showBinding = !showBinding">
          <span>📡 数据绑定</span>
          <span>{{ showBinding ? '▼' : '▶' }}</span>
        </div>
        <div v-show="showBinding" class="binding-body">
          <div class="field">
            <label>启用</label>
            <input type="checkbox" v-model="bindingEnabled" @change="updateBinding" />
          </div>
          <div v-if="bindingEnabled" class="field">
            <label>数据源类型</label>
            <select v-model="bindingSourceType" @change="updateBinding">
              <option value="websocket">WebSocket</option>
              <option value="mqtt">MQTT</option>
              <option value="http">HTTP</option>
              <option value="sse">SSE</option>
            </select>
          </div>
          <div v-if="bindingEnabled" class="field">
            <label>点ID</label>
            <input v-model="bindingPointId" @input="updateBinding" placeholder="例如: sensor.temp.001" />
          </div>
          <div v-if="bindingEnabled" class="field">
            <label>转换函数 (可选)</label>
            <input v-model="bindingTransform" @input="updateBinding" placeholder="(raw) => Math.round(raw)" />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty">请选择一个元素</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useEditorStore } from '@/stores/editor'

const editorStore = useEditorStore()

// 当前选中的元素（从 store 计算）
const element = computed(() => editorStore.selectedElement)

// 引用 X6Canvas 组件（通过父组件传递或 inject）
const props = defineProps<{
  canvasRef: any  // 传入 X6Canvas 实例
}>()
// 绑定配置的本地状态
const showBinding = ref(true)
const bindingEnabled = ref(false)
const bindingSourceType = ref('websocket')
const bindingPointId = ref('')
const bindingTransform = ref('')

// 监听选中的元素变化，加载其 binding 配置
watch(
    () => element.value,
    (newElement) => {
      if (newElement && newElement.type === 'node') {
        const data = newElement.data
        const binding = data?.binding || {}
        bindingEnabled.value = !!binding.pointId
        bindingSourceType.value = binding.sourceType || 'websocket'
        bindingPointId.value = binding.pointId || ''
        bindingTransform.value = binding.transform ? binding.transform.toString() : ''
      } else {
        bindingEnabled.value = false
      }
    },
    { immediate: true, deep: true }
)

/**
 * 更新节点的 binding 配置，并触发重新绑定
 */
function updateBinding() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id

  // 构建 binding 对象
  const binding: any = {}
  if (bindingEnabled.value && bindingPointId.value.trim()) {
    binding.pointId = bindingPointId.value.trim()
    binding.sourceType = bindingSourceType.value
    if (bindingTransform.value.trim()) {
      // 安全地创建转换函数（注意：eval 有风险，生产环境建议使用 Function 或预定义转换）
      try {
        binding.transform = new Function('raw', `return (${bindingTransform.value})(raw)`)
      } catch (e) {
        console.warn('转换函数无效:', e)
      }
    }
  }

  // 更新 store 中的节点数据
  editorStore.updateNode(nodeId, { binding })

  // 触发画布重新绑定（通过 X6Canvas 暴露的方法）
  if (props.canvasRef && props.canvasRef.bindNodeData) {
    // 需要获取节点实例，这里通过 graph 获取
    const graph = props.canvasRef.graph
    if (graph) {
      const node = graph.getCellById(nodeId)
      if (node && node.isNode()) {
        // 先取消旧订阅（如果有）
        if (props.canvasRef.unbindNodeData) {
          props.canvasRef.unbindNodeData(nodeId)
        }
        // 如果启用且有点ID，则绑定
        if (bindingEnabled.value && bindingPointId.value.trim()) {
          props.canvasRef.bindNodeData(node)
        }
      }
    }
  }
}

// 更新节点标签
function updateNodeLabel() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const newLabel = element.value.data.label
  // 更新 store（会自动触发画布更新）
  editorStore.updateNode(nodeId, { label: newLabel })
  // 更新画布（需要同步到 X6）
  // 但我们在 store 中更新后，watch 会自动重新加载整个画布，这样会丢失选中状态，所以更好的办法是直接更新 X6 节点。
  // 但为了简单，我们在 store 中更新后，手动触发画布更新？这里我们采用直接操作 X6 的方法：
  // 由于我们无法直接获取 graph 实例，可以使用事件或通过父组件传递，但为了简化，我们使用 store 的 graphData 更新触发重新加载（会有闪烁）。
  // 更好的做法：在 X6Canvas 中暴露一个更新节点的方法。
  // 我们暂时采用重新加载的方式，但为了不丢失选中，可以在 watch 中保留选中。
  // 或者我们可以在 updateNode 中直接修改 store.graphData，watch 会触发重新渲染。
}

// 更新节点自定义数据
function updateNodeData() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const newData = element.value.data.data
  editorStore.updateNode(nodeId, { data: newData })
}

// 更新节点位置
function updateNodePosition() {
  if (!element.value || element.value.type !== 'node') return
  const nodeId = element.value.data.id
  const { x, y } = element.value.data
  editorStore.updateNode(nodeId, { x, y })
}

// 更新边标签
function updateEdgeLabel() {
  if (!element.value || element.value.type !== 'edge') return
  const edgeId = element.value.data.id
  const newLabel = element.value.data.label
  editorStore.updateEdge(edgeId, { label: newLabel })
}
</script>

<style scoped>
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
}
.field {
  margin-bottom: 12px;
}
.field label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 2px;
}
.field input, .field select {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
  min-width: 0;
}
.empty {
  color: #999;
  text-align: center;
  margin-top: 40px;
}

@media (max-width: 768px) {
  .property-panel {
    width: 180px;
    padding: 12px;
  }
  .field label {
    font-size: 11px;
  }
  .field input, .field select {
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
    z-index: 100;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    transform: translateX(100%);
    transition: transform 0.3s;
  }
  .property-panel:hover {
    transform: translateX(0);
  }
}
</style>