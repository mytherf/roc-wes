<!--
  协议地址输入公共子组件（供各协议子组件复用）
  真实设备模式下设备/服务地址统一在此填写（绑定 form.url，与其他字段一样原地修改）；
  占位示例由各协议子组件按自身地址格式传入。
-->
<template>
  <div class="ds-field">
    <label class="ds-label">地址 <span class="required">*</span></label>
    <input v-model="form.url" class="ds-input" :placeholder="placeholder" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** 父组件的响应式表单对象（原地修改其 url 字段） */
  form: any
  /** 地址输入示例提示（各协议地址格式不同） */
  placeholder: string
}>()
</script>

<style scoped>
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
.ds-input:hover:not(:focus) {
  border-color: var(--input-border-hover, var(--color-primary));
}
.ds-input:focus {
  border-color: var(--color-primary);
  background: var(--panel-bg);
  box-shadow: 0 0 0 2px var(--color-primary-ring);
}
</style>
