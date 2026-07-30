/**
 * 内置模拟数据生成器
 *
 * 为各数据源类型分别提供「不同特征」的模拟数据，便于演示区分：
 * - WebSocket：平滑正弦波 + 微小噪声（实时遥测流，1s 推送）
 * - HTTP     ：随机游走（缓慢漂移的测量值，客户端轮询）
 * - SSE      ：锯齿斜升（线性上升后归零，服务端推送流）
 * - MQTT     ：离散设备档位（方波/阶梯，按主题发布）
 * - S7       ：PLC 设定值阶梯跟踪（每 5s 切换目标值并平滑逼近 + 微噪声，模拟 PLC 寄存器）
 * - OPC UA   ：量化阶梯（保持-跳变，每 4s 跳变到 5 为间隔的量化档位，模拟数字化采集节点）
 * - Modbus   ：三角波（12s 周期在 10~90 间线性往返扫描，模拟寄存器连续扫描读数）
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

/**
 * S7（西门子 PLC）：设定值阶梯跟踪
 * 每 5 秒切换一个目标值（由 pointId 相位错开），当前值平滑逼近目标并叠加微噪声，
 * 模拟 PLC 过程寄存器（如温度/压力设定跟踪）。取值限制在 0~100。
 */
export function s7Value(pointId: string, t: number): number {
  const step = Math.floor(t / 5000)
  // 由 pointId 相位 + 步进生成 10~90 的目标设定值
  const target = 10 + ((hashInt(pointId) + step * 17) % 80)
  // 本 5s 窗口内的进度（0~1），用于从上一目标平滑过渡到当前目标
  const frac = (t % 5000) / 5000
  const prevTarget = 10 + ((hashInt(pointId) + (step - 1) * 17) % 80)
  const base = prevTarget + (target - prevTarget) * frac
  const noise = (Math.random() - 0.5) * 3
  return round1(Math.max(0, Math.min(100, base + noise)))
}

/**
 * OPC UA：量化阶梯（保持-跳变）
 * 每 4 秒跳变一次，取值量化为 5 的整数倍（0~100），窗口内保持不变，
 * 模拟 OPC UA 数字化采集节点的离散读数。由 pointId 相位错开。
 */
export function opcValue(pointId: string, t: number): number {
  const step = Math.floor(t / 4000)
  // 量化为 0~100 之间、间隔为 5 的档位（共 21 档）
  const level = (hashInt(pointId) + step * 7) % 21
  return level * 5
}

/**
 * Modbus：三角波（线性往返扫描）
 * 12 秒周期内在 10~90 之间先线性上升再线性下降，循环往返，
 * 模拟 Modbus 寄存器连续扫描读数。由 pointId 相位错开。
 */
export function modbusValue(pointId: string, t: number): number {
  const period = 12000
  const offset = (hashPhase(pointId) / (2 * Math.PI)) * period
  const p = ((t + offset) % period) / period // 0~1
  // 0~0.5 上升、0.5~1 下降，映射到 10~90
  const tri = p < 0.5 ? p * 2 : 2 - p * 2
  return round1(10 + tri * 80)
}
