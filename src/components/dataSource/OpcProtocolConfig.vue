<!--
  OPC UA 协议专属参数子组件（注册表驱动，见 protocolConfigRegistry.ts）
  真实设备模式的完整接入配置：端点地址（opc.tcp://...，
  由 ProtocolAddressInput 公共组件填写）+ 轮询间隔。
  直接接收父组件的响应式 form 对象，v-model 原地修改对应字段。
-->
<template>
  <div class="ds-proto-cfg">
    <ProtocolAddressInput :form="form" placeholder="如：opc.tcp://192.168.0.10:4840" />
    <div class="ds-field-row">
      <div class="ds-field">
        <label class="ds-label">轮询间隔(ms)</label>
        <input v-model.number="form.pollInterval" type="number" class="ds-input num" />
      </div>
      <div class="ds-field"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ProtocolAddressInput from './ProtocolAddressInput.vue'

defineProps<{
  /** 父组件的响应式表单对象（原地修改其字段） */
  form: any
}>()
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
.ds-field-row {
  display: flex;
  gap: 12px;
}
.ds-field-row .ds-field {
  flex: 1;
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
</style>
