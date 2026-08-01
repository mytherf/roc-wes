<template>
  <!-- 双击打开正视图（通过图级 cell:dblclick 事件触发，见 script） -->
  <NodeMinimalView v-if="isMinimal" icon="🏛️" :name="name" />
  <div v-else class="rack-node">
    <div class="rack-header">
      <span class="rack-icon">🏛️</span>
      <span class="rack-name">{{ name }}</span>
      <span class="rack-dim">{{ depthLabel }} {{ rows }}×{{ cols }}×{{ floors }}</span>
    </div>

    <!-- 俯视图：排 rows × 列 cols，每格聚合显示该列（层方向）的占用数 n/floors -->
    <div class="top-grid" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }">
      <div
        v-for="(cell, idx) in topCells"
        :key="idx"
        class="top-cell"
        :class="cellClass(cell.status)"
      >{{ cell.occupied }}/{{ floors }}</div>
    </div>

    <div class="rack-info">
      <span>库位 {{ totalCells }}</span>
      <span>占用 {{ occupiedCells }}</span>
      <span>利用率 {{ utilization }}%</span>
    </div>
    <div class="rack-hint">⤢ 双击查看正视图</div>
  </div>

  <!-- 正视图弹窗：Teleport 到 body，避免被画布层叠上下文遮挡（两种显示模式均可触发） -->
  <Teleport to="body">
      <div v-if="showFront" class="rack-modal-mask" @click.self="showFront = false">
        <div class="rack-modal">
          <div class="modal-header">
            <span class="modal-title">🏛️ {{ name }} · 正视图（{{ depthLabel }}）</span>
            <button class="modal-close" @click="showFront = false">×</button>
          </div>
          <div class="modal-body">
            <!-- 单深位：1 个正视图；双深位：第一排 / 第二排 各 1 个 -->
            <div v-for="r in rows" :key="r" class="front-section">
              <div v-if="rows > 1" class="front-title">第{{ r }}排</div>
              <div class="front-grid">
                <!-- 列头 -->
                <div class="front-row">
                  <span class="floor-label"></span>
                  <span v-for="c in cols" :key="c" class="col-head">C{{ c }}</span>
                </div>
                <!-- 数据行：自上而下 = 最高层 → 最低层（层为高度方向） -->
                <div v-for="(rowCells, fi) in frontRows(r - 1)" :key="fi" class="front-row">
                  <span class="floor-label">F{{ floors - fi }}</span>
                  <div
                    v-for="(cell, ci) in rowCells"
                    :key="ci"
                    class="front-cell"
                    :class="cellClass(cell.status)"
                  >{{ cell.label }}</div>
                </div>
              </div>
            </div>
            <div class="legend">
              <span><i class="dot cell-empty"></i>空</span>
              <span><i class="dot cell-occupied"></i>占用</span>
              <span><i class="dot cell-reserved"></i>预留</span>
            </div>
          </div>
        </div>
      </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useNodeData } from '@/composables/useNodeData'
import { useDisplayMode } from '@/composables/useDisplayMode'
import NodeMinimalView from './NodeMinimalView.vue'

const props = defineProps<{
  node: any
  graph: any
}>()

const { isMinimal } = useDisplayMode()

/**
 * 货架三维模型：
 * - rows   排（深度方向）：单深位 = 1，双深位 = 2
 * - cols   列（宽度方向）
 * - floors 层（高度方向）
 * 库位编号规则：排_列_层（如 1_3_2 表示第 1 排第 3 列第 2 层）
 */
const { name, rows, cols, floors } = useNodeData(props.node, {
  name: '货架-A01',
  rows: 1, // 默认单深位
  cols: 6,
  floors: 4,
})

/** 生成空 3D 网格：[floor][row][col] -> { status } */
function createGrid(r: number, c: number, f: number) {
  return Array.from({ length: f }, () =>
    Array.from({ length: r }, () =>
      Array.from({ length: c }, () => ({ status: 'empty' }))
    )
  )
}

/** 校验网格维度是否与当前 rows/cols/floors 一致 */
function matchesDims(grids: any, r: number, c: number, f: number): boolean {
  return (
    Array.isArray(grids) &&
    grids.length === f &&
    grids.every((fl: any) =>
      Array.isArray(fl) &&
      fl.length === r &&
      fl.every((row: any) => Array.isArray(row) && row.length === c)
    )
  )
}

// floorGrids：三维数组 [floor][row][col]
const initialData = props.node?.getData() || {}
const floorGrids = ref<any[][][]>(
  matchesDims(initialData.floorGrids, rows.value, cols.value, floors.value)
    ? initialData.floorGrids
    : createGrid(rows.value, cols.value, floors.value)
)

// 维度变化（属性面板编辑）时重建网格，并尽量保留重叠区域状态
watch([rows, cols, floors], ([newR, newC, newF], [oldR, oldC, oldF]) => {
  if (newR === oldR && newC === oldC && newF === oldF) return
  const old = floorGrids.value
  const next = createGrid(newR, newC, newF)
  for (let f = 0; f < Math.min(old.length, newF); f++) {
    for (let r = 0; r < Math.min(old[f]?.length ?? 0, newR); r++) {
      for (let c = 0; c < Math.min(old[f]?.[r]?.length ?? 0, newC); c++) {
        next[f][r][c] = old[f][r][c]
      }
    }
  }
  floorGrids.value = next
})

// 数据绑定推送：仅接受维度匹配的 floorGrids（否则沿用本地重建的网格）
const onGridChange = ({ current }: { current: any }) => {
  const newData = current?.getData?.() || current || props.node?.getData()
  if (newData?.floorGrids && matchesDims(newData.floorGrids, rows.value, cols.value, floors.value)) {
    floorGrids.value = newData.floorGrids
  }
}
props.node?.on('change:data', onGridChange)
onBeforeUnmount(() => {
  props.node?.off('change:data', onGridChange)
})

// ===== 俯视图：rows×cols，每格聚合该列（层方向）占用情况 =====
const topCells = computed(() => {
  const cells: { occupied: number; status: string }[] = []
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      let occupied = 0
      let hasReserved = false
      for (let f = 0; f < floors.value; f++) {
        const st = floorGrids.value[f]?.[r]?.[c]?.status
        if (st === 'occupied') occupied++
        else if (st === 'reserved') hasReserved = true
      }
      cells.push({
        occupied,
        status: hasReserved ? 'reserved' : occupied > 0 ? 'occupied' : 'empty',
      })
    }
  }
  return cells
})

// ===== 正视图：指定排 r，返回 层×列 网格（首行为最高层），格内为库位编号 排_列_层 =====
function frontRows(r: number) {
  const result: { status: string; label: string }[][] = []
  for (let f = floors.value - 1; f >= 0; f--) {
    const rowCells: { status: string; label: string }[] = []
    for (let c = 0; c < cols.value; c++) {
      const st = floorGrids.value[f]?.[r]?.[c]?.status || 'empty'
      rowCells.push({ status: st, label: `${r + 1}_${c + 1}_${f + 1}` })
    }
    result.push(rowCells)
  }
  return result
}

// ===== 统计 =====
const totalCells = computed(() => rows.value * cols.value * floors.value)
const occupiedCells = computed(() => {
  let count = 0
  for (const floor of floorGrids.value) {
    for (const row of floor) {
      for (const cell of row) {
        if (cell?.status === 'occupied') count++
      }
    }
  }
  return count
})
const utilization = computed(() =>
  totalCells.value === 0 ? 0 : Math.round((occupiedCells.value / totalCells.value) * 100)
)

/** 深位标签：rows>=2 为双深位，否则单深位 */
const depthLabel = computed(() => (rows.value >= 2 ? '双深位' : '单深位'))

const cellClass = (status: string) => ({
  'cell-empty': status === 'empty',
  'cell-occupied': status === 'occupied',
  'cell-reserved': status === 'reserved',
})

// 正视图弹窗开关
const showFront = ref(false)

/**
 * 双击打开正视图。
 * 监听图级 cell:dblclick 而非节点内容上的原生 dblclick：
 * 节点被选中后，X6 的选中框覆盖层（x6-widget-selection-box）会拦截第二次点击，
 * 导致原生 dblclick 无法到达节点内容 div；图级事件由 X6 内部追踪，不受影响。
 */
const onCellDblClick = ({ cell }: { cell: any }) => {
  if (cell?.id === props.node?.id) {
    showFront.value = true
  }
}
props.graph?.on('cell:dblclick', onCellDblClick)
onBeforeUnmount(() => {
  props.graph?.off('cell:dblclick', onCellDblClick)
})
</script>

<style scoped>
.rack-node {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  background: var(--panel-bg);
  border-radius: 8px;
  border: 2px solid #8c8c8c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  user-select: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
  overflow: hidden;
}
.rack-header {
  display: flex;
  align-items: center;
  gap: 5px;
}
.rack-icon { font-size: 14px; }
.rack-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rack-dim {
  font-size: 9px;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: 3px;
  padding: 1px 4px;
  white-space: nowrap;
}
.top-grid {
  flex: 1;
  display: grid;
  gap: 3px;
  align-content: center;
}
.top-cell {
  min-height: 22px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  transition: background 0.3s;
}
.rack-info {
  display: flex;
  gap: 8px;
  font-size: 9px;
  color: var(--text-muted);
  justify-content: center;
}
.rack-hint {
  font-size: 9px;
  color: var(--text-muted);
  text-align: center;
}
.cell-empty { background: var(--statusbar-bg); border: 1px solid var(--border-color); color: var(--text-muted); }
.cell-occupied { background: #52c41a; border: 1px solid #389e0d; color: #fff; }
.cell-reserved { background: #faad14; border: 1px solid #d48806; color: #fff; }

/* ===== 正视图弹窗 ===== */
.rack-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.rack-modal {
  background: var(--panel-bg);
  border-radius: 10px;
  width: min(92vw, 560px);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}
.modal-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.modal-close {
  border: none;
  background: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}
.modal-close:hover { color: var(--text-primary); }
.modal-body {
  padding: 14px 16px;
  overflow: auto;
}
.front-section { margin-bottom: 14px; }
.front-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: 6px;
}
.front-row {
  display: flex;
  gap: 3px;
  margin-bottom: 3px;
}
.floor-label {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-muted);
}
.col-head {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 600;
}
.front-cell {
  width: 46px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
}
.legend {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: middle;
}
</style>
