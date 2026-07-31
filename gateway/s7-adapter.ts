/**
 * 西门子 S7 设备适配器（供 startGateway 使用）
 *
 * 通过 nodes7（纯 JS S7comm 客户端）连接 PLC / 仿真服务端。
 * S7 需先向连接登记数据点（addItems），再以 readAllItems 批量读取，
 * 故适配器维护 added / pending 两个集合处理「连接前后订阅」两种时序。
 *
 * pointId 约定：nodes7 地址字符串，如 DB1,REAL0 / MB0 / MW0 / M0.0。
 */
import NodeS7 from 'nodes7'
import type { DeviceAdapter, PointResult } from './gateway-shared'

export interface S7DeviceConfig {
  host: string
  port: number
  rack: number
  slot: number
  pollInterval: number
}

export function createS7Adapter(
  config: S7DeviceConfig,
  onStatus: (connected: boolean, message?: string) => void
): DeviceAdapter {
  const conn = new NodeS7({ silent: true })
  let ready = false
  let reading = false
  /** 上一轮读取结果（读取重入时返回缓存，避免闪烁） */
  let lastResults: Record<string, PointResult> = {}
  /** 已登记到连接的点 */
  const added = new Set<string>()
  /** 连接前已订阅、待连接成功后登记的点 */
  const pending = new Set<string>()

  conn.initiateConnection(
    {
      host: config.host,
      port: config.port,
      rack: config.rack,
      slot: config.slot,
      doNotOptimize: true, // 每个点独立读取，便于仿真按长度编码
    },
    (err: any) => {
      if (err) {
        console.error(`[s7-gateway] 连接设备失败: ${err}`)
        onStatus(false, `连接失败: ${err}`)
        return
      }
      ready = true
      console.log(`[s7-gateway] 已连接设备 ${config.host}:${config.port} (rack=${config.rack} slot=${config.slot})`)
      onStatus(true, '设备已连接')
      // 补发连接前已订阅的点
      for (const p of pending) {
        conn.addItems(p)
        added.add(p)
      }
      pending.clear()
    }
  )

  return {
    isReady: () => ready,
    addPoint: (pointId) => {
      if (ready && !added.has(pointId)) {
        conn.addItems(pointId)
        added.add(pointId)
      } else if (!ready) {
        pending.add(pointId)
      }
    },
    removePoint: (pointId) => {
      pending.delete(pointId)
      if (ready && added.has(pointId)) {
        conn.removeItems(pointId)
        added.delete(pointId)
      }
    },
    readAll: (points) =>
      new Promise<Record<string, PointResult>>((resolve) => {
        if (!ready) {
          resolve({})
          return
        }
        if (reading) {
          resolve(lastResults) // 上一轮尚未完成，返回缓存
          return
        }
        reading = true
        conn.readAllItems((bad: any, values: Record<string, any>) => {
          reading = false
          const out: Record<string, PointResult> = {}
          for (const p of points) {
            const v = values ? values[p] : undefined
            if (v === undefined) {
              // 补全 error 字段（原实现 bad 帧缺少错误描述）
              out[p] = { value: null, quality: 'bad', error: bad ? String(bad) : '读取失败' }
            } else {
              out[p] = { value: v, quality: 'good' }
            }
          }
          lastResults = out
          resolve(out)
        })
      }),
    disconnect: () => {
      ready = false
      try {
        conn.dropConnection()
      } catch {
        /* 忽略 */
      }
    },
  }
}
