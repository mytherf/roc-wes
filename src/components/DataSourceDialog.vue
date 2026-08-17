<!-- ══════════════════════════════════════════════════════════════════════
     DataSourceDialog.vue - 数据源管理对话框（连接外部数据的“设置中心”）

     数据源 = 设备/服务的接入配置（地址、类型、参数），是节点数据绑定的前提。

     功能一览：
       1. 列表视图：展示所有数据源，支持监控/停止监控、展开查看实时数据、
          编辑、删除；可一键“监控全部”
       2. 新增/编辑表单：
          - 7 种类型：WebSocket / MQTT / HTTP / SSE / S7 / OPC UA / Modbus
          - 两种连接模式：演示模式（桌面端内置模拟引擎，免配置）/ 真实设备（需填参数）
          - 工业协议（S7/OPC/Modbus）真实设备模式：填写主机/端口/机架/槽号等
            （表单由 DataSourceDeviceConfig 子组件提供）
       3. 监控详情：展开后显示连接状态、建连耗时、设备状态、
          点位实时值表格（点位 ID / 值 / 质量码 / 时间）、错误告警列表

     监控能力由 useGatewayMonitor 提供（探针向数据源发起真实请求测量连通性）。
     数据持久化到 dataSourceStore（文件落盘 datasources.json）。
     ══════════════════════════════════════════════════════════════════════ -->
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
                  <div class="ds-item-url" :title="ds.url">{{ isDemoSource(ds) ? '演示模式（内置模拟引擎）' : ds.url }}</div>
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
                <div v-if="isDemoSource(ds)" class="ds-mon-demo-note">
                  演示模式：下列为内置模拟引擎生成的样例点位(sample-*)与实时模拟数据
                </div>

                <!-- 数据点实时值 -->
                <div class="ds-mon-title">数据点实时值</div>
                <div v-if="Object.keys(monitor.getState(ds.id).points).length === 0" class="ds-mon-empty">
                  {{ isDemoSource(ds) ? '等待内置演示引擎推送…' : '暂无数据（未绑定节点点位或服务未推送）' }}
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
              <label class="ds-label">
                连接模式
                <!-- 帮助按钮：点击弹出连接模式说明气泡，点击外部关闭 -->
                <span class="ds-help-wrap">
                  <button type="button" class="ds-help-btn" :aria-expanded="modeHelpOpen" title="连接模式说明" @click="modeHelpOpen = !modeHelpOpen">?</button>
                  <div v-if="modeHelpOpen" class="ds-help-pop" role="note">{{ modeHint }}</div>
                </span>
              </label>
              <div class="ds-radio-row">
                <label class="ds-radio">
                  <input type="radio" v-model="form.demo" :value="true" /> 演示模式（桌面端内置模拟引擎）
                </label>
                <label class="ds-radio">
                  <input type="radio" v-model="form.demo" :value="false" /> 真实设备
                </label>
              </div>
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
              <label class="ds-label">地址 <span v-if="!form.demo && !isIndustrial" class="required">*</span></label>
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
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import DataSourceDeviceConfig from './DataSourceDeviceConfig.vue'
import { useGatewayMonitor } from '@/composables/useGatewayMonitor'
import type { MonitorState } from '@/services/GatewayMonitorService'
import {
  useDataSourceStore,
  DATA_SOURCE_TYPE_LABELS,
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

/** 数据源是否为演示模式（仅看 config.demo，演示模式地址可为空） */
function isDemoSource(ds: DataSource): boolean {
  return ds.config?.demo === true
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
    return '演示模式：由桌面端内置模拟引擎生成数据（无需真实设备，无需填写地址）'
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

/** 连接模式说明气泡开关（点击 ? 切换，点击外部关闭） */
const modeHelpOpen = ref(false)
function onDocPointerDownForModeHelp(e: Event) {
  if (!modeHelpOpen.value) return
  const t = e.target
  if (!(t instanceof Element && t.closest('.ds-help-wrap'))) modeHelpOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDownForModeHelp))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDownForModeHelp))

/** 地址输入框是否只读：演示模式（无需地址）或工业协议（固定网关地址）下不可手改 */
const urlReadonly = computed(() => form.demo || isIndustrial.value)

/** 地址占位符：演示模式提示无需地址；真实设备模式下非工业协议给出示例 */
const urlPlaceholder = computed(() => {
  if (form.demo) return '演示模式无需地址'
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
 * - 演示模式：无需地址（置空，数据由 Rust DemoAdapter 生成）；
 * - 工业协议真实设备：固定独立网关地址（设备地址在下方设备参数中配置）；
 * - 非工业协议真实设备：由用户手动填写。
 */
function syncUrl() {
  if (form.demo) {
    form.url = ''
  } else if (isIndustrialType(form.type)) {
    form.url = REAL_GATEWAY_URLS[form.type] as string
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
  form.url = '' // 默认演示模式，无需地址
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
  // 演示模式判定：仅以 config.demo 为准
  const c = ds.config || {}
  form.demo = c.demo === true
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
  // 地址校验：演示模式无需地址；工业协议地址自动填充（设备参数在下方填写）；
  // 仅非工业协议的真实设备模式必须填写真实服务地址
  if (!form.demo && !isIndustrial.value && !url) {
    formError.value = '请填写数据源地址'
    return
  }

  // 工业协议设备参数与校验（演示模式统一以 config.demo 标识）
  const config: Record<string, any> = { demo: form.demo }
  if (form.type === 'modbus') {
    if (!form.demo && !form.host.trim()) {
      formError.value = '真实设备模式下请填写设备主机地址'
      return
    }
    Object.assign(config, {
      host: form.host.trim(),
      port: Number(form.port) || 502,
      unitId: Number(form.unitId) || 1,
      pollInterval: Number(form.pollInterval) || 1000,
    })
  } else if (form.type === 's7') {
    if (!form.demo && !form.host.trim()) {
      formError.value = '真实设备模式下请填写 PLC 主机地址'
      return
    }
    Object.assign(config, {
      host: form.host.trim(),
      port: Number(form.port) || 102,
      rack: Number(form.rack) || 0,
      slot: Number(form.slot) || 2,
      pollInterval: Number(form.pollInterval) || 1000,
    })
  } else if (form.type === 'opc') {
    if (!form.demo && !form.endpoint.trim()) {
      formError.value = '真实设备模式下请填写 OPC UA 端点 URL'
      return
    }
    Object.assign(config, {
      endpoint: form.endpoint.trim(),
      pollInterval: Number(form.pollInterval) || 1000,
    })
  } else if (form.type === 'http') {
    config.interval = Number(form.interval) || 2000
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
  background: var(--panel-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.ds-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.ds-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.ds-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.ds-close:hover {
  color: var(--text-primary);
  background: var(--statusbar-bg);
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
  color: var(--text-secondary);
}
.ds-toolbar-actions {
  display: flex;
  gap: 8px;
}
.ds-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
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
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: border-color 0.2s;
}
.ds-item:hover {
  border-color: var(--color-primary);
}
.ds-item-main {
  flex: 1;
  min-width: 0;
}
.ds-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.ds-type-tag {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border: 1px solid var(--color-primary-ring);
  border-radius: 3px;
  padding: 0 5px;
  line-height: 16px;
}
.ds-item-url {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ds-item-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
.ds-item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.ds-btn {
  padding: 4px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--panel-bg);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.ds-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.ds-btn.primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.ds-btn.primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: #fff;
}
.ds-btn.small {
  padding: 2px 10px;
  font-size: 12px;
}
.ds-btn.danger:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
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
  color: var(--text-primary);
}
.ds-label .required {
  color: var(--color-danger);
}
.ds-input {
  padding: 6px 10px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  font-size: 13px;
  outline: none;
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-primary);
  box-shadow: var(--shadow-sm, none);
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}
.ds-input:hover:not(:focus):not([readonly]) {
  border-color: var(--input-border-hover, var(--color-primary));
}
.ds-input:focus {
  border-color: var(--color-primary);
  background: var(--panel-bg);
  box-shadow: 0 0 0 2px var(--color-primary-ring);
}
.ds-input[readonly] {
  color: var(--text-secondary);
  border-style: dashed;
}
.ds-error {
  color: var(--color-danger);
  font-size: 13px;
}
.ds-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}
/* 工业协议设备参数区块（S7 / OPC UA / Modbus） */
.ds-proto-cfg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--statusbar-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
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
  color: var(--text-primary);
  cursor: pointer;
}
/* 帮助按钮定位容器（弹出气泡以此为锚点） */
.ds-help-wrap {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}
.ds-help-btn {
  width: 16px;
  height: 16px;
  margin-left: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--panel-bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.ds-help-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.ds-help-btn[aria-expanded='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
/* 连接模式说明气泡（绝对定位悬浮在按钮下方，不占布局空间） */
.ds-help-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: -40px;
  z-index: 30;
  width: 300px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  white-space: normal;
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
/* 状态徽标圆点（语义色，不随主题变化） */
.ds-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #bfbfbf;
}
.ds-status-dot.st-connecting {
  background: #faad14;
  animation: ds-pulse 1s ease-in-out infinite;
}
.ds-status-dot.st-online {
  background: #52c41a;
}
.ds-status-dot.st-offline {
  background: #ff4d4f;
}
@keyframes ds-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
/* 监控中的按钮高亮 */
.ds-btn.active {
  border-color: var(--color-success);
  color: var(--color-success);
}
/* 状态文字配色 */
.st-text-online { color: #52c41a; }
.st-text-offline { color: #ff4d4f; }
.st-text-connecting { color: #faad14; }
.st-text-idle { color: var(--text-muted); }

/* 展开的监控详情面板 */
.ds-monitor-detail {
  margin: -4px 0 8px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--statusbar-bg);
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
  color: var(--text-muted);
}
.ds-mon-v {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}
.ds-mon-devmsg {
  margin-bottom: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--panel-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}
.ds-mon-demo-note {
  margin-bottom: 8px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border: 1px solid var(--color-primary-ring);
  border-radius: var(--radius-sm);
}
.ds-mon-title {
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.ds-mon-empty {
  padding: 8px 0;
  font-size: 12px;
  color: var(--text-muted);
}
.ds-mon-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.ds-mon-table th,
.ds-mon-table td {
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-light);
}
.ds-mon-table th {
  background: var(--statusbar-bg);
  color: var(--text-muted);
  font-weight: 500;
}
.ds-mon-table tr:last-child td {
  border-bottom: none;
}
.mono {
  font-family: var(--font-mono);
}
/* 质量码徽标（语义色） */
.ds-q {
  display: inline-block;
  padding: 0 6px;
  font-size: 11px;
  border-radius: 3px;
  line-height: 16px;
}
.ds-q.q-good {
  color: #52c41a;
  background: rgba(82, 196, 26, 0.08);
  border: 1px solid rgba(82, 196, 26, 0.3);
}
.ds-q.q-bad {
  color: #ff4d4f;
  background: rgba(255, 77, 79, 0.08);
  border: 1px solid rgba(255, 77, 79, 0.3);
}
.ds-q.q-uncertain {
  color: #faad14;
  background: rgba(250, 173, 20, 0.08);
  border: 1px solid rgba(250, 173, 20, 0.3);
}
/* 错误告警列表 */
.ds-mon-errors {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 120px;
  overflow-y: auto;
  background: var(--panel-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}
.ds-mon-errors li {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-danger);
  border-bottom: 1px solid var(--border-light);
  font-family: var(--font-mono);
}
.ds-mon-errors li:last-child {
  border-bottom: none;
}
</style>
