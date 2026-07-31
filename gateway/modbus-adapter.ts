/**
 * Modbus 设备适配器（供 startGateway 使用）
 *
 * 通过 modbus-serial 以 Modbus TCP 连接设备 / 仿真从站。
 * 读取优化：将同类型、地址连续的数据点合并为一次寄存器批量读取，
 * 减少 TCP 往返次数（原实现逐点串行读取，点数多时延迟线性增长）。
 *
 * pointId 约定：holding:N / input:N / coil:N / discrete:N（N 为 Modbus 地址）。
 */
import ModbusSerial from 'modbus-serial'
import type { DeviceAdapter, PointResult } from './gateway-shared'

export interface ModbusDeviceConfig {
  host: string
  port: number
  unitId: number
  pollInterval: number
}

type RegType = 'holding' | 'input' | 'coil' | 'discrete'

/** 解析 pointId 为寄存器类型与地址；非法返回 null */
function parsePoint(pointId: string): { type: RegType; addr: number } | null {
  const [type, addrStr] = pointId.split(':')
  const addr = parseInt(addrStr, 10)
  if (Number.isNaN(addr)) return null
  if (type !== 'holding' && type !== 'input' && type !== 'coil' && type !== 'discrete') return null
  return { type, addr }
}

export function createModbusAdapter(
  config: ModbusDeviceConfig,
  onStatus: (connected: boolean, message?: string) => void
): DeviceAdapter {
  let client: any = null
  let ready = false

  const modbus = new ModbusSerial()
  modbus.setTimeout(3000)
  modbus
    .connectTCP(config.host, { port: config.port })
    .then(() => {
      modbus.setID(config.unitId)
      client = modbus
      ready = true
      console.log(`[modbus-gateway] 已连接设备 ${config.host}:${config.port} (unitId=${config.unitId})`)
      onStatus(true, '设备已连接')
    })
    .catch((e: any) => {
      console.error(`[modbus-gateway] 连接设备失败: ${e?.message || e}`)
      onStatus(false, `连接失败: ${e?.message || e}`)
    })

  /** 批量读取一段连续地址，返回数值数组 */
  async function readRange(type: RegType, start: number, len: number): Promise<number[]> {
    switch (type) {
      case 'holding': {
        const r = await client.readHoldingRegisters(start, len)
        return Array.from(r.data)
      }
      case 'input': {
        const r = await client.readInputRegisters(start, len)
        return Array.from(r.data)
      }
      case 'coil': {
        const r = await client.readCoils(start, len)
        return Array.from(r.data).map((b: boolean) => (b ? 1 : 0))
      }
      case 'discrete': {
        const r = await client.readDiscreteInputs(start, len)
        return Array.from(r.data).map((b: boolean) => (b ? 1 : 0))
      }
    }
  }

  /** 将同类型连续地址合并为批量读取 */
  async function readBatched(points: string[]): Promise<Record<string, PointResult>> {
    const out: Record<string, PointResult> = {}
    // 按寄存器类型分组
    const groups = new Map<RegType, { pointId: string; addr: number }[]>()
    for (const p of points) {
      const parsed = parsePoint(p)
      if (!parsed) {
        out[p] = { value: null, quality: 'bad', error: `非法点地址: ${p}` }
        continue
      }
      if (!groups.has(parsed.type)) groups.set(parsed.type, [])
      groups.get(parsed.type)!.push({ pointId: p, addr: parsed.addr })
    }
    // 每组按地址排序，切分连续段，逐段批量读取
    for (const [type, items] of groups) {
      items.sort((a, b) => a.addr - b.addr)
      let i = 0
      while (i < items.length) {
        let j = i
        while (j + 1 < items.length && items[j + 1].addr === items[j].addr + 1) j++
        const seg = items.slice(i, j + 1)
        const start = seg[0].addr
        try {
          const values = await readRange(type, start, seg.length)
          for (let k = 0; k < seg.length; k++) {
            out[seg[k].pointId] = { value: values[k], quality: 'good' }
          }
        } catch (e: any) {
          for (const it of seg) {
            out[it.pointId] = { value: null, quality: 'bad', error: e?.message }
          }
        }
        i = j + 1
      }
    }
    return out
  }

  return {
    isReady: () => ready,
    readAll: (points) => {
      if (!ready || !client) return Promise.resolve({})
      return readBatched(points)
    },
    disconnect: () => {
      ready = false
      if (client) {
        try {
          client.close(() => {})
        } catch {
          /* 忽略关闭错误 */
        }
        client = null
      }
    },
  }
}
