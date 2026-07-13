<template>
  <div class="http-request-node">
    <div class="node-header">
      <span class="node-icon">🌐</span>
      <span class="node-title">{{ label }}</span>
    </div>
    <div class="node-body">
      <div class="config-row">
        <select :value="method" @change="updateMethod($event)" class="config-select">
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
            type="text"
            :value="url"
            @input="updateUrl($event)"
            class="config-input-url"
            placeholder="https://api.example.com/endpoint"
        />
      </div>
      <div class="config-row" v-if="method === 'POST' || method === 'PUT'">
        <span class="config-label">Body：</span>
        <textarea
            :value="body"
            @input="updateBody($event)"
            class="config-textarea"
            rows="2"
            placeholder='{"key": "value"}'
        ></textarea>
      </div>
      <div class="config-row">
        <span class="config-label">超时：</span>
        <input
            type="number"
            :value="timeout"
            @input="updateTimeout($event)"
            class="config-input"
            min="1"
            step="1"
        />
        <span class="config-label">秒</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * HTTP 请求节点
 * 工作流执行到该节点时，发起 HTTP 请求，并根据响应继续执行
 */
const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const label = ref(data.value.label || 'HTTP 请求')
const method = ref(data.value.method || 'GET')
const url = ref(data.value.url || '')
const body = ref(data.value.body || '')
const timeout = ref(data.value.timeout ?? 30)

function updateMethod(event: Event) {
  const target = event.target as HTMLSelectElement
  method.value = target.value
  saveToNode()
}

function updateUrl(event: Event) {
  const target = event.target as HTMLInputElement
  url.value = target.value
  saveToNode()
}

function updateBody(event: Event) {
  const target = event.target as HTMLTextAreaElement
  body.value = target.value
  saveToNode()
}

function updateTimeout(event: Event) {
  const target = event.target as HTMLInputElement
  timeout.value = parseFloat(target.value) || 30
  saveToNode()
}

function saveToNode() {
  if (props.node) {
    const currentData = props.node.getData() || {}
    props.node.setData({
      ...currentData,
      label: label.value,
      method: method.value,
      url: url.value,
      body: body.value,
      timeout: timeout.value,
    })
  }
}

// 监听节点数据变化
props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current.getData()
  if (newData) {
    label.value = newData.label || 'HTTP 请求'
    method.value = newData.method || 'GET'
    url.value = newData.url || ''
    body.value = newData.body || ''
    timeout.value = newData.timeout ?? 30
  }
})

defineExpose({
  getConfig: () => ({ method: method.value, url: url.value, body: body.value, timeout: timeout.value }),
})
</script>

<style scoped>
.http-request-node {
  min-width: 280px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #722ed1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.node-icon {
  font-size: 18px;
}
.node-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.node-body {
  font-size: 12px;
}
.config-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.config-label {
  color: #666;
  min-width: 40px;
}
.config-select {
  padding: 2px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
.config-input-url {
  flex: 1;
  min-width: 120px;
  padding: 2px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
.config-input {
  width: 50px;
  padding: 2px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
}
.config-textarea {
  flex: 1;
  min-width: 120px;
  padding: 2px 6px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
}
</style>