<!--
  数据源「工业协议设备参数」配置区块（S7 / OPC UA / Modbus）
  从 DataSourceDialog.vue 抽取，降低父组件体积。
  直接接收父组件的响应式 form 对象，内部 v-model 原地修改其字段
  （连接模式、主机/端口、机架槽号、轮询间隔等）。
-->
<template>
  <div class="ds-proto-cfg">
    <div class="ds-field">
      <label class="ds-label">连接模式</label>
      <div class="ds-radio-row">
        <label class="ds-radio">
          <input type="radio" v-model="form.demo" :value="true" /> 演示模式（内置模拟网关）
        </label>
        <label class="ds-radio">
          <input type="radio" v-model="form.demo" :value="false" /> 真实设备（独立网关）
        </label>
      </div>
      <div class="ds-cfg-hint">{{ cfgHint }}</div>
    </div>
    <template v-if="!form.demo">
      <!-- OPC UA：端点 URL -->
      <div v-if="isOpc" class="ds-field">
        <label class="ds-label">端点 URL <span class="required">*</span></label>
        <input v-model="form.endpoint" class="ds-input" placeholder="如：opc.tcp://192.168.0.10:4840" />
      </div>
      <!-- S7 / Modbus：主机 + 端口 -->
      <div v-else class="ds-field-row">
        <div class="ds-field grow">
          <label class="ds-label">主机地址 <span class="required">*</span></label>
          <input v-model="form.host" class="ds-input" placeholder="如：192.168.0.10" />
        </div>
        <div class="ds-field">
          <label class="ds-label">端口</label>
          <input v-model.number="form.port" type="number" class="ds-input num" />
        </div>
      </div>
      <!-- Modbus：从站地址 + 轮询间隔 -->
      <div v-if="isModbus" class="ds-field-row">
        <div class="ds-field">
          <label class="ds-label">从站地址</label>
          <input v-model.number="form.unitId" type="number" class="ds-input num" />
        </div>
        <div class="ds-field">
          <label class="ds-label">轮询间隔(ms)</label>
          <input v-model.number="form.pollInterval" type="number" class="ds-input num" />
        </div>
      </div>
      <!-- S7：机架 / 槽号 -->
      <div v-if="isS7" class="ds-field-row">
        <div class="ds-field">
          <label class="ds-label">机架号(rack)</label>
          <input v-model.number="form.rack" type="number" class="ds-input num" />
        </div>
        <div class="ds-field">
          <label class="ds-label">槽号(slot)</label>
          <input v-model.number="form.slot" type="number" class="ds-input num" />
        </div>
      </div>
      <!-- S7 / OPC UA：轮询间隔 -->
      <div v-if="isS7 || isOpc" class="ds-field-row">
        <div class="ds-field">
          <label class="ds-label">轮询间隔(ms)</label>
          <input v-model.number="form.pollInterval" type="number" class="ds-input num" />
        </div>
        <div class="ds-field"></div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BUILTIN_MOCK_URLS, type DataSourceType } from '@/stores/dataSource'

const props = defineProps<{
  /** 父组件的响应式表单对象（原地修改其字段） */
  form: any
}>()

const isModbus = computed(() => props.form.type === 'modbus')
const isS7 = computed(() => props.form.type === 's7')
const isOpc = computed(() => props.form.type === 'opc')

/** 连接模式提示文案（随协议变化） */
const cfgHint = computed(() => {
  if (props.form.demo) {
    return `使用内置模拟网关，无需真实设备，地址自动填充为 ${BUILTIN_MOCK_URLS[props.form.type as DataSourceType]}`
  }
  switch (props.form.type) {
    case 'modbus':
      return '需先启动独立网关（npm run gateway），网关以 Modbus TCP 连接设备；可用 npm run simulator 起仿真从站验证'
    case 's7':
      return '需先启动独立网关（npm run s7-gateway），网关以 S7comm(nodes7) 连接 PLC；可用 npm run s7-simulator 起仿真 PLC 验证'
    case 'opc':
      return '需先启动独立网关（npm run opc-gateway），网关以 node-opcua 连接服务器；可用 npm run opc-simulator 起仿真服务端验证'
    default:
      return ''
  }
})
</script>

<style scoped>
.ds-proto-cfg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
}
.ds-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ds-field.grow {
  flex: 2;
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
.ds-input.num {
  width: 100%;
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
</style>
