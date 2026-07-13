<template>
  <div class="status-bar">
    <!-- 左侧：授权状态（点击弹出授权管理） -->
    <div class="status-item" @click="showLicenseModal = true">
      <span class="status-icon">{{ status.isLicensed ? '🔓' : '🔒' }}</span>
      <span class="status-text">
        {{ status.isLicensed ? '已授权' : '未授权（试用版）' }}
      </span>
      <span v-if="status.isLicensed && status.daysRemaining !== null" class="status-days">
        剩余 {{ status.daysRemaining }} 天
      </span>
      <span v-else-if="status.isLicensed && status.daysRemaining === null" class="status-days">
        永久授权
      </span>
      <button class="status-btn" @click.stop="showLicenseModal = true">
        授权管理
      </button>
    </div>

    <!-- 中间：节点/边统计 -->
    <div class="status-item">
      <span>📊 节点: {{ nodeCount }}</span>
      <span style="margin-left: 12px;">🔗 边: {{ edgeCount }}</span>
    </div>

    <!-- 右侧：版本信息 -->
    <div class="status-item" style="margin-left: auto;">
      <span>v{{ version }}</span>
    </div>

    <!-- 授权管理模态框 -->
    <div v-if="showLicenseModal" class="modal-overlay" @click.self="showLicenseModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <span>授权管理</span>
          <button class="modal-close" @click="showLicenseModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="license-status-detail">
            <p v-if="status.isLicensed">
              ✅ 已授权至 <strong>{{ status.license?.subject }}</strong>
              <span v-if="status.license?.expiresAt">
                ，{{ status.daysRemaining !== null ? `剩余 ${status.daysRemaining} 天` : '永久有效' }}
              </span>
            </p>
            <p v-else>⏳ 当前为试用版，请输入授权码激活完整功能。</p>
          </div>
          <div class="license-input-area">
            <input
                v-model="activationCode"
                type="text"
                placeholder="请输入授权码..."
                class="license-input"
                @keyup.enter="handleActivate"
            />
            <button class="license-btn" :disabled="isActivating || !activationCode.trim()" @click="handleActivate">
              {{ isActivating ? '验证中...' : '激活' }}
            </button>
            <button class="license-btn outline" @click="handleClear" v-if="status.isLicensed">
              注销
            </button>
          </div>
          <div v-if="errorMessage" class="license-error">{{ errorMessage }}</div>
          <div v-if="successMessage" class="license-success">{{ successMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { LicenseService } from '@/services/ecc/LicenseService'
import type { LicenseStatus } from '@/types/ecc/license'

// ===================== Props =====================
const props = defineProps<{
  graph: any // X6 Graph 实例，用于统计节点数
}>()

// ===================== 状态 =====================
const status = ref<LicenseStatus>(LicenseService.getStatus())
const activationCode = ref('')
const isActivating = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const showLicenseModal = ref(false)

// 版本号（可从环境变量读取）
const version = import.meta.env.VITE_APP_VERSION || '1.0.0'

// 节点/边统计
const nodeCount = ref(0)
const edgeCount = ref(0)
let statsTimer: number | null = null

// ===================== 方法 =====================
/**
 * 更新节点/边统计
 */
function updateStats() {
  if (props.graph) {
    nodeCount.value = props.graph.getNodes().length
    edgeCount.value = props.graph.getEdges().length
  }
}

/**
 * 刷新授权状态
 */
function refreshStatus() {
  status.value = LicenseService.getStatus()
}

/**
 * 激活授权
 */
async function handleActivate() {
  if (!activationCode.value.trim() || isActivating.value) return
  isActivating.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const result = LicenseService.activate(activationCode.value.trim())
    // 模拟异步延迟（提升 UX）
    await new Promise(resolve => setTimeout(resolve, 300))
    if (result) {
      successMessage.value = '✅ 授权激活成功！'
      refreshStatus()
      activationCode.value = ''
      // 可选：自动关闭模态框
      // showLicenseModal.value = false
    } else {
      errorMessage.value = '❌ 授权码无效，请检查后重试'
    }
  } catch (error) {
    errorMessage.value = `❌ 激活失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    isActivating.value = false
  }
}

/**
 * 注销授权
 */
function handleClear() {
  if (confirm('确定要注销授权吗？')) {
    LicenseService.clear()
    refreshStatus()
    successMessage.value = ''
    errorMessage.value = ''
    // 关闭模态框
    showLicenseModal.value = false
  }
}

// ===================== 生命周期 =====================
onMounted(() => {
  // 尝试从存储恢复授权
  LicenseService.restoreFromStorage()
  refreshStatus()
  updateStats()
  // 定时更新统计（每 500ms）
  statsTimer = window.setInterval(updateStats, 500)
})

onBeforeUnmount(() => {
  if (statsTimer) {
    clearInterval(statsTimer)
    statsTimer = null
  }
})

// 暴露刷新方法给父组件
defineExpose({ refreshStatus })
</script>

<style scoped>
/* 状态栏整体样式 */
.status-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 6px 20px;
  background: #f5f5f5;
  border-top: 1px solid #e8e8e8;
  font-size: 13px;
  color: #333;
  flex-shrink: 0;
  height: 36px;
  user-select: none;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-icon {
  font-size: 16px;
}
.status-text {
  font-weight: 500;
}
.status-days {
  font-size: 12px;
  color: #52c41a;
  background: #f6ffed;
  padding: 0 10px;
  border-radius: 12px;
}
.status-btn {
  padding: 2px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}
.status-btn:hover {
  border-color: #1890ff;
  color: #1890ff;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.modal-content {
  background: #fff;
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  padding: 0;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 16px;
  font-weight: 600;
}
.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
}
.modal-close:hover {
  color: #333;
}
.modal-body {
  padding: 24px;
}
.license-status-detail {
  margin-bottom: 16px;
  font-size: 14px;
}
.license-input-area {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.license-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  min-width: 120px;
}
.license-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}
.license-btn {
  padding: 8px 20px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.license-btn:hover:not(:disabled) {
  background: #40a9ff;
}
.license-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.license-btn.outline {
  background: transparent;
  color: #ff4d4f;
  border: 1px solid #ff4d4f;
}
.license-btn.outline:hover {
  background: #fff1f0;
}
.license-error {
  margin-top: 12px;
  font-size: 13px;
  color: #ff4d4f;
}
.license-success {
  margin-top: 12px;
  font-size: 13px;
  color: #52c41a;
}
</style>