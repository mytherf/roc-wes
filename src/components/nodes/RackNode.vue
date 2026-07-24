<template>
  <div class="rack-node">
    <div class="rack-header">
      <span class="rack-icon">🏛️</span>
      <span class="rack-name">{{ name }}</span>
      <span class="rack-dim">{{ rows }}×{{ cols }}×{{ floors }}</span>
    </div>
    <div class="rack-floors">
      <div v-for="(floorGrid, fi) in floorGrids" :key="fi" class="rack-floor">
        <span class="floor-label">F{{ Number(fi) + 1 }}</span>
        <div class="rack-grid">
          <div v-for="(row, ri) in floorGrid" :key="ri" class="rack-row">
            <div v-for="(cell, ci) in row" :key="ci" class="rack-cell" :class="cellClass(cell)">
              <span class="cell-label">{{ cell.label || '' }}</span>
            </div>
          </div>
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
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  node: any
}>()

const data = ref(props.node?.getData() || {})
const name = ref(data.value.name || '货架-A01')
const rows = ref(data.value.rows || 4)
const cols = ref(data.value.cols || 6)
const floors = ref(data.value.floors || 6)

/** 生成单层空 grid */
function createEmptyGrid(r: number, c: number) {
  return Array.from({ length: r }, () =>
    Array.from({ length: c }, () => ({ status: 'empty' }))
  )
}

/** 根据 rows/cols/floors 生成完整 3D grid */
function createFullGrid(r: number, c: number, f: number) {
  return Array.from({ length: f }, () => createEmptyGrid(r, c))
}

// floorGrids: 三维数组 [floor][row][col]
const floorGrids = ref(
  data.value.floorGrids || createFullGrid(rows.value, cols.value, floors.value)
)

/** 监听维度变化，自动重建 grid */
watch([rows, cols, floors], ([newR, newC, newF], [oldR, oldC, oldF]) => {
  if (newR === oldR && newC === oldC && newF === oldF) return
  const oldGrids = floorGrids.value
  const newGrids = createFullGrid(newR, newC, newF)
  // 保留已有单元格状态（尽可能复用）
  for (let f = 0; f < Math.min(oldGrids.length, newF); f++) {
    for (let r = 0; r < Math.min(oldGrids[f].length, newR); r++) {
      for (let c = 0; c < Math.min(oldGrids[f][r].length, newC); c++) {
        newGrids[f][r][c] = oldGrids[f][r][c]
      }
    }
  }
  floorGrids.value = newGrids
})

const totalCells = computed(() => rows.value * cols.value * floors.value)
const occupiedCells = computed(() => {
  let count = 0
  for (const floor of floorGrids.value) {
    for (const row of floor) {
      for (const cell of row) {
        if (cell.status === 'occupied') count++
      }
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
    floors.value = newData.floors || 6
    if (newData.floorGrids) floorGrids.value = newData.floorGrids
  }
})
</script>

<style scoped>
.rack-node {
  min-width: 160px;
  max-width: 260px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 8px;
  border: 2px solid #8c8c8c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
}
.rack-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.rack-icon { font-size: 16px; }
.rack-name { font-size: 13px; font-weight: 600; color: #333; flex: 1; }
.rack-dim {
  font-size: 10px;
  color: #1890ff;
  background: #e6f7ff;
  border-radius: 3px;
  padding: 1px 4px;
  white-space: nowrap;
}
.rack-floors {
  display: flex;
  flex-direction: column-reverse;
  gap: 3px;
  max-height: 200px;
  overflow-y: auto;
}
.rack-floor {
  display: flex;
  align-items: flex-start;
  gap: 3px;
}
.floor-label {
  font-size: 8px;
  color: #999;
  width: 14px;
  flex-shrink: 0;
  text-align: center;
  line-height: 1;
  padding-top: 2px;
}
.rack-grid { display: flex; flex-direction: column; gap: 1px; }
.rack-row { display: flex; gap: 1px; }
.rack-cell {
  width: 14px;
  height: 10px;
  border-radius: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 5px;
  transition: background 0.3s;
}
.cell-empty { background: #f5f5f5; border: 1px solid #e8e8e8; }
.cell-occupied { background: #52c41a; border: 1px solid #389e0d; }
.cell-reserved { background: #faad14; border: 1px solid #d48806; }
.cell-label { color: #fff; font-weight: 600; }
.rack-info {
  display: flex;
  gap: 10px;
  font-size: 10px;
  color: #999;
  margin-top: 5px;
  justify-content: center;
}
</style>