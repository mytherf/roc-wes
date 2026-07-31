<template>
  <Teleport to="body">
    <div class="ds-mask" @click.self="handleClose">
      <div class="ds-dialog">
        <div class="ds-header">
          <span class="ds-title">数据源管理</span>
          <button class="ds-close" @click="handleClose" title="关闭">✕</button>
        </div>

        <!-- 列表视图 -->
        <div v-if="mode === 'list'" class="ds-body">
          <div class="ds-list-toolbar">
            <span class="ds-count">共 {{ dataSourceStore.dataSources.length }} 个数据源</span>
            <div class="ds-toolbar-actions">
              <button class="ds-btn" @click="createBuiltinSources" title="创建 WebSocket/HTTP/SSE/MQTT/S7/OPC UA/Modbus 内置模拟数据源">⚡ 一键创建内置模拟源</button>
              <button class="ds-btn primary" @click="openAdd">＋ 新增数据源</button>
            </div>
          </div>

          <div v-if="dataSourceStore.dataSources.length === 0" class="ds-empty">
            暂无数据源，点击「新增数据源」创建
          </div>

          <div v-else class="ds-list">
            <div
              v-for="ds in dataSourceStore.dataSources"
              :key="ds.id"
              class="ds-item"
            >
              <div class="ds-item-main">
                <div class="ds-item-name">
                  {{ ds.name }}
                  <span class="ds-type-tag">{{ typeLabel(ds.type) }}</span>
                </div>
                <div class="ds-item-url" :title="ds.url">{{ ds.url }}</div>
                <div v-if="ds.description" class="ds-item-desc">{{ ds.description }}</div>
              </div>
              <div class="ds-item-actions">
                <button class="ds-btn small" @click="openEdit(ds)">编辑</button>
                <button class="ds-btn small danger" @click="handleDelete(ds)">删除</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 新增 / 编辑表单 -->
        <div v-else class="ds-body">
          <div class="ds-form">
            <div class="ds-field">
              <label class="ds-label">名称 <span class="required">*</span></label>
              <input
                v-model="form.name"
                class="ds-input"
                placeholder="如：车间 PLC 数据服务"
              />
            </div>
            <div class="ds-field">
              <label class="ds-label">类型</label>
              <select v-model="form.type" class="ds-input">
                <option value="websocket">WebSocket</option>
                <option value="mqtt">MQTT</option>
                <option value="http">HTTP 轮询</option>
                <option value="sse">SSE</option>
                <option value="s7">西门子 S7</option>
                <option value="opc">OPC UA</option>
                <option value="modbus">Modbus</option>
              </select>
              <div class="ds-builtin-hint">
                <span>内置模拟地址：{{ builtinUrl }}</span>
                <button type="button" class="ds-link-btn" @click="form.url = builtinUrl">填入</button>
              </div>
            </div>

            <!-- 工业协议设备参数（S7 / OPC UA / Modbus），抽取为子组件 -->
            <DataSourceDeviceConfig v-if="isIndustrial" :form="form" />

            <!-- HTTP 轮询间隔 -->
            <div v-if="form.type === 'http'" class="ds-field-row">
              <div class="ds-field">
                <label class="ds-label">轮询间隔(ms)</label>
                <input v-model.number="form.interval" type="number" class="ds-input num" />
              </div>
              <div class="ds-field"></div>
            </div>

            <div class="ds-field">
              <label class="ds-label">地址 <span class="required">*</span></label>
              <input
                v-model="form.url"
                class="ds-input"
                placeholder="如：ws://localhost:8080/ws"
              />
            </div>
            <div class="ds-field">
              <label class="ds-label">备注</label>
              <input
                v-model="form.description"
                class="ds-input"
                placeholder="可选，描述该数据源的用途"
              />
            </div>
            <div v-if="formError" class="ds-error">{{ formError }}</div>
          </div>
        </div>

        <div class="ds-footer">
          <template v-if="mode === 'list'">
            <button class="ds-btn" @click="handleClose">关闭</button>
          </template>
          <template v-else>
            <button class="ds-btn" @click="mode = 'list'">取消</button>
            <button class="ds-btn primary" @click="handleSave">保存</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import DataSourceDeviceConfig from './DataSourceDeviceConfig.vue'
import {
  useDataSourceStore,
  DATA_SOURCE_TYPE_LABELS,
  BUILTIN_MOCK_URLS,
  REAL_GATEWAY_URLS,
  type DataSource,
  type DataSourceType,
} from '@/stores/dataSource'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const dataSourceStore = useDataSourceStore()

/** 视图模式：list=列表 add=新增 edit=编辑 */
const mode = ref<'list' | 'add' | 'edit'>('list')
/** 编辑中的数据源 ID（edit 模式下有效） */
const editingId = ref<string | null>(null)
/** 表单数据 */
const form = reactive({
  name: '',
  type: 'websocket' as DataSourceType,
  url: '',
  description: '',
  // 工业协议设备参数（S7 / OPC UA / Modbus，仅对应类型时生效）
  demo: true,
  host: '127.0.0.1',
  port: 502,
  unitId: 1, // Modbus 从站地址
  rack: 0, // S7 机架号
  slot: 2, // S7 槽号
  endpoint: '', // OPC UA 端点 URL
  pollInterval: 1000,
  interval: 2000, // HTTP 轮询间隔（ms）
})
const formError = ref('')

function typeLabel(type: DataSourceType): string {
  return DATA_SOURCE_TYPE_LABELS[type] ?? type
}

/** 当前类型对应的内置模拟服务地址 */
const builtinUrl = computed(() => BUILTIN_MOCK_URLS[form.type])

/** 是否为需配置设备参数的工业协议类型 */
function isIndustrialType(t: DataSourceType): boolean {
  return t === 'modbus' || t === 's7' || t === 'opc'
}

/** 当前类型是否为工业协议（需配置设备参数） */
const isIndustrial = computed(() => isIndustrialType(form.type))

/** 各工业协议的默认设备端口 */
function defaultPortFor(t: DataSourceType): number {
  if (t === 's7') return 102
  if (t === 'opc') return 4840
  return 502 // modbus
}

/** 根据演示/真实模式推导当前类型的网关地址 */
function gatewayUrl(): string {
  return form.demo ? BUILTIN_MOCK_URLS[form.type] : (REAL_GATEWAY_URLS[form.type] as string)
}

// 切换类型：工业协议自动填充网关地址并重置默认端口
watch(
  () => form.type,
  (t) => {
    if (isIndustrialType(t)) {
      form.port = defaultPortFor(t)
      form.url = gatewayUrl()
    }
  }
)
// 切换演示/真实模式：工业协议重新填充网关地址
watch(
  () => form.demo,
  () => {
    if (isIndustrialType(form.type)) form.url = gatewayUrl()
  }
)

/** 各工业协议内置模拟源的默认（演示模式）设备配置 */
function defaultConfigFor(type: DataSourceType): Record<string, any> | undefined {
  switch (type) {
    case 'modbus':
      return { demo: true, host: '127.0.0.1', port: 502, unitId: 1, pollInterval: 1000 }
    case 's7':
      return { demo: true, host: '127.0.0.1', port: 102, rack: 0, slot: 2, pollInterval: 1000 }
    case 'opc':
      return { demo: true, endpoint: 'opc.tcp://127.0.0.1:4840', pollInterval: 1000 }
    case 'http':
      return { interval: 2000 }
    default:
      return undefined
  }
}

/** 一键创建各类型内置模拟数据源（已存在相同地址的跳过） */
function createBuiltinSources() {
  const types: DataSourceType[] = ['websocket', 'http', 'sse', 'mqtt', 's7', 'opc', 'modbus']
  let created = 0
  for (const type of types) {
    const url = BUILTIN_MOCK_URLS[type]
    const exists = dataSourceStore.dataSources.some((d) => d.url === url)
    if (exists) continue
    dataSourceStore.addDataSource({
      name: `内置${DATA_SOURCE_TYPE_LABELS[type]}模拟源`,
      type,
      url,
      description: '系统内置模拟数据服务（开发环境自动启动）',
      config: defaultConfigFor(type),
    })
    created++
  }
  if (created === 0) {
    alert('内置模拟数据源已存在，无需重复创建')
  }
}

function resetForm() {
  form.name = ''
  form.type = 'websocket'
  form.url = ''
  form.description = ''
  form.demo = true
  form.host = '127.0.0.1'
  form.port = 502
  form.unitId = 1
  form.rack = 0
  form.slot = 2
  form.endpoint = ''
  form.pollInterval = 1000
  form.interval = 2000
  formError.value = ''
}

function openAdd() {
  resetForm()
  editingId.value = null
  mode.value = 'add'
}

function openEdit(ds: DataSource) {
  form.name = ds.name
  form.type = ds.type
  form.url = ds.url
  form.description = ds.description ?? ''
  const c = ds.config || {}
  form.demo = c.demo !== false
  form.host = c.host ?? '127.0.0.1'
  form.port = c.port ?? defaultPortFor(ds.type)
  form.unitId = c.unitId ?? 1
  form.rack = c.rack ?? 0
  form.slot = c.slot ?? 2
  form.endpoint = c.endpoint ?? ''
  form.pollInterval = c.pollInterval ?? 1000
  form.interval = c.interval ?? 2000
  formError.value = ''
  editingId.value = ds.id
  mode.value = 'edit'
}

function handleSave() {
  const name = form.name.trim()
  const url = form.url.trim()
  if (!name) {
    formError.value = '请填写数据源名称'
    return
  }
  if (!url) {
    formError.value = '请填写数据源地址'
    return
  }

  // 工业协议设备参数与校验
  let config: Record<string, any> | undefined
  if (form.type === 'modbus') {
    if (!form.demo && !form.host.trim()) {
      formError.value = '真实设备模式下请填写设备主机地址'
      return
    }
    config = {
      demo: form.demo,
      host: form.host.trim(),
      port: Number(form.port) || 502,
      unitId: Number(form.unitId) || 1,
      pollInterval: Number(form.pollInterval) || 1000,
    }
  } else if (form.type === 's7') {
    if (!form.demo && !form.host.trim()) {
      formError.value = '真实设备模式下请填写 PLC 主机地址'
      return
    }
    config = {
      demo: form.demo,
      host: form.host.trim(),
      port: Number(form.port) || 102,
      rack: Number(form.rack) || 0,
      slot: Number(form.slot) || 2,
      pollInterval: Number(form.pollInterval) || 1000,
    }
  } else if (form.type === 'opc') {
    if (!form.demo && !form.endpoint.trim()) {
      formError.value = '真实设备模式下请填写 OPC UA 端点 URL'
      return
    }
    config = {
      demo: form.demo,
      endpoint: form.endpoint.trim(),
      pollInterval: Number(form.pollInterval) || 1000,
    }
  } else if (form.type === 'http') {
    config = {
      interval: Number(form.interval) || 2000,
    }
  }

  if (mode.value === 'edit' && editingId.value) {
    dataSourceStore.updateDataSource(editingId.value, {
      name,
      type: form.type,
      url,
      description: form.description.trim() || undefined,
      config,
    })
  } else {
    dataSourceStore.addDataSource({
      name,
      type: form.type,
      url,
      description: form.description.trim() || undefined,
      config,
    })
  }
  mode.value = 'list'
}

function handleDelete(ds: DataSource) {
  if (confirm(`确定删除数据源「${ds.name}」吗？\n已引用该数据源的节点绑定将回退为模拟数据。`)) {
    dataSourceStore.deleteDataSource(ds.id)
  }
}

function handleClose() {
  mode.value = 'list'
  emit('close')
}
</script>

<style scoped>
.ds-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.ds-dialog {
  width: 520px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.ds-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e8e8e8;
}
.ds-title {
  font-size: 15px;
  font-weight: 600;
}
.ds-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: #999;
  padding: 2px 6px;
  border-radius: 4px;
}
.ds-close:hover {
  color: #333;
  background: #f0f0f0;
}
.ds-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.ds-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ds-count {
  font-size: 13px;
  color: #666;
}
.ds-toolbar-actions {
  display: flex;
  gap: 8px;
}
/* 内置模拟地址提示行 */
.ds-builtin-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
.ds-builtin-hint span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds-link-btn {
  border: none;
  background: none;
  color: #1890ff;
  font-size: 12px;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
}
.ds-link-btn:hover {
  text-decoration: underline;
}
.ds-empty {
  padding: 32px 0;
  text-align: center;
  color: #999;
  font-size: 13px;
}
.ds-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ds-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  transition: border-color 0.2s;
}
.ds-item:hover {
  border-color: #1890ff;
}
.ds-item-main {
  flex: 1;
  min-width: 0;
}
.ds-item-name {
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ds-type-tag {
  font-size: 11px;
  font-weight: 400;
  color: #1890ff;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 3px;
  padding: 0 5px;
  line-height: 16px;
}
.ds-item-url {
  margin-top: 3px;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ds-item-desc {
  margin-top: 2px;
  font-size: 12px;
  color: #999;
}
.ds-item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.ds-btn {
  padding: 4px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.ds-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}
.ds-btn.primary {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;
}
.ds-btn.primary:hover {
  background: #40a9ff;
  border-color: #40a9ff;
  color: #fff;
}
.ds-btn.small {
  padding: 2px 10px;
  font-size: 12px;
}
.ds-btn.danger:hover {
  border-color: #ff4d4f;
  color: #ff4d4f;
}
.ds-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ds-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ds-label {
  font-size: 13px;
  color: #333;
}
.ds-label .required {
  color: #ff4d4f;
}
.ds-input {
  padding: 6px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.ds-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}
.ds-error {
  color: #ff4d4f;
  font-size: 13px;
}
.ds-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e8e8e8;
}
/* 工业协议设备参数区块（S7 / OPC UA / Modbus） */
.ds-proto-cfg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
}
.ds-radio-row {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}
.ds-radio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}
.ds-cfg-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  line-height: 1.5;
}
.ds-field-row {
  display: flex;
  gap: 12px;
}
.ds-field-row .ds-field {
  flex: 1;
}
.ds-field.grow {
  flex: 2;
}
.ds-input.num {
  width: 100%;
}
</style>
