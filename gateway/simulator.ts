/**
 * Modbus TCP 仿真从站（软件模拟设备）
 *
 * 用于在没有真实 PLC 的情况下验证「UI 配置 → 独立网关 → Modbus 设备」全链路。
 * 基于 modbus-serial 内置的 ServerTCP 实现一个 Modbus TCP 从站，
 * 寄存器/线圈返回随时间变化的模拟值（三角波扫描），网关读取后即可看到动态数据。
 *
 * 启动：npm run simulator   （默认监听 127.0.0.1:19502，可用环境变量 SIM_PORT / SIM_HOST 覆盖）
 *
 * 寄存器取值约定（与网关 pointId 前缀对应）：
 * - holding:N  → 保持寄存器 地址 N（FC03）
 * - input:N    → 输入寄存器 地址 N（FC04）
 * - coil:N     → 线圈 地址 N（FC01）
 * - discrete:N → 离散输入 地址 N（FC02）
 */
import ModbusSerial from 'modbus-serial'

const PORT = Number(process.env.SIM_PORT || 19502)
const HOST = process.env.SIM_HOST || '127.0.0.1'

/** 由地址生成 0~2π 的相位偏移，使不同寄存器波形错开 */
function phase(addr: number): number {
  return ((addr * 37) % 628) / 100
}

/** 三角波：12s 周期在 100~900 之间线性往返（16 位寄存器范围） */
function triangle(addr: number, t: number): number {
  const period = 12000
  const p = ((t + phase(addr) * 1000) % period) / period
  const tri = p < 0.5 ? p * 2 : 2 - p * 2
  return Math.round(100 + tri * 800)
}

/** ServerTCP 回调向量：返回各地址的模拟值（同步返回数值即可） */
const vector = {
  getInputRegister(addr: number, _unitID: number): number {
    return triangle(addr, Date.now())
  },
  getHoldingRegister(addr: number, _unitID: number): number {
    return triangle(addr, Date.now())
  },
  getCoil(addr: number, _unitID: number): number {
    // 每 3s 翻转一次
    return Math.floor(Date.now() / 3000 + addr) % 2
  },
  getDiscreteInput(addr: number, _unitID: number): number {
    return Math.floor(Date.now() / 3000 + addr) % 2
  },
  setRegister(addr: number, value: number, _unitID: number): void {
    console.log(`[simulator] 写保持寄存器 ${addr} = ${value}`)
  },
  setCoil(addr: number, state: boolean, _unitID: number): void {
    console.log(`[simulator] 写线圈 ${addr} = ${state}`)
  },
}

// 启动 Modbus TCP 从站（unitID 255 表示响应所有从站地址）
new ModbusSerial.ServerTCP(vector, { host: HOST, port: PORT, unitID: 255, debug: false })

console.log(`[simulator] Modbus TCP 仿真从站已启动: ${HOST}:${PORT} (unitID 任意)`)
console.log('[simulator] 示例点：holding:100 / input:200 / coil:0 / discrete:0')
