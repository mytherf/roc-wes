<!-- ══════════════════════════════════════════════════════════════════════
     S7AddressAssistantDialog.vue - S7 地址生成助手对话框

     点 ID 助手扩展点的 S7 实现（见 pointIdAssistantRegistry.ts）：
     S7 点位地址结构复杂（数据区 + DB 块 + 类型 + 偏移 + 位号），
     禁手输，一律经本对话框产生。

     契约：
       prop  pointId   现有点 ID（可反解析时回填各字段编辑，否则缺省值）
       prop  groupIdx  点组序号（仅标题展示用）
       emit  confirm   确定：携带生成的合法地址写回
       emit  cancel    取消/关闭：丢弃草稿

     草稿模式——确定才写回点组 pointId，取消/遮罩点击丢弃；
     Esc 关闭由调用方统一协调（与转换函数/导入对话框保持优先级一致）。
     ══════════════════════════════════════════════════════════════════════ -->
<template>
  <Teleport to="body">
    <div class="transform-dialog-mask" @click.self="$emit('cancel')">
      <div class="transform-dialog s7-gen-dialog" role="dialog" aria-modal="true" aria-label="S7 地址生成助手">
        <div class="transform-dialog-head">
          <h4>
            S7 地址生成助手
            <span class="s7-gen-tag">
              点组 {{ groupIdx + 1 }}
            </span>
          </h4>
          <button type="button" class="transform-dialog-close" title="关闭（不写入）" @click="$emit('cancel')">×</button>
        </div>
        <div class="s7-gen-form">
          <div class="s7-gen-row">
            <label class="s7-gen-field">数据区
              <select :value="area" class="s7-gen-input" @change="setArea(($event.target as HTMLSelectElement).value as S7Area)">
                <option v-for="a in S7_AREAS" :key="a" :value="a">{{ a }}</option>
              </select>
            </label>
            <!-- DB 块号仅 DB 区需要；M/I/Q 区地址不含块号 -->
            <label v-if="area === 'DB'" class="s7-gen-field">DB 块号
              <input v-model.number="db" type="number" min="1" class="s7-gen-input" />
            </label>
            <label class="s7-gen-field">数据类型
              <select v-model="type" class="s7-gen-input">
                <option v-for="t in (area === 'DB' ? S7_GEN_TYPES : S7_IO_TYPES)" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
          </div>
          <div class="s7-gen-row">
            <label class="s7-gen-field">字节偏移
              <input v-model.number="offset" type="number" min="0" class="s7-gen-input" />
            </label>
            <!-- 位号仅 BOOL（DB 位地址 DB{n},X{字节}.{位}；M/I/Q 位地址 {区}{字节}.{位}）时可见 -->
            <label v-if="type === 'BOOL'" class="s7-gen-field">位号
              <select v-model.number="bit" class="s7-gen-input">
                <option v-for="b in 8" :key="b - 1" :value="b - 1">{{ b - 1 }}</option>
              </select>
            </label>
          </div>
          <div class="s7-gen-preview">
            预览：<span class="s7-gen-addr">{{ preview || '参数不完整' }}</span>
          </div>
        </div>
        <div class="transform-dialog-foot">
          <button type="button" class="transform-dialog-btn" @click="$emit('cancel')">取消</button>
          <button type="button" class="transform-dialog-btn primary" :disabled="!preview" @click="$emit('confirm', preview)">写入点ID</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  buildS7Address,
  parseS7Address,
  S7_AREAS,
  S7_GEN_TYPES,
  S7_IO_TYPES,
  type S7Area,
  type S7GenType,
} from '@/utils/s7Address'

const props = defineProps<{
  /** 现有点 ID（可反解析时回填各字段编辑，否则缺省 DB1/REAL/偏移0/位0） */
  pointId: string
  /** 点组序号（仅标题展示） */
  groupIdx: number
}>()

defineEmits<{
  /** 确定：携带生成的合法地址写回点组 */
  (e: 'confirm', pointId: string): void
  /** 取消/关闭：丢弃草稿 */
  (e: 'cancel'): void
}>()

// 表单草稿：打开时由现有点 ID 反解析回填，缺省 DB1/REAL/偏移0/位0
const parsed = parseS7Address(props.pointId ?? '')
const area = ref<S7Area>(parsed?.area ?? 'DB')
const db = ref(parsed?.db || 1)
const type = ref<S7GenType>(parsed?.type ?? 'REAL')
const offset = ref(parsed?.offset ?? 0)
const bit = ref(parsed?.bit ?? 0)

/** 切换数据区：M/I/Q 区不支持的类型自动回退 BYTE（避免预览永空） */
function setArea(next: S7Area) {
  area.value = next
  if (next !== 'DB' && !(S7_IO_TYPES as readonly string[]).includes(type.value)) type.value = 'BYTE'
}

/** 实时预览：按表单参数拼接合法地址，非法时为空串（确定按钮禁用） */
const preview = computed(() =>
  buildS7Address({ area: area.value, db: db.value, type: type.value, offset: offset.value, bit: type.value === 'BOOL' ? bit.value : undefined })
)
</script>

<style scoped>
/* 半透明遮罩：点击遮罩本身（非对话框）即取消关闭 */
.transform-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.transform-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: calc(100vh - 80px);
}
.transform-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.transform-dialog-head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.transform-dialog-close {
  border: none;
  background: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.transform-dialog-close:hover {
  background: var(--statusbar-bg);
  color: var(--text-primary);
}
.transform-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.transform-dialog-btn {
  padding: 5px 16px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--statusbar-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}
.transform-dialog-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.transform-dialog-btn.primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.transform-dialog-btn.primary:hover {
  opacity: 0.9;
  color: #fff;
}
.transform-dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 点组序号徽标 */
.s7-gen-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--border-light);
}

/* S7 地址生成助手对话框表单 */
.s7-gen-dialog {
  width: min(420px, calc(100vw - 48px));
}
.s7-gen-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}
.s7-gen-row {
  display: flex;
  gap: 10px;
}
.s7-gen-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
.s7-gen-input {
  width: 100%;
  padding: 5px 8px;
  font-size: 13px;
  border: 1px solid var(--input-border, var(--border-color));
  border-radius: var(--radius-sm);
  background: var(--input-bg, var(--panel-bg));
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.s7-gen-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-ring);
}
.s7-gen-preview {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 10px;
  background: var(--statusbar-bg);
  border-radius: var(--radius-sm);
}
.s7-gen-addr {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-primary);
}
</style>
