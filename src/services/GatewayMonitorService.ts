// ========== 网关监控服务（数据源健康探测）==========
// 用途：给「监控界面」提供某个数据源的“健康报告”——
//   1. 能否连上（连通性 + 建连耗时）
//   2. 设备连接状态（Rust 网关会话的 gateway://status 回报）
//   3. 绑定到该数据源的点位实时值
//   4. 错误/告警记录
// 特点：它独立于业务数据链路，只做“观测”不改动数据；
//       全部协议（含演示模式）统一经 Rust 网关 IPC 探测，
//       WebView 不直接发起任何协议连接。

import { IpcGatewayService } from './IpcGatewayService'
import { buildDeviceConfig } from '@/platform/deviceConfig'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DataSource } from '@/stores/dataSource'

/** gateway://status 事件载荷（与 Rust StatusEvent 对齐） */
interface IpcStatusPayload {
    deviceId: string
    connected: boolean
    message: string
}

/** 监控连接状态 */
export type MonitorStatus = 'idle' | 'connecting' | 'online' | 'offline'

/** 单个数据点的实时读数 */
export interface PointReading {
    value: number | string | null
    quality: string
    timestamp: number
}

/**
 * 一个数据源的监控快照。
 * 每次状态变化整体拷贝抛出（不可变），便于上层直接赋值给 reactive 触发更新。
 */
export interface MonitorState {
    status: MonitorStatus
    /** 设备连接状态：Rust 网关会话回报；true=已连接 false=未连接 null=未知 */
    deviceConnected: boolean | null
    deviceMessage: string
    /** 建连耗时（ms） */
    latencyMs: number | null
    /** 数据点实时读数（pointId → reading） */
    points: Record<string, PointReading>
    /** 最近错误/告警（最新在前，最多保留 MAX_ERRORS 条） */
    errors: string[]
    /** 最近一次状态更新时间戳 */
    updatedAt: number
}

const MAX_ERRORS = 20
/** 数据点高频更新的抛出节流间隔（连接/设备/错误变化立即抛出） */
const EMIT_THROTTLE_MS = 500

/**
 * 数据源网关 / 服务监控探针
 *
 * 独立于业务数据服务（useDataService），专为「监控界面」提供只读探测，覆盖四类信息：
 * - 连通性：建连成功 / 断开，附建连耗时；
 * - 设备状态：Rust 网关会话的 gateway://status 事件回报；
 * - 数据点实时值：订阅绑定到该数据源的点位，记录 value / quality / timestamp；
 * - 错误告警：连接失败、设备未连接、坏质量（bad）帧等。
 *
 * 探测方式（与业务链路一致）：全部协议经 Rust 原生网关 IPC 探测——
 * IpcGatewayService 建立独立监控会话（deviceId 前缀 mon:），
 * 监听 gateway://status 获取连接状态，订阅回调记录点位读数；
 * 重连由引擎侧指数退避自动完成。
 *
 * 每次状态变化通过 onChange 抛出一份不可变快照；数据点高频更新按 EMIT_THROTTLE_MS 节流。
 */
export class GatewayMonitorService {
    private ds: DataSource
    private pointIds: string[]
    private onChange: (s: MonitorState) => void

    private state: MonitorState
    /** Tauri IPC 监控会话（全部协议统一探测） */
    private ipcSvc: IpcGatewayService | null = null
    private ipcUnlisten: UnlistenFn | null = null
    private stopped = false
    private lastEmit = 0
    private t0 = 0

    constructor(ds: DataSource, pointIds: string[], onChange: (s: MonitorState) => void) {
        this.ds = ds
        this.pointIds = pointIds
        this.onChange = onChange
        this.state = {
            status: 'idle',
            deviceConnected: null,
            deviceMessage: '',
            latencyMs: null,
            points: {},
            errors: [],
            updatedAt: Date.now(),
        }
    }

    /** 启动监控 */
    start() {
        this.stopped = false
        this.setStatus('connecting')
        void this.startIpcGateway()
    }

    /** 停止监控并释放全部资源 */
    stop() {
        this.stopped = true
        if (this.ipcUnlisten) {
            this.ipcUnlisten()
            this.ipcUnlisten = null
        }
        if (this.ipcSvc) {
            this.ipcSvc.disconnect()
            this.ipcSvc = null
        }
        this.state.status = 'idle'
        this.state.deviceConnected = null
        this.emit(true)
    }

    // ---------- Tauri IPC（全部协议统一探测） ----------

    /**
     * 经 Rust 原生网关探测。
     *
     * buildDeviceConfig 按数据源类型映射：演示模式 → DemoAdapter（无端口），
     * 真实模式 → Rust 原生客户端接管（Web 协议连接外部服务、
     * Modbus/S7/OPC 原生 TCP 直连设备）。
     *
     * 监控会话使用独立 deviceId（mon: 前缀），与业务链路的会话隔离，
     * 互不影响对方的订阅；重连由引擎侧指数退避自动完成，
     * 状态翻转经 gateway://status 事件回报。
     */
    private async startIpcGateway() {
        this.t0 = performance.now()
        const deviceId = `mon:${this.ds.id}`
        try {
            // 先登记状态监听再创建会话，避免漏掉首个状态事件
            this.ipcUnlisten = await listen<IpcStatusPayload>('gateway://status', (e) => {
                if (e.payload.deviceId !== deviceId) return
                const { connected, message } = e.payload
                this.state.deviceConnected = connected
                this.state.deviceMessage = message || ''
                if (connected) {
                    if (this.state.status !== 'online') {
                        this.state.latencyMs = Math.round(performance.now() - this.t0)
                        this.setStatus('online')
                    }
                } else {
                    if (message) this.pushError(`设备未连接：${message}`)
                    if (this.state.status !== 'offline') this.setStatus('offline')
                }
                this.emit(true)
            })
        } catch (e: any) {
            this.pushError(`IPC 监听注册失败：${e?.message || e}`)
            this.setStatus('offline')
            return
        }
        if (this.stopped) {
            this.ipcUnlisten()
            this.ipcUnlisten = null
            return
        }

        const config = buildDeviceConfig(this.ds.type, this.ds.url, this.ds.config)
        const svc = new IpcGatewayService(deviceId, config, 'Monitor')
        this.ipcSvc = svc
        for (const p of this.pointIds) {
            svc.subscribe(p, (pt) => this.recordPoint(p, pt.value, pt.quality || 'good', pt.timestamp))
        }
    }

    // ---------- 公共辅助 ----------
    private recordPoint(pointId: string, value: number | string | null, quality: string, timestamp: number) {
        this.state.points[pointId] = { value, quality, timestamp }
        if (quality === 'bad') this.pushError(`点位 ${pointId} 质量异常（bad）`)
        this.emit(false)
    }

    private setStatus(status: MonitorStatus) {
        this.state.status = status
        this.emit(true)
    }

    private pushError(msg: string) {
        const line = `${new Date().toLocaleTimeString()} ${msg}`
        // 连续相同错误去重（避免坏质量帧刷屏）
        if (this.state.errors[0]?.endsWith(msg)) return
        this.state.errors.unshift(line)
        if (this.state.errors.length > MAX_ERRORS) this.state.errors.length = MAX_ERRORS
    }

    /** 抛出快照：force=true 立即抛；否则按节流间隔抛（数据点高频更新） */
    private emit(force: boolean) {
        const now = Date.now()
        if (!force && now - this.lastEmit < EMIT_THROTTLE_MS) return
        this.lastEmit = now
        this.state.updatedAt = now
        // 拷贝一份不可变快照，确保上层 reactive 赋值触发更新
        this.onChange({
            ...this.state,
            points: { ...this.state.points },
            errors: [...this.state.errors],
        })
    }
}
