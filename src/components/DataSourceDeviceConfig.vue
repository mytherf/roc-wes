<!--
  数据源「工业协议设备参数」配置区块（S7 / OPC UA / Modbus）
  从 DataSourceDialog.vue 抽取，降低父组件体积。
  连接模式（演示/真实）由父组件统一控制，本组件仅在「真实设备」模式下渲染，
  直接接收父组件的响应式 form 对象，内部 v-model 原地修改其设备字段
  （主机/端口、机架槽号、端点 URL、轮询间隔等）。
-->
<template>
  <div class="ds-proto-cfg">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 父组件的响应式表单对象（原地修改其字段） */
  form: any
}>()

const isModbus = computed(() => props.form.type === 'modbus')
const isS7 = computed(() => props.form.type === 's7')
const isOpc = computed(() => props.form.type === 'opc')
</script>

<style scoped>
.ds-proto-cfg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--statusbar-bg);
  border: 1px solid var(--divider-color, var(--border-light));
  border-radius: var(--radius-md);
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
.ds-input:hover:not(:focus) {
  border-color: var(--input-border-hover, var(--color-primary));
}
.ds-input:focus {
  border-color: var(--color-primary);
  background: var(--panel-bg);
  box-shadow: 0 0 0 2px var(--color-primary-ring);
}
.ds-input.num {
  width: 100%;
}
.ds-field-row {
  display: flex;
  gap: 12px;
}
.ds-field-row .ds-field {
  flex: 1;
}
</style>
