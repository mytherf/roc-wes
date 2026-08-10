// ========== 数据源网关监控 Composable（数据源「体检表」）==========
// 所属层级：数据源管理层的配套工具，供数据源管理对话框 / 状态栏使用
//
// 用途：统一管理各个数据源的监控探针（GatewayMonitorService）生命周期：
//   1. 为每个数据源启动一个探针，周期性地向设备/服务发送请求，测量连通性、延迟
//   2. 自动收集画布上绑定到该数据源的所有节点点位，作为监控对象
//   3. 把监控结果（在线/离线/延迟/错误/点位值）放入响应式 states，供界面直接显示
//   4. 组件卸载时自动停止全部探针，避免后台残留连接
//
// 关键概念：
//   - 演示模式：数据源地址 = 内置演示标识地址时，自动注入一组样例点位，
//     即使没有节点绑定也能展示实时跳动数据，方便预览效果
//   - 真实设备模式：只监控节点实际绑定的点位

import { reactive, onUnmounted } from 'vue'
import { GatewayMonitorService, type MonitorState } from '@/services/GatewayMonitorService'
import { useEditorStore } from '@/stores/editor'
import { BUILTIN_MOCK_URLS, type DataSource, type DataSourceType } from '@/stores/dataSource'

/** 空闲（未监控）的初始快照 */
function idleState(): MonitorState {
    return {
        status: 'idle',
        deviceConnected: null,
        deviceMessage: '',
        latencyMs: null,
        points: {},
        errors: [],
        updatedAt: Date.now(),
    }
}

/**
 * 是否为演示模式：地址等于该类型的内置演示标识地址即为演示。
 * 与 DataSourceDialog 的判定保持一致（兼容旧数据源 config.demo 字段）。
 */
function isDemoSource(ds: DataSource): boolean {
    return ds.url === BUILTIN_MOCK_URLS[ds.type]
}

/**
 * 各类型演示模式下的样例监控点位（统一以 sample- 前缀标识，与业务点位区分）。
 * 桌面端内置演示引擎（Rust DemoAdapter）会为任意订阅的 pointId 生成模拟值，故此处挑选具代表性的点位，
 * 让演示模式下即使没有节点绑定也能展示一组实时数据。
 * 工业协议采用真实地址格式（与 19502-19504 仿真器一致），切到真实设备/仿真器同样可用。
 */
const DEMO_POINTS: Record<DataSourceType, string[]> = {
    websocket: ['sample-temperature', 'sample-humidity', 'sample-pressure'],
    http: ['sample-temperature', 'sample-throughput'],
    sse: ['sample-counter', 'sample-level'],
    mqtt: ['factory/line1/temperature', 'factory/line1/status'],
    s7: ['DB1,REAL0', 'DB1,REAL4', 'DB1,INT0'],
    opc: ['ns=2;s=Ramp', 'ns=2;s=Sine', 'ns=2;s=Counter'],
    modbus: ['holding:100', 'holding:101', 'input:200', 'coil:0'],
}

/** 取某类型演示模式的样例点位 */
function demoPointsFor(type: DataSourceType): string[] {
    return DEMO_POINTS[type] ?? []
}

/**
 * 数据源网关监控 Composable
 *
 * 统一管理各数据源的监控探针（GatewayMonitorService）生命周期与响应式状态：
 * - states：dsId → 监控快照（响应式，供界面直接绑定）；
 * - monitoring：dsId → 是否正在监控（响应式，供状态徽标 / 按钮绑定）；
 * - 自动从编辑器画布收集「绑定到该数据源的节点点位」作为监控点位；
 * - 组件卸载时自动停止全部探针，避免后台残留连接。
 */
export function useGatewayMonitor() {
    const editorStore = useEditorStore()

    /** dsId → 监控快照（响应式） */
    const states = reactive<Record<string, MonitorState>>({})
    /** dsId → 是否正在监控（响应式） */
    const monitoring = reactive<Record<string, boolean>>({})
    /** dsId → 探针实例（非响应式，仅内部持有） */
    const monitors = new Map<string, GatewayMonitorService>()

    /** 收集某数据源被画布节点绑定的所有 pointId（去重；多点绑定取全部点组，条目兼容字符串/对象；兼容 sourceId 与旧 sourceUrl 引用） */
    function collectPoints(ds: DataSource): string[] {
        const set = new Set<string>()
        for (const node of editorStore.graphData.nodes as any[]) {
            const b = node?.data?.binding
            if (!b?.pointId) continue
            if (b.sourceId === ds.id || (b.sourceUrl && b.sourceUrl === ds.url)) {
                const points = Array.isArray(b.points) && b.points.length > 0
                    ? b.points
                    : [b.pointId]
                for (const entry of points) {
                    const pid = typeof entry === 'string' ? entry : entry?.pointId
                    if (pid) set.add(pid)
                }
            }
        }
        return [...set]
    }

    /**
     * 解析最终监控点位集合：
     * - 演示模式：并入该类型的演示样点（内置演示引擎会推送模拟值），再叠加节点已绑定点位（去重）；
     *   保证演示模式下即使无节点绑定也能展示一组实时模拟数据。
     * - 真实设备模式：仅监控节点实际绑定的点位（不注入模拟点）。
     */
    function resolvePoints(ds: DataSource): string[] {
        const bound = collectPoints(ds)
        if (!isDemoSource(ds)) return bound
        return [...new Set([...demoPointsFor(ds.type), ...bound])]
    }

    /** 取某数据源的监控快照（未监控时返回空闲态） */
    function getState(dsId: string): MonitorState {
        return states[dsId] ?? idleState()
    }

    /** 是否正在监控某数据源 */
    function isMonitoring(dsId: string): boolean {
        return !!monitoring[dsId]
    }

    /** 启动某数据源监控（若已在监控则先停止再重启） */
    function start(ds: DataSource) {
        stop(ds.id)
        const pointIds = resolvePoints(ds)
        const mon = new GatewayMonitorService(ds, pointIds, (snap) => {
            states[ds.id] = snap
        })
        monitors.set(ds.id, mon)
        monitoring[ds.id] = true
        mon.start()
    }

    /** 停止某数据源监控 */
    function stop(dsId: string) {
        const mon = monitors.get(dsId)
        if (mon) {
            mon.stop()
            monitors.delete(dsId)
        }
        monitoring[dsId] = false
        states[dsId] = idleState()
    }

    /** 启动一批数据源监控 */
    function startAll(list: DataSource[]) {
        for (const ds of list) start(ds)
    }

    /** 停止全部监控 */
    function stopAll() {
        for (const id of [...monitors.keys()]) stop(id)
    }

    // 组件卸载时清理，避免后台残留连接
    onUnmounted(() => stopAll())

    return {
        states,
        monitoring,
        getState,
        isMonitoring,
        start,
        stop,
        startAll,
        stopAll,
        collectPoints,
        resolvePoints,
    }
}
