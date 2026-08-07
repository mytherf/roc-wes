// ========== IPC 网关数据服务（Tauri 桌面运行时专用）==========
// 在桌面版（Tauri）里，浏览器版本无法直连的工业协议（Modbus/S7/OPC UA）
// 由 Rust 原生网关直接实现。前端通过 Tauri 的 IPC 机制调用 Rust 命令：
//   - invoke('gateway_connect', ...)  → 请求建立设备会话
//   - listen('gateway://telemetry')   → 接收 Rust 推来的实时数据
// 本类实现了与 WebSocketService 相同的 IDataService 接口，
// 因此上层代码无需区分“浏览器”还是“桌面”，用法完全一样。

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

import { invoke } from '@tauri-apps/api/core' // Tauri IPC：调用 Rust 侧命令
import { listen, type UnlistenFn } from '@tauri-apps/api/event' // Tauri IPC：监听 Rust 侧事件
import type { IDataService, DataPoint, DataCallback } from './DataService'

/** 设备配置判别联合，与 Rust gateway_core::config::DeviceConfig 一一对应 */
export type DeviceConfig =
    | { kind: 'modbus'; host: string; port: number; unitId: number; pollIntervalMs: number } // Modbus TCP 参数
    | { kind: 's7'; host: string; port: number; rack: number; slot: number; pollIntervalMs: number } // 西门子 S7 参数
    | { kind: 'opc'; endpoint: string; pollIntervalMs: number } // OPC UA 端点
    | { kind: 'demo'; pollIntervalMs: number } // 演示模式（不连真实设备）

/** gateway://status 事件载荷：设备连接状态变化 */
interface StatusPayload {
    deviceId: string // 哪个设备会话
    connected: boolean // 是否连接成功
    message: string // 附带信息（如错误原因）
}

/** gateway://telemetry 事件载荷（按轮询周期批量）
 * Rust 每轮询一次就批量推送一批点值，减少 IPC 开销 */
interface TelemetryPointPayload {
    pointId: string
    value: number | string | boolean
    timestamp: number
    quality: 'good' | 'bad' | 'uncertain'
}
interface TelemetryBatchPayload {
    deviceId: string
    points: TelemetryPointPayload[] // 本次轮询到的一批数据点
}

export class IpcGatewayService implements IDataService {
    private deviceId: string // 设备会话 ID（对应 Rust 侧一次连接）
    private config: DeviceConfig // 设备连接参数
    private tag: string // 日志标签
    private callbacks = new Map<string, DataCallback[]>() // 点 ID → 回调列表
    private connected = false
    /** 命令通道是否就绪（gateway_connect 已发出） */
    private ready = false
    /** 就绪前登记的订阅，待连接建立后补发
     * （connect 是异步的，期间 subscribe 可能先被调用） */
    private pendingSubscriptions = new Set<string>()
    private unlistenStatus: UnlistenFn | null = null // 注销 status 监听的函数
    private unlistenTelemetry: UnlistenFn | null = null // 注销 telemetry 监听的函数

    constructor(deviceId: string, config: DeviceConfig, tag = 'IPC') {
        this.deviceId = deviceId
        this.config = config
        this.tag = tag
        void this.start() // 异步启动（不阻塞构造）
    }

    /** 登记事件监听并请求建立设备会话 */
    private async start() {
        try {
            // 监听设备连接状态事件（只处理本设备的消息）
            this.unlistenStatus = await listen<StatusPayload>('gateway://status', (e) => {
                if (e.payload.deviceId !== this.deviceId) return
                this.connected = e.payload.connected
                if (e.payload.connected) {
                    console.log(`[${this.tag}] 设备已连接:`, e.payload.message || '')
                } else {
                    console.warn(`[${this.tag}] 设备未连接:`, e.payload.message || '')
                }
            })
            // 监听遥测数据事件：批量遍历并分发给各点回调
            this.unlistenTelemetry = await listen<TelemetryBatchPayload>('gateway://telemetry', (e) => {
                if (e.payload.deviceId !== this.deviceId) return
                for (const p of e.payload.points) {
                    const cbs = this.callbacks.get(p.pointId)
                    if (!cbs || cbs.length === 0) continue // 无人订阅则跳过
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
            // 请求 Rust 建立设备会话
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

    // 向 Rust 发起订阅请求
    private async sendSubscribe(pointId: string) {
        try {
            await invoke('gateway_subscribe', { deviceId: this.deviceId, pointId })
        } catch (err) {
            console.warn(`[${this.tag}] 订阅失败 ${pointId}:`, err)
        }
    }

    // 向 Rust 发起退订请求
    private async sendUnsubscribe(pointId: string) {
        try {
            await invoke('gateway_unsubscribe', { deviceId: this.deviceId, pointId })
        } catch {
            // 会话可能已销毁，忽略
        }
    }

    // 订阅：登记回调；就绪则立即订阅，否则记入待办（连接建立后补发）
    subscribe(pointId: string, callback: DataCallback): void {
        if (!this.callbacks.has(pointId)) this.callbacks.set(pointId, [])
        this.callbacks.get(pointId)!.push(callback)
        if (this.ready) {
            void this.sendSubscribe(pointId)
        } else {
            this.pendingSubscriptions.add(pointId)
        }
    }

    // 退订：移除回调并通知 Rust
    unsubscribe(pointId: string): void {
        this.callbacks.delete(pointId)
        if (this.pendingSubscriptions.has(pointId)) {
            // 还没真正订阅过，直接从待办中删除即可
            this.pendingSubscriptions.delete(pointId)
        } else if (this.ready) {
            void this.sendUnsubscribe(pointId)
        }
    }

    isConnected(): boolean {
        return this.connected
    }

    // 断开：清空状态、注销监听、通知 Rust 销毁会话
    disconnect(): void {
        this.callbacks.clear()
        this.pendingSubscriptions.clear()
        this.unlistenStatus?.() // 调用注销函数停止监听
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
