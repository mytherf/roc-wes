<template>
  <div class="rack-node">
    <div class="rack-header">
      <span class="rack-icon">🏛️</span>
      <span class="rack-name">{{ name }}</span>
    </div>
    <div class="rack-grid">
      <div v-for="(row, ri) in grid" :key="ri" class="rack-row">
        <div v-for="(cell, ci) in row" :key="ci" class="rack-cell" :class="cellClass(cell)">
          <span class="cell-label">{{ cell.label || '' }}</span>
        </div>
      </div>
    </div>
    <div class="rack-info">
      <span>库位: {{ totalCells }}</span>
      <span>占用: {{ occupiedCells }}</span>
      <span>利用率: {{ utilization }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '货架-A01')
const rows = ref(data.value.rows || 4)
const cols = ref(data.value.cols || 6)
const grid = ref(data.value.grid || Array.from({ length: 4 }, () =>
    Array.from({ length: 6 }, () => ({ status: 'empty' }))
))

const totalCells = computed(() => rows.value * cols.value)
const occupiedCells = computed(() => {
  let count = 0
  for (const row of grid.value) {
    for (const cell of row) {
      if (cell.status === 'occupied') count++
    }
  }
  return count
})
const utilization = computed(() => {
  if (totalCells.value === 0) return 0
  return Math.round((occupiedCells.value / totalCells.value) * 100)
})

const cellClass = (cell: any) => ({
  'cell-empty': cell.status === 'empty',
  'cell-occupied': cell.status === 'occupied',
  'cell-reserved': cell.status === 'reserved',
})

props.node?.on('change:data', ({ current }: { current: any }) => {
  const newData = current || props.node.getData()
  if (newData) {
    name.value = newData.name || '货架-A01'
    rows.value = newData.rows || 4
    cols.value = newData.cols || 6
    if (newData.grid) grid.value = newData.grid
  }
})
</script>

<style scoped>
.rack-node {
  min-width: 180px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #8c8c8c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.rack-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.rack-icon { font-size: 18px; }
.rack-name { font-size: 14px; font-weight: 600; color: #333; }
.rack-grid { display: flex; flex-direction: column; gap: 2px; }
.rack-row { display: flex; gap: 2px; }
.rack-cell {
  width: 20px;
  height: 16px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 6px;
  transition: all 0.3s;
}
.cell-empty { background: #f0f0f0; border: 1px solid #e8e8e8; }
.cell-occupied { background: #52c41a; border: 1px solid #389e0d; }
.cell-reserved { background: #faad14; border: 1px solid #d48806; }
.cell-label { color: #fff; font-weight: 600; }
.rack-info {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #999;
  margin-top: 6px;
  justify-content: center;
}
</style>