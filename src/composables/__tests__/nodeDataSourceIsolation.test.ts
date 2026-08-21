/**
 * 同类型节点多数据源绑定隔离性验证测试
 *
 * 验证目标：两个相同类型的节点分别绑定不同数据源时，功能互不干扰。
 * 1. 配置不同的数据源 → 各自独立服务实例（独立 Rust 会话），数据独立到达
 * 2. 配置完全相同的数据源（serviceKey 相同）→ 共享同一服务实例：
 *    绑不同点位各自独立；绑相同点位时，解绑其一不得连坐另一节点（订阅引用计数）
 *
 * 通过 mock IpcGatewayService 拦截订阅回调，手动 emit 数据点验证写入结果。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// vi.hoisted 保证 mock 工厂提升前可用（工厂内不能引用提升外的顶层变量）
const { mockHolder, FakeIpcService } = vi.hoisted(() => {
    const holder = { instances: [] as any[] }

    /** 假 IPC 网关服务：每个 pointId 维护回调列表（与真实实现一致），支持手动 emit 触发 */
    class FakeService {
        callbacks = new Map<string, ((point: any) => void)[]>()
        cacheKey: string
        constructor(cacheKey: string) {
            this.cacheKey = cacheKey
            holder.instances.push(this)
        }
        subscribe(pointId: string, cb: (point: any) => void) {
            if (!this.callbacks.has(pointId)) this.callbacks.set(pointId, [])
            this.callbacks.get(pointId)!.push(cb)
        }
        // 与真实 IpcGatewayService.unsubscribe 语义一致：传 callback 仅移除该回调（点位无订阅者才删除），不传删除该点全部回调
        unsubscribe(pointId: string, callback?: (point: any) => void) {
            const list = this.callbacks.get(pointId)
            if (!list) return
            if (callback) {
                const idx = list.indexOf(callback)
                if (idx >= 0) list.splice(idx, 1)
                if (list.length === 0) this.callbacks.delete(pointId)
            } else {
                this.callbacks.delete(pointId)
            }
        }
        isConnected() {
            return true
        }
        disconnect() {
            this.callbacks.clear()
        }
        /** 测试辅助：模拟数据到达（广播给该点全部订阅者） */
        emit(pointId: string, value: any) {
            for (const cb of this.callbacks.get(pointId) ?? []) {
                cb({ id: pointId, value, timestamp: Date.now(), quality: 'good' })
            }
        }
    }

    return { mockHolder: holder, FakeIpcService: FakeService }
})

vi.mock('@/services/IpcGatewayService', () => ({ IpcGatewayService: FakeIpcService }))
vi.mock('@/platform/fileStorage', () => ({
    readJsonFile: vi.fn(async () => null),
    writeJsonFile: vi.fn(async () => undefined),
    getLastFileError: vi.fn(() => ''),
    existsFile: vi.fn(async () => false),
    removePath: vi.fn(async () => true),
}))

import { useDataSourceStore } from '@/stores/dataSource'
import { useDataService } from '@/composables/useDataService'

/** 构造一个最小化的 X6 节点替身（只需 getData/setData/id） */
function makeNode(id: string, binding: any) {
    let data: any = { binding }
    return {
        id,
        getData: () => data,
        setData: (d: any) => {
            data = d
        },
    } as any
}

beforeEach(() => {
    setActivePinia(createPinia())
    mockHolder.instances.length = 0
})

describe('同类型节点多数据源隔离性', () => {
    it('不同配置数据源：各自独立服务实例，数据独立到达互不干扰', () => {
        const store = useDataSourceStore()
        const dsA = store.addDataSource({ name: 'http-a', type: 'http', url: 'http://a.example/api', config: { pollIntervalMs: 1000 } })
        const dsB = store.addDataSource({ name: 'http-b', type: 'http', url: 'http://b.example/api', config: { pollIntervalMs: 1000 } })

        // 两个相同类型（同为 gauge-node）的节点，分别绑定不同数据源、且点位 ID 相同
        const nodeA = makeNode('node-a', { sourceId: dsA.id, points: [{ pointId: 'temperature' }] })
        const nodeB = makeNode('node-b', { sourceId: dsB.id, points: [{ pointId: 'temperature' }] })
        const svc = useDataService()
        svc.bindNodeData(nodeA)
        svc.bindNodeData(nodeB)

        // 配置不同 → 两个独立服务实例（对应两条独立 Rust 会话）
        expect(mockHolder.instances.length).toBe(2)

        // 各自数据源独立推数，点位 ID 相同也不串数据
        mockHolder.instances[0].emit('temperature', 11.1)
        mockHolder.instances[1].emit('temperature', 22.2)
        expect(nodeA.getData().value).toBeCloseTo(11.1)
        expect(nodeB.getData().value).toBeCloseTo(22.2)

        // 解绑节点 A 不影响节点 B 继续收数
        svc.unbindNodeData('node-a')
        mockHolder.instances[1].emit('temperature', 33.3)
        expect(nodeB.getData().value).toBeCloseTo(33.3)
        expect(nodeA.getData().value).toBeCloseTo(11.1)
    })

    it('相同配置数据源共享会话：绑不同点位各自独立', () => {
        const store = useDataSourceStore()
        const dsA = store.addDataSource({ name: 'demo-1', type: 'websocket', url: '', config: { demo: true, profile: 'sine' } })
        const dsB = store.addDataSource({ name: 'demo-2', type: 'websocket', url: '', config: { demo: true, profile: 'sine' } })

        const nodeA = makeNode('node-a', { sourceId: dsA.id, points: [{ pointId: 'sample-point' }] })
        const nodeB = makeNode('node-b', { sourceId: dsB.id, points: [{ pointId: 'other-point' }] })
        const svc = useDataService()
        svc.bindNodeData(nodeA)
        svc.bindNodeData(nodeB)

        // 配置完全相同 → 共享同一服务实例（同一 Rust 会话，合理复用）
        expect(mockHolder.instances.length).toBe(1)
        const shared = mockHolder.instances[0]

        shared.emit('sample-point', 1)
        shared.emit('other-point', 2)
        expect(nodeA.getData().value).toBe(1)
        expect(nodeB.getData().value).toBe(2)
    })

    it('相同配置数据源共享会话且绑相同点位：解绑其一，另一节点须继续收数', () => {
        const store = useDataSourceStore()
        // 两个配置完全相同的演示源（典型场景：波形档固定点位 sample-point）
        const dsA = store.addDataSource({ name: 'demo-1', type: 'websocket', url: '', config: { demo: true, profile: 'sine' } })
        const dsB = store.addDataSource({ name: 'demo-2', type: 'websocket', url: '', config: { demo: true, profile: 'sine' } })

        const nodeA = makeNode('node-a', { sourceId: dsA.id, points: [{ pointId: 'sample-point' }] })
        const nodeB = makeNode('node-b', { sourceId: dsB.id, points: [{ pointId: 'sample-point' }] })
        const svc = useDataService()
        svc.bindNodeData(nodeA)
        svc.bindNodeData(nodeB)

        expect(mockHolder.instances.length).toBe(1)
        const shared = mockHolder.instances[0]
        // 两个节点的回调都登记在同一点位上
        expect(shared.callbacks.get('sample-point')?.length).toBe(2)

        shared.emit('sample-point', 10)
        expect(nodeA.getData().value).toBe(10)
        expect(nodeB.getData().value).toBe(10)

        // 解绑节点 A：节点 B 仍订阅同一点位，不应向服务退订（避免连坐）
        svc.unbindNodeData('node-a')
        expect(shared.callbacks.has('sample-point')).toBe(true)

        shared.emit('sample-point', 20)
        expect(nodeB.getData().value).toBe(20)
        // 节点 A 已解绑，不再收到数据
        expect(nodeA.getData().value).toBe(10)

        // 节点 B 也解绑后，该点才真正退订
        svc.unbindNodeData('node-b')
        expect(shared.callbacks.has('sample-point')).toBe(false)
    })
})
