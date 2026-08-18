// ========== 数据源网关监控 Composable（数据源「体检表」）==========
// 所属层级：数据源管理层的配套工具，供数据源管理对话框 / 状态栏使用
//
// 用途：统一管理各个数据源的监控探针（GatewayMonitorService）生命周期：
//   1. 为每个数据源启动一个探针，周期性地向设备/服务发送请求，测量连通性、延迟
//   2. 自动收集画布上绑定到该数据源的所有节点点位，作为监控对象（演示与真实设备模式一致，
//      均只监控节点实际绑定的点位，不注入内置样例点）
//   3. 把监控结果（在线/离线/延迟/错误/点位值）放入响应式 states，供界面直接显示
//   4. 组件卸载时自动停止全部探针，避免后台残留连接

import { reactive, onUnmounted } from 'vue'
import { GatewayMonitorService, type MonitorState } from '@/services/GatewayMonitorService'
import { useEditorStore } from '@/stores/editor'
import type { DataSource } from '@/stores/dataSource'

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

    /** 收集某数据源被画布节点绑定的所有 pointId（去重；多点绑定取全部点组） */
    function collectPoints(ds: DataSource): string[] {
        const set = new Set<string>()
        for (const node of editorStore.graphData.nodes as any[]) {
            const b = node?.data?.binding
            if (!b) continue
            if (b.sourceId === ds.id) {
                for (const entry of b.points ?? []) {
                    const pid = entry?.pointId
                    if (pid) set.add(pid)
                }
            }
        }
        return [...set]
    }

    /**
     * 解析最终监控点位集合：演示与真实设备模式一致，
     * 均只监控节点实际绑定的点位（演示模式不再注入内置样例点，无绑定即无监控点）。
     */
    function resolvePoints(ds: DataSource): string[] {
        return collectPoints(ds)
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
