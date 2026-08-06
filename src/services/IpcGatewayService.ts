/**
 * IPC 网关数据服务（Tauri 桌面运行时专用）
 *
 * 工业协议（Modbus / S7 / OPC UA）为原生 TCP，浏览器无法直连。
 * 浏览器时代经 Node WebSocket 网关桥接；迁移 Tauri 后改由 Rust 核心
 * （gateway-engine + DeviceAdapter）原生实现，前端通过 Tauri IPC 访问：
 *   - 命令：gateway_connect / gateway_subscribe / gateway_unsubscribe / gateway_disconnect
 *   - 事件：gateway://status、gateway://telemetry（camelCase 载荷，与 Rust serde 对齐）
 *
 * 本类实现与 WebSocketService 相同的 IDataService 接口，
 * 对上层（useDataService / 节点绑定）完全透明。
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { IDataService, DataPoint, DataCallback } from './DataService'

/** 设备配置判别联合，与 Rust gateway_core::config::DeviceConfig 一一对应 */
export type DeviceConfig =
    | { kind: 'modbus'; host: string; port: number; unitId: number; pollIntervalMs: number }
    | { kind: 's7'; host: string; port: number; rack: number; slot: number; pollIntervalMs: number }
    | { kind: 'opc'; endpoint: string; pollIntervalMs: number }
    | { kind: 'demo'; pollIntervalMs: number }

/** gateway://status 事件载荷 */
interface StatusPayload {
    deviceId: string
    connected: boolean
    message: string
}

/** gateway://telemetry 事件载荷（按轮询周期批量） */
interface TelemetryPointPayload {
    pointId: string
    value: number | string | boolean
    timestamp: number
    quality: 'good' | 'bad' | 'uncertain'
}
interface TelemetryBatchPayload {
    deviceId: string
    points: TelemetryPointPayload[]
}

export class IpcGatewayService implements IDataService {
    private deviceId: string
    private config: DeviceConfig
    private tag: string
    private callbacks = new Map<string, DataCallback[]>()
    private connected = false
    /** 命令通道是否就绪（gateway_connect 已发出） */
    private ready = false
    /** 就绪前登记的订阅，待连接建立后补发 */
    private pendingSubscriptions = new Set<string>()
    private unlistenStatus: UnlistenFn | null = null
    private unlistenTelemetry: UnlistenFn | null = null

    constructor(deviceId: string, config: DeviceConfig, tag = 'IPC') {
        this.deviceId = deviceId
        this.config = config
        this.tag = tag
        void this.start()
    }

    /** 登记事件监听并请求建立设备会话 */
    private async start() {
        try {
            this.unlistenStatus = await listen<StatusPayload>('gateway://status', (e) => {
                if (e.payload.deviceId !== this.deviceId) return
                this.connected = e.payload.connected
                if (e.payload.connected) {
                    console.log(`[${this.tag}] 设备已连接:`, e.payload.message || '')
                } else {
                    console.warn(`[${this.tag}] 设备未连接:`, e.payload.message || '')
                }
            })
            this.unlistenTelemetry = await listen<TelemetryBatchPayload>('gateway://telemetry', (e) => {
                if (e.payload.deviceId !== this.deviceId) return
                for (const p of e.payload.points) {
                    const cbs = this.callbacks.get(p.pointId)
                    if (!cbs || cbs.length === 0) continue
                    const point: DataPoint = {
                        id: p.pointId,
                        // DataPoint.value 声明为 number|string；线圈布尔值按原样透传，
                        // 由节点 transform / Number() 自行处理
                        value: p.value as DataPoint['value'],
                        timestamp: p.timestamp,
                        quality: p.quality,
                    }
                    for (const cb of cbs) cb(point)
                }
            })
            await invoke('gateway_connect', { deviceId: this.deviceId, config: this.config })
            this.ready = true
            // 补发连接建立前登记的订阅
            for (const pointId of [...this.pendingSubscriptions]) {
                this.pendingSubscriptions.delete(pointId)
                await this.sendSubscribe(pointId)
            }
        } catch (err) {
            console.error(`[${this.tag}] 连接失败:`, err)
        }
    }

    private async sendSubscribe(pointId: string) {
        try {
            await invoke('gateway_subscribe', { deviceId: this.deviceId, pointId })
        } catch (err) {
            console.warn(`[${this.tag}] 订阅失败 ${pointId}:`, err)
        }
    }

    private async sendUnsubscribe(pointId: string) {
        try {
            await invoke('gateway_unsubscribe', { deviceId: this.deviceId, pointId })
        } catch {
            // 会话可能已销毁，忽略
        }
    }

    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) this.callbacks.set(pointId, [])
        this.callbacks.get(pointId)!.push(callback)
        if (this.ready) {
            void this.sendSubscribe(pointId)
        } else {
            this.pendingSubscriptions.add(pointId)
        }
    }

    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        if (this.pendingSubscriptions.has(pointId)) {
            this.pendingSubscriptions.delete(pointId)
        } else if (this.ready) {
            void this.sendUnsubscribe(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    disconnect(): void {
        this.callbacks.clear()
        this.pendingSubscriptions.clear()
        this.unlistenStatus?.()
        this.unlistenTelemetry?.()
        this.unlistenStatus = null
        this.unlistenTelemetry = null
        this.connected = false
        this.ready = false
        void invoke('gateway_disconnect', { deviceId: this.deviceId }).catch(() => {
            // 会话可能已不存在，忽略
        })
    }
}
