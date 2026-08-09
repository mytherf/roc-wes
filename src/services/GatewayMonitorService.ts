// ========== 网关监控服务（数据源健康探测）==========
// 用途：给「监控界面」提供某个数据源的“健康报告”——
//   1. 能否连上（连通性 + 建连耗时）
//   2. 工业设备是否就绪（真实网关的设备连接状态）
//   3. 绑定到该数据源的点位实时值
//   4. 错误/告警记录
// 特点：它独立于业务数据链路，只做“观测”不改动数据；
//       内部按数据源类型（WS/HTTP/SSE/MQTT/IPC）分派不同的探测实现。

import { MqttService } from './MqttService'
import { IpcGatewayService } from './IpcGatewayService'
import { buildDeviceConfig, isDemoSource } from '@/platform/deviceConfig'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DataSource, DataSourceType } from '@/stores/dataSource'

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
    /** 设备连接状态：仅工业网关真实模式有意义；true=已连接 false=未连接 null=未知/不适用 */
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
/** 断开后自动重连延迟 */
const RECONNECT_DELAY = 3000
/** MQTT 连接状态轮询间隔 */
const MQTT_POLL_MS = 500

/** 是否为工业协议（真实模式下网关会回报 { type:'status', connected } 设备连接状态） */
function isIndustrialType(t: DataSourceType): boolean {
    return t === 's7' || t === 'opc' || t === 'modbus'
}

/**
 * 数据源网关 / 服务监控探针
 *
 * 独立于业务数据服务（useDataService），专为「监控界面」提供只读探测，覆盖四类信息：
 * - 连通性：建连成功 / 断开 / 自动重连，附建连耗时；
 * - 设备状态：工业网关（S7/OPC UA/Modbus）下发 configure 后解析 { type:'status', connected } 回报；
 * - 数据点实时值：订阅绑定到该数据源的点位，记录 value / quality / timestamp；
 * - 错误告警：连接失败、设备未连接、坏质量（bad）帧等。
 *
 * 各类型探测方式：
 * - 演示模式（任意协议）：与业务链路一致，经 Rust 演示引擎 IPC 探测（DemoAdapter 生成模拟数据）；
 * - s7 / opc / modbus（真实模式）：经 Rust 原生网关 IPC 探测——
 *   IpcGatewayService 建立独立监控会话（deviceId 前缀 mon:），
 *   监听 gateway://status 获取设备连接状态，订阅回调记录点位读数；
 * - websocket：订阅制 WebSocket；
 * - http：fetch 轮询 `${url}?pointId=xxx`；
 * - sse：EventSource 接收推送流；
 * - mqtt：复用 MqttService（mqtt.js），轮询其连接状态。
 *
 * 每次状态变化通过 onChange 抛出一份不可变快照；数据点高频更新按 EMIT_THROTTLE_MS 节流。
 */
export class GatewayMonitorService {
    private ds: DataSource
    private pointIds: string[]
    private onChange: (s: MonitorState) => void

    private state: MonitorState
    private ws: WebSocket | null = null
    private mqttSvc: MqttService | null = null
    /** Tauri IPC 监控会话（工业协议桌面探测） */
    private ipcSvc: IpcGatewayService | null = null
    private ipcUnlisten: UnlistenFn | null = null
    private mqttPollTimer: number | null = null
    private reconnectTimer: number | null = null
    private httpTimers: number[] = []
    private sseSources: EventSource[] = []
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
        // 演示模式（任意协议）与业务链路一致：经 Rust 演示引擎 IPC 探测，
        // 不能直连内置演示标识地址（如 ws://localhost:8080/ws 背后没有本地服务）
        if (isDemoSource(this.ds.type, this.ds.url, this.ds.config)) {
            void this.startIpcGateway()
            return
        }
        switch (this.ds.type) {
            case 'http':
                this.startHttp()
                break
            case 'sse':
                this.startSse()
                break
            case 'mqtt':
                this.startMqtt()
                break
            default:
                // 工业协议经 Rust 原生网关 IPC 探测；其余（websocket）走订阅制 WS
                if (isIndustrialType(this.ds.type)) {
                    void this.startIpcGateway()
                } else {
                    this.startWsSubscribe()
                }
                break
        }
    }

    /** 停止监控并释放全部资源 */
    stop() {
        this.stopped = true
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
        if (this.mqttPollTimer) {
            clearInterval(this.mqttPollTimer)
            this.mqttPollTimer = null
        }
        for (const t of this.httpTimers) clearInterval(t)
        this.httpTimers = []
        for (const es of this.sseSources) es.close()
        this.sseSources = []
        if (this.ws) {
            this.ws.onclose = null
            this.ws.close()
            this.ws = null
        }
        if (this.mqttSvc) {
            this.mqttSvc.disconnect()
            this.mqttSvc = null
        }
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

    // ---------- 订阅制 WebSocket（仅 websocket 类型） ----------
    private startWsSubscribe() {
        this.t0 = performance.now()
        try {
            const ws = new WebSocket(this.ds.url)
            this.ws = ws
            ws.onopen = () => {
                this.state.latencyMs = Math.round(performance.now() - this.t0)
                this.setStatus('online')
                for (const p of this.pointIds) this.send({ action: 'subscribe', topic: p })
            }
            ws.onmessage = (ev) => {
                let data: any
                try {
                    data = JSON.parse(ev.data)
                } catch {
                    return
                }
                // 网关设备状态回报
                if (data.type === 'status') {
                    this.state.deviceConnected = !!data.connected
                    this.state.deviceMessage = data.message || ''
                    if (!data.connected) this.pushError(`设备未连接：${data.message || '未知原因'}`)
                    this.emit(true)
                    return
                }
                const pointId = data.topic || data.id || data.pointId
                if (pointId) {
                    this.recordPoint(pointId, data.value ?? data.data ?? null, data.quality || 'good', data.timestamp || Date.now())
                }
            }
            ws.onclose = () => {
                if (this.stopped) return
                this.state.deviceConnected = null
                this.setStatus('offline')
                this.scheduleReconnect()
            }
            ws.onerror = () => {
                this.pushError(`无法连接到 ${this.ds.url}`)
            }
        } catch (e: any) {
            this.pushError(`连接异常：${e?.message || e}`)
            this.setStatus('offline')
            this.scheduleReconnect()
        }
    }

    private send(obj: unknown) {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
    }

    // ---------- Tauri IPC（工业协议真实模式：s7 / opc / modbus；任意协议的演示模式） ----------

    /**
     * 经 Rust 原生网关探测。
     *
     * 演示模式下 buildDeviceConfig 会映射为 { kind:'demo', profile }，
     * 由 Rust DemoAdapter 生成模拟数据，无需任何本地端口；
     * 真实模式下按工业协议连接设备。
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

    // ---------- HTTP 轮询 ----------
    private startHttp() {
        this.t0 = performance.now()
        const interval = Number(this.ds.config?.interval) > 0 ? Number(this.ds.config!.interval) : 2000
        // 无绑定点位时用默认 pointId 仅探测连通性
        const ids = this.pointIds.length ? this.pointIds : ['default']
        for (const pointId of ids) {
            const hasPoint = this.pointIds.length > 0
            const poll = async () => {
                try {
                    const sep = this.ds.url.includes('?') ? '&' : '?'
                    const resp = await fetch(`${this.ds.url}${sep}pointId=${encodeURIComponent(pointId)}`)
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                    const data = await resp.json()
                    if (this.state.status !== 'online') {
                        this.state.latencyMs = Math.round(performance.now() - this.t0)
                        this.setStatus('online')
                    }
                    if (hasPoint) {
                        this.recordPoint(pointId, data.value ?? data.data ?? null, data.quality || 'good', data.timestamp || Date.now())
                    }
                } catch (e: any) {
                    this.pushError(`HTTP 请求失败：${e?.message || e}`)
                    if (this.state.status === 'online') this.setStatus('offline')
                }
            }
            poll()
            this.httpTimers.push(window.setInterval(poll, interval))
        }
    }

    // ---------- SSE ----------
    private startSse() {
        this.t0 = performance.now()
        const ids = this.pointIds.length ? this.pointIds : ['default']
        for (const pointId of ids) {
            const sep = this.ds.url.includes('?') ? '&' : '?'
            const es = new EventSource(`${this.ds.url}${sep}pointId=${encodeURIComponent(pointId)}`)
            this.sseSources.push(es)
            es.onopen = () => {
                if (this.state.status !== 'online') {
                    this.state.latencyMs = Math.round(performance.now() - this.t0)
                    this.setStatus('online')
                }
            }
            es.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data)
                    this.recordPoint(pointId, data.value ?? data.data ?? null, data.quality || 'good', data.timestamp || Date.now())
                } catch {
                    /* 忽略心跳等非 JSON 帧 */
                }
            }
            es.onerror = () => {
                // readyState === CLOSED(2) 表示连接失败 / 已断开
                if (es.readyState === EventSource.CLOSED) {
                    this.pushError(`SSE 连接断开：${this.ds.url}`)
                    if (this.state.status === 'online') this.setStatus('offline')
                }
            }
        }
    }

    // ---------- MQTT（经 mqtt.js，复用 MqttService） ----------
    private startMqtt() {
        this.t0 = performance.now()
        const svc = new MqttService(this.ds.url)
        this.mqttSvc = svc
        for (const p of this.pointIds) {
            svc.subscribe(p, (pt) => this.recordPoint(p, pt.value, pt.quality || 'good', pt.timestamp))
        }
        // MqttService 在 'connect' 事件置位 connected，这里轮询其连接状态
        this.mqttPollTimer = window.setInterval(() => {
            const on = svc.isConnected()
            if (on && this.state.status !== 'online') {
                this.state.latencyMs = Math.round(performance.now() - this.t0)
                this.setStatus('online')
            } else if (!on && this.state.status === 'online') {
                this.setStatus('offline')
            }
        }, MQTT_POLL_MS)
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

    private scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) return
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null
            if (this.stopped) return
            this.setStatus('connecting')
            this.startWsSubscribe()
        }, RECONNECT_DELAY)
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
