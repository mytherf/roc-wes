<!-- ══════════════════════════════════════════════════════════════════════
     NodeEventsTab.vue - 属性面板「事件」标签页

     配置条件触发规则（如"温度越限变红/告警"）：监听绑定点ID +
     触发条件 + 触发动作（控制台/弹告警/HTTP 请求）。
     规则的草稿加载/提交逻辑在 useNodeEvents composable，
     监听字段选项来自共享绑定模型（inject）。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <div>
    <div v-if="eventsDraft.length === 0" class="empty-hint">暂无事件规则，点击下方按钮添加。</div>

    <div v-for="(rule, idx) in eventsDraft" :key="rule.id" class="event-rule">
      <div class="rule-header">
        <label class="checkbox-label">
          <input type="checkbox" v-model="rule.enabled" />
          <span>启用</span>
        </label>
        <button class="rule-remove" @click="removeEventRule(idx)">删除</button>
      </div>
      <div class="field">
        <label>规则名称</label>
        <input v-model="rule.name" placeholder="例如：温度越限告警" />
      </div>
      <div class="field">
        <label>监听字段
          <!-- 帮助按钮：监听字段说明气泡（跟在标签文字后） -->
          <span class="field-help-wrap">
            <button type="button" class="field-help-btn" :aria-expanded="fieldHelpOpen === 'watch'" title="监听字段说明" @click="toggleFieldHelp('watch')">?</button>
            <div v-if="fieldHelpOpen === 'watch'" class="field-help-pop" role="note">
              选择要监听的绑定点ID；节点可能绑定多个点，运行值从 data.values[点ID].value 读取。
            </div>
          </span>
        </label>
        <!-- 点ID 下拉选择：field 统一为绑定点ID，选项来自当前节点的绑定点组（可能多个；填了点名称时以「点ID（名称）」展示） -->
        <select v-model="rule.field">
          <option
            v-for="g in binding.watchFieldOptions"
            :key="g.pointId"
            :value="g.pointId"
            :title="g.pointId"
          >{{ g.label }}</option>
        </select>
      </div>
      <div class="field">
        <label>触发条件</label>
        <select v-model="rule.condition">
          <option value="changed">值变化</option>
          <option value="gt">大于 (&gt;)</option>
          <option value="lt">小于 (&lt;)</option>
          <option value="gte">大于等于 (≥)</option>
          <option value="lte">小于等于 (≤)</option>
          <option value="eq">等于 (=)</option>
          <option value="neq">不等于 (≠)</option>
        </select>
      </div>
      <div v-if="rule.condition !== 'changed'" class="field">
        <label>阈值</label>
        <input v-model="rule.threshold" placeholder="例如：80" />
      </div>
      <div class="field">
        <label>触发动作</label>
        <select v-model="rule.actionType">
          <option value="console">控制台日志</option>
          <option value="alert">弹出告警</option>
          <option value="http">HTTP 请求</option>
        </select>
      </div>
      <div v-if="rule.actionType === 'alert'" class="field">
        <label>告警内容</label>
        <input v-model="rule.message" placeholder="例如：设备温度越限！" />
      </div>
      <template v-if="rule.actionType === 'http'">
        <div class="field">
          <label>请求地址</label>
          <input v-model="rule.url" placeholder="http://localhost:8080/api/alarm" />
        </div>
        <div class="field">
          <label>请求方法</label>
          <select v-model="rule.method">
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
      </template>
    </div>

    <button class="add-event-btn" @click="handleAddEventRule">＋ 添加事件规则</button>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { NODE_BINDING_KEY } from '@/composables/useNodeBinding'
import { PANEL_STATE_KEY } from './panelState'
import { useNodeEvents } from '@/composables/useNodeEvents'
import { useFieldHelp } from './useFieldHelp'

const props = defineProps<{
  canvasRef: any
}>()

// ===================== 依赖注入 =====================
// 监听字段选项来自共享绑定模型（PropertyPanel provide）
const binding = inject(NODE_BINDING_KEY)!
// 面板级状态：activeTab 可写引用（useNodeEvents 切换节点时重置为 basic）
const panelState = inject(PANEL_STATE_KEY)!
const { fieldHelpOpen, toggleFieldHelp } = useFieldHelp()

// ===================== 辅助方法：获取 Graph 实例 =====================
function getGraph(): any {
  const g = props.canvasRef?.graph
  return g?.value !== undefined ? g.value : g
}

// ===================== 事件规则（逻辑在 useNodeEvents composable） =====================
const { eventsDraft, addEventRule, removeEventRule } = useNodeEvents(getGraph, panelState.activeTab)

/** 添加事件规则：默认监听第一个绑定点（field 统一为点ID，不再有空值语义） */
function handleAddEventRule() {
  addEventRule(binding.watchFieldOptions[0]?.pointId ?? '')
}
</script>

<style scoped>
@import './panelShared.css';

/* ===================== 事件规则 ===================== */
.event-rule {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 12px;
  margin-bottom: 12px;
  background: var(--statusbar-bg);
}
.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rule-header .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}
.rule-header .checkbox-label input[type='checkbox'] {
  width: auto;
  margin: 0;
  cursor: pointer;
  accent-color: var(--color-primary);
}
.rule-remove {
  border: none;
  background: none;
  color: var(--color-danger);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.rule-remove:hover {
  background: rgba(239, 68, 68, 0.08);
}
.event-rule .field {
  margin-bottom: 8px;
}
.add-event-btn {
  width: 100%;
  padding: 8px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--panel-bg);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}
.add-event-btn:hover {
  background: var(--color-primary-light);
}
</style>
