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
              <button class="ds-btn" @click="toggleMonitorAll" :title="anyMonitoring ? '停止对所有数据源的监控' : '监控所有数据源的连通性、设备状态与实时数据'">
                {{ anyMonitoring ? '⏹ 停止全部监控' : '🖥 监控全部' }}
              </button>
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
              class="ds-row"
            >
              <div class="ds-item" @click="toggleExpand(ds)">
                <span
                  class="ds-status-dot"
                  :class="`st-${monitor.getState(ds.id).status}`"
                  :title="`监控状态：${statusLabel(monitor.getState(ds.id))}`"
                ></span>
                <div class="ds-item-main">
                  <div class="ds-item-name">
                    {{ ds.name }}
                    <span class="ds-type-tag">{{ typeLabel(ds.type) }}</span>
                  </div>
                  <div class="ds-item-url" :title="ds.url">{{ ds.url }}</div>
                  <div v-if="ds.description" class="ds-item-desc">{{ ds.description }}</div>
                </div>
                <div class="ds-item-actions" @click.stop>
                  <button
                    class="ds-btn small"
                    :class="{ active: monitor.isMonitoring(ds.id) }"
                    :title="monitor.isMonitoring(ds.id) ? '停止监控该数据源' : '监控该数据源'"
                    @click="toggleMonitor(ds)"
                  >{{ monitor.isMonitoring(ds.id) ? '停止' : '监控' }}</button>
                  <button class="ds-btn small" @click="openEdit(ds)">编辑</button>
                  <button class="ds-btn small danger" @click="handleDelete(ds)">删除</button>
                </div>
              </div>

              <!-- 展开的监控详情面板 -->
              <div v-if="expandedId === ds.id" class="ds-monitor-detail" @click.stop>
                <div class="ds-mon-grid">
                  <div class="ds-mon-cell">
                    <span class="ds-mon-k">连接状态</span>
                    <span class="ds-mon-v" :class="`st-text-${monitor.getState(ds.id).status}`">{{ statusLabel(monitor.getState(ds.id)) }}</span>
                  </div>
                  <div class="ds-mon-cell">
                    <span class="ds-mon-k">建连耗时</span>
                    <span class="ds-mon-v">{{ monitor.getState(ds.id).latencyMs != null ? monitor.getState(ds.id).latencyMs + ' ms' : '—' }}</span>
                  </div>
                  <div v-if="isIndustrialType(ds.type)" class="ds-mon-cell">
                    <span class="ds-mon-k">设备状态</span>
                    <span class="ds-mon-v" :class="monitor.getState(ds.id).deviceConnected === false ? 'st-text-offline' : monitor.getState(ds.id).deviceConnected ? 'st-text-online' : ''">
                      {{ deviceLabel(monitor.getState(ds.id)) }}
                    </span>
                  </div>
                  <div class="ds-mon-cell grow">
                    <span class="ds-mon-k">监控点位</span>
                    <span class="ds-mon-v">{{ Object.keys(monitor.getState(ds.id).points).length || monitor.resolvePoints(ds).length }} 个</span>
                  </div>
                </div>
                <div v-if="monitor.getState(ds.id).deviceMessage" class="ds-mon-devmsg">
                  {{ monitor.getState(ds.id).deviceMessage }}
                </div>
                <div v-if="ds.url === BUILTIN_MOCK_URLS[ds.type]" class="ds-mon-demo-note">
                  演示模式：下列为内置模拟服务推送的样例点位与实时模拟数据
                </div>

                <!-- 数据点实时值 -->
                <div class="ds-mon-title">数据点实时值</div>
                <div v-if="Object.keys(monitor.getState(ds.id).points).length === 0" class="ds-mon-empty">
                  {{ ds.url === BUILTIN_MOCK_URLS[ds.type] ? '等待模拟服务推送…' : '暂无数据（未绑定节点点位或服务未推送）' }}
                </div>
                <table v-else class="ds-mon-table">
                  <thead>
                    <tr><th>点位 ID</th><th>当前值</th><th>质量</th><th>更新时间</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, pid) in monitor.getState(ds.id).points" :key="pid">
                      <td class="mono">{{ pid }}</td>
                      <td>{{ r.value }}</td>
                      <td><span class="ds-q" :class="`q-${r.quality}`">{{ r.quality }}</span></td>
                      <td>{{ fmtTime(r.timestamp) }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- 错误与告警 -->
                <div class="ds-mon-title">错误与告警（{{ monitor.getState(ds.id).errors.length }}）</div>
                <div v-if="monitor.getState(ds.id).errors.length === 0" class="ds-mon-empty">暂无异常</div>
                <ul v-else class="ds-mon-errors">
                  <li v-for="(e, i) in monitor.getState(ds.id).errors" :key="i">{{ e }}</li>
                </ul>
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
            </div>

            <!-- 连接模式（全类型统一：演示模式 / 真实设备） -->
            <div class="ds-field">
              <label class="ds-label">连接模式</label>
              <div class="ds-radio-row">
                <label class="ds-radio">
                  <input type="radio" v-model="form.demo" :value="true" /> 演示模式（内置模拟服务）
                </label>
                <label class="ds-radio">
                  <input type="radio" v-model="form.demo" :value="false" /> 真实设备
                </label>
              </div>
              <div class="ds-cfg-hint">{{ modeHint }}</div>
            </div>

            <!-- 工业协议设备参数（S7 / OPC UA / Modbus 的真实设备模式），抽取为子组件 -->
            <DataSourceDeviceConfig v-if="isIndustrial && !form.demo" :form="form" />

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
                :readonly="urlReadonly"
                :placeholder="urlPlaceholder"
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
import { ref, reactive, computed, watch, nextTick } from 'vue'
import DataSourceDeviceConfig from './DataSourceDeviceConfig.vue'
import { useGatewayMonitor } from '@/composables/useGatewayMonitor'
import type { MonitorState } from '@/services/GatewayMonitorService'
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

// ===================== 网关 / 服务监控 =====================
const monitor = useGatewayMonitor()
/** 当前展开监控详情的数据源 ID（单展开） */
const expandedId = ref<string | null>(null)

/** 是否有任意数据源正在监控（驱动工具栏按钮文案） */
const anyMonitoring = computed(() =>
  dataSourceStore.dataSources.some((ds) => monitor.isMonitoring(ds.id))
)

/** 工具栏：监控全部 / 停止全部 */
function toggleMonitorAll() {
  if (anyMonitoring.value) monitor.stopAll()
  else monitor.startAll(dataSourceStore.dataSources)
}

/** 单个数据源：监控 / 停止 */
function toggleMonitor(ds: DataSource) {
  if (monitor.isMonitoring(ds.id)) monitor.stop(ds.id)
  else monitor.start(ds)
}

/** 展开 / 收起监控详情；展开时若未监控则自动启动 */
function toggleExpand(ds: DataSource) {
  if (expandedId.value === ds.id) {
    expandedId.value = null
    return
  }
  expandedId.value = ds.id
  if (!monitor.isMonitoring(ds.id)) monitor.start(ds)
}

/** 连接状态文案 */
function statusLabel(st: MonitorState): string {
  switch (st.status) {
    case 'online':
      return '在线'
    case 'offline':
      return '离线'
    case 'connecting':
      return '连接中…'
    default:
      return '未监控'
  }
}

/** 设备连接状态文案（工业网关） */
function deviceLabel(st: MonitorState): string {
  if (st.deviceConnected === true) return '已连接'
  if (st.deviceConnected === false) return '未连接'
  return st.status === 'online' ? '等待回报…' : '—'
}

/** 时间戳格式化为本地时间串 */
function fmtTime(ts: number): string {
  return ts ? new Date(ts).toLocaleTimeString() : '—'
}

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

/** 连接模式提示文案（随类型与模式变化） */
const modeHint = computed(() => {
  if (form.demo) {
    return `演示模式：使用内置模拟服务（开发环境自动启动），地址自动填充为 ${BUILTIN_MOCK_URLS[form.type]}，无需真实设备`
  }
  switch (form.type) {
    case 'modbus':
      return '真实设备：需先启动独立网关（npm run gateway），并在下方填写设备参数；可用 npm run simulator 起仿真从站验证'
    case 's7':
      return '真实设备：需先启动独立网关（npm run s7-gateway），并在下方填写 PLC 参数；可用 npm run s7-simulator 起仿真 PLC 验证'
    case 'opc':
      return '真实设备：需先启动独立网关（npm run opc-gateway），并在下方填写端点参数；可用 npm run opc-simulator 起仿真服务端验证'
    default:
      return '真实设备：请在下方填写真实服务地址'
  }
})

/** 地址输入框是否只读：演示模式（内置地址）或工业协议（固定网关地址）下自动填充、不可手改 */
const urlReadonly = computed(() => form.demo || isIndustrial.value)

/** 真实设备模式下非工业协议的地址占位符示例 */
const urlPlaceholder = computed(() => {
  switch (form.type) {
    case 'websocket':
      return '如：ws://192.168.0.10:9000/ws'
    case 'mqtt':
      return '如：ws://192.168.0.10:8083'
    case 'http':
      return '如：http://192.168.0.10:8081/api/data'
    case 'sse':
      return '如：http://192.168.0.10:8082/sse'
    default:
      return ''
  }
})

/**
 * 按「连接模式 + 类型」推导地址：
 * - 演示模式：内置模拟服务地址；
 * - 工业协议真实设备：固定独立网关地址（设备地址在下方设备参数中配置）；
 * - 非工业协议真实设备：由用户手动填写（若当前仍是内置地址则清空待填）。
 */
function syncUrl() {
  if (form.demo) {
    form.url = BUILTIN_MOCK_URLS[form.type]
  } else if (isIndustrialType(form.type)) {
    form.url = REAL_GATEWAY_URLS[form.type] as string
  } else if (form.url === BUILTIN_MOCK_URLS[form.type]) {
    form.url = ''
  }
}

/** 编辑回填期间抑制 watcher 对地址的联动覆盖 */
let suppressUrlSync = false

// 切换类型：工业协议重置默认端口，并按模式同步地址
watch(
  () => form.type,
  (t) => {
    if (isIndustrialType(t)) form.port = defaultPortFor(t)
    if (!suppressUrlSync) syncUrl()
  }
)
// 切换演示/真实模式：按类型同步地址
watch(
  () => form.demo,
  () => {
    if (!suppressUrlSync) syncUrl()
  }
)

function resetForm() {
  form.name = ''
  form.type = 'websocket'
  form.url = BUILTIN_MOCK_URLS.websocket // 默认演示模式，预填内置地址
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
  // 抑制 watcher 联动，避免回填 type/demo 时覆盖已保存的自定义地址
  suppressUrlSync = true
  form.name = ds.name
  form.type = ds.type
  form.description = ds.description ?? ''
  // 演示模式判定：地址等于内置模拟地址即为演示（兼容旧数据源 config.demo 字段）
  const c = ds.config || {}
  form.demo = c.demo !== false && ds.url === BUILTIN_MOCK_URLS[ds.type]
  form.host = c.host ?? '127.0.0.1'
  form.port = c.port ?? defaultPortFor(ds.type)
  form.unitId = c.unitId ?? 1
  form.rack = c.rack ?? 0
  form.slot = c.slot ?? 2
  form.endpoint = c.endpoint ?? ''
  form.pollInterval = c.pollInterval ?? 1000
  form.interval = c.interval ?? 2000
  form.url = ds.url // 最后赋地址，保留用户保存的原始值
  formError.value = ''
  editingId.value = ds.id
  mode.value = 'edit'
  nextTick(() => {
    suppressUrlSync = false
  })
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
  // 保存后停止该数据源的监控（地址/配置可能已变更，旧探针失效）并收起详情
  if (editingId.value) monitor.stop(editingId.value)
  expandedId.value = null
  mode.value = 'list'
}

function handleDelete(ds: DataSource) {
  if (confirm(`确定删除数据源「${ds.name}」吗？\n已引用该数据源的节点绑定将回退为模拟数据。`)) {
    monitor.stop(ds.id)
    if (expandedId.value === ds.id) expandedId.value = null
    dataSourceStore.deleteDataSource(ds.id)
  }
}

function handleClose() {
  monitor.stopAll()
  expandedId.value = null
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

/* ===================== 网关 / 服务监控 ===================== */
.ds-row {
  display: flex;
  flex-direction: column;
}
.ds-row .ds-item {
  cursor: pointer;
}
/* 状态徽标圆点 */
.ds-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #bfbfbf; /* idle 灰 */
}
.ds-status-dot.st-connecting {
  background: #faad14; /* 连接中 黄 */
  animation: ds-pulse 1s ease-in-out infinite;
}
.ds-status-dot.st-online {
  background: #52c41a; /* 在线 绿 */
}
.ds-status-dot.st-offline {
  background: #ff4d4f; /* 离线 红 */
}
@keyframes ds-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
/* 监控中的按钮高亮 */
.ds-btn.active {
  border-color: #52c41a;
  color: #52c41a;
}
/* 状态文字配色 */
.st-text-online { color: #52c41a; }
.st-text-offline { color: #ff4d4f; }
.st-text-connecting { color: #faad14; }
.st-text-idle { color: #999; }

/* 展开的监控详情面板 */
.ds-monitor-detail {
  margin: -4px 0 8px;
  padding: 12px 14px;
  border: 1px solid #e8e8e8;
  border-top: none;
  border-radius: 0 0 6px 6px;
  background: #fafafa;
  cursor: default;
}
.ds-mon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  margin-bottom: 8px;
}
.ds-mon-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 90px;
}
.ds-mon-cell.grow {
  flex: 1;
}
.ds-mon-k {
  font-size: 11px;
  color: #999;
}
.ds-mon-v {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}
.ds-mon-devmsg {
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #666;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
}
.ds-mon-demo-note {
  margin-bottom: 8px;
  padding: 5px 10px;
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
}
.ds-mon-title {
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #555;
}
.ds-mon-empty {
  padding: 8px 0;
  font-size: 12px;
  color: #bbb;
}
.ds-mon-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}
.ds-mon-table th,
.ds-mon-table td {
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid #f5f5f5;
}
.ds-mon-table th {
  background: #fafafa;
  color: #888;
  font-weight: 500;
}
.ds-mon-table tr:last-child td {
  border-bottom: none;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
/* 质量码徽标 */
.ds-q {
  display: inline-block;
  padding: 0 6px;
  font-size: 11px;
  border-radius: 3px;
  line-height: 16px;
}
.ds-q.q-good {
  color: #52c41a;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}
.ds-q.q-bad {
  color: #ff4d4f;
  background: #fff2f0;
  border: 1px solid #ffccc7;
}
.ds-q.q-uncertain {
  color: #faad14;
  background: #fffbe6;
  border: 1px solid #ffe58f;
}
/* 错误告警列表 */
.ds-mon-errors {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 120px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
}
.ds-mon-errors li {
  padding: 4px 8px;
  font-size: 12px;
  color: #cf1322;
  border-bottom: 1px solid #f5f5f5;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.ds-mon-errors li:last-child {
  border-bottom: none;
}
</style>
