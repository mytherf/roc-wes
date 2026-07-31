/**
 * OPC UA 设备适配器（供 startGateway 使用）
 *
 * 通过 node-opcua（纯 JS OPC UA 客户端）连接服务器 / 仿真服务端。
 * 安全策略：None（本地仿真/内网；生产可按需扩展证书与签名）。
 *
 * pointId 约定：OPC UA NodeId 字符串，如 ns=2;s=Ramp 或 ns=2;i=1001。
 */
import { OPCUAClient, MessageSecurityMode, SecurityPolicy } from 'node-opcua'
import type { DeviceAdapter, PointResult } from './gateway-shared'

export interface OpcDeviceConfig {
  endpoint: string
  pollInterval: number
}

export function createOpcAdapter(
  config: OpcDeviceConfig,
  onStatus: (connected: boolean, message?: string) => void
): DeviceAdapter {
  let client: any = null
  let session: any = null
  let ready = false

  ;(async () => {
    try {
      const c = OPCUAClient.create({
        endpointMustExist: false,
        keepSessionAlive: true,
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
        connectionStrategy: { initialDelay: 500, maxRetry: 1 },
      })
      await c.connect(config.endpoint)
      session = await c.createSession()
      client = c
      ready = true
      console.log(`[opc-gateway] 已连接设备 ${config.endpoint}`)
      onStatus(true, '设备已连接')
    } catch (e: any) {
      console.error(`[opc-gateway] 连接设备失败: ${e?.message || e}`)
      onStatus(false, `连接失败: ${e?.message || e}`)
    }
  })()

  return {
    isReady: () => ready,
    readAll: async (points) => {
      const out: Record<string, PointResult> = {}
      if (!ready || !session) return out
      for (const p of points) {
        try {
          const dataValue = await session.readVariableValue(p)
          if (dataValue.statusCode && dataValue.statusCode.isNotGood && dataValue.statusCode.isNotGood()) {
            throw new Error(`节点状态异常: ${dataValue.statusCode.toString()}`)
          }
          out[p] = { value: dataValue.value?.value, quality: 'good' }
        } catch (e: any) {
          out[p] = { value: null, quality: 'bad', error: e?.message }
        }
      }
      return out
    },
    disconnect: () => {
      ready = false
      ;(async () => {
        try {
          if (session) await session.close()
        } catch {
          /* 忽略 */
        }
        try {
          if (client) await client.disconnect()
        } catch {
          /* 忽略 */
        }
        session = null
        client = null
      })()
    },
  }
}
