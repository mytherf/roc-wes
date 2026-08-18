<!--
  SSE 协议配置子组件（注册表驱动，见 protocolConfigRegistry.ts）
  真实设备模式仅需推送流地址（按点位建流），
  无额外协议专属参数。
  直接接收父组件的响应式 form 对象，v-model 原地修改对应字段。
-->
<template>
  <div class="ds-proto-cfg">
    <ProtocolAddressInput :form="form" placeholder="如：http://192.168.0.10:8082/sse" />
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
</style>
