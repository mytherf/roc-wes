/**
 * 内置模拟数据生成器
 *
 * 为各数据源类型分别提供「不同特征」的模拟数据，便于演示区分：
 * - WebSocket：平滑正弦波 + 微小噪声（实时遥测流，1s 推送）
 * - HTTP     ：随机游走（缓慢漂移的测量值，客户端轮询）
 * - SSE      ：锯齿斜升（线性上升后归零，服务端推送流）
 * - MQTT     ：离散设备档位（方波/阶梯，按主题发布）
 *
 * S7 / OPC UA / Modbus 的演示数据已迁移至 Tauri 桌面端 Rust DemoAdapter。
 */

/** 保留一位小数 */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 由 pointId 生成稳定的整数哈希（用于相位/偏移错开） */
function hashInt(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 由 pointId 生成 0~2π 的相位偏移 */
function hashPhase(str: string): number {
  return (hashInt(str) % 628) / 100
}

/**
 * WebSocket：平滑正弦波 + 微小噪声
 * 取值范围约 20~80，随时间连续变化
 */
export function wsValue(pointId: string, t: number): number {
  const phase = hashPhase(pointId)
  return round1(50 + 30 * Math.sin(t / 5000 + phase) + (Math.random() - 0.5) * 2)
}

/**
 * HTTP：随机游走
 * 在上一次值基础上随机步进，限制在 0~100，呈现缓慢漂移
 */
const httpState = new Map<string, number>()
export function httpValue(pointId: string): number {
  const prev = httpState.get(pointId) ?? 50
  let next = prev + (Math.random() - 0.5) * 12
  next = Math.max(0, Math.min(100, next))
  httpState.set(pointId, next)
  return round1(next)
}

/**
 * SSE：锯齿斜升
 * 10 秒周期内从 0 线性升至 100 后归零
 */
export function sseValue(pointId: string, t: number): number {
  const period = 10000
  const offset = (hashPhase(pointId) / (2 * Math.PI)) * period
  return round1((((t + offset) % period) / period) * 100)
}

/**
 * MQTT：离散设备档位
 * 在 [0, 25, 50, 75, 100] 之间按 3 秒步进切换（方波/阶梯）
 */
const MQTT_STATES = [0, 25, 50, 75, 100]
export function mqttValue(pointId: string, t: number): number {
  const step = Math.floor(t / 3000)
  return MQTT_STATES[(step + hashInt(pointId)) % MQTT_STATES.length]
}
