/**
 * 数据绑定点组机制运行时验证测试
 *
 * 验证目标（对应属性面板「点组」模型）：
 * 1. 多点组订阅：points 中每个点组都被独立订阅
 * 2. 主点（points[0]）：转换后写入 data.value 驱动节点渲染，同时写 data.values
 * 3. 附加点：使用各自组内的转换函数，写入 data.values[pointId]
 * 4. rebindIfChanged：点组列表变化后重新绑定；unbindNodeData 退订全部点
 *
 * 通过 mock IpcGatewayService 拦截订阅回调，手动 emit 数据点验证写入结果。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// vi.hoisted 保证 mock 工厂提升前可用（工厂内不能引用提升外的顶层变量）
const { mockHolder, FakeIpcService } = vi.hoisted(() => {
    const holder = { instances: [] as any[] }

    /** 假 IPC 网关服务：记录每个 pointId 的订阅回调，支持手动 emit 触发 */
    class FakeService {
        callbacks = new Map<string, (point: any) => void>()
        cacheKey: string
        config: any
        displayName: string
        constructor(cacheKey: string, config: any, displayName: string) {
            this.cacheKey = cacheKey
            this.config = config
            this.displayName = displayName
            holder.instances.push(this)
        }
        subscribe(pointId: string, cb: (point: any) => void) {
            this.callbacks.set(pointId, cb)
        }
        unsubscribe(pointId: string, callback?: (point: any) => void) {
            if (callback) {
                const cur = this.callbacks.get(pointId)
                if (cur !== callback) return
                this.callbacks.delete(pointId)
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
        /** 测试辅助：模拟数据到达 */
        emit(pointId: string, value: any) {
            this.callbacks.get(pointId)?.({ id: pointId, value, timestamp: Date.now(), quality: 'good' })
        }
    }

    return { mockHolder: holder, FakeIpcService: FakeService }
})

vi.mock('@/services/IpcGatewayService', () => ({ IpcGatewayService: FakeIpcService }))
// 屏蔽文件持久化（测试环境无 Tauri FS）
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

/** 创建一个演示模式 WebSocket 数据源（config.demo → 路由到 IpcGatewayService） */
function addDemoSource() {
    const store = useDataSourceStore()
    return store.addDataSource({
        name: 'demo-ws',
        type: 'websocket',
        url: '',
        config: { demo: true },
    })
}

beforeEach(() => {
    setActivePinia(createPinia())
    mockHolder.instances.length = 0
})

describe('数据绑定点组机制', () => {
    it('多点组：每点独立订阅，主点转换后写 data.value，附加点用各自转换函数写 values', () => {
        const ds = addDemoSource()
        const binding = {
            sourceId: ds.id,
            points: [
                { pointId: 'p-main', transformSource: '(raw) => raw * 10' },
                { pointId: 'p-aux1', transformSource: '(raw) => Math.round(raw)' },
                { pointId: 'p-aux2' }, // 无转换函数：原样写入
            ],
        }
        const node = makeNode('n1', binding)
        const { bindNodeData } = useDataService()
        bindNodeData(node)

        const svc = mockHolder.instances[0]
        expect([...svc.callbacks.keys()].sort()).toEqual(['p-aux1', 'p-aux2', 'p-main'])

        // 主点：raw 2.34 → 转换 ×10 → data.value = 23.4
        svc.emit('p-main', 2.34)
        let d = node.getData()
        expect(d.value).toBeCloseTo(23.4)
        expect(d.values['p-main'].value).toBeCloseTo(23.4) // values 中同样存转换后的值
        expect(d._quality).toBe('good')

        // 附加点 1：raw 7.9 → Math.round → values['p-aux1'].value = 8；不影响主点
        svc.emit('p-aux1', 7.9)
        d = node.getData()
        expect(d.values['p-aux1'].value).toBe(8)
        expect(d.value).toBeCloseTo(23.4)

        // 附加点 2：无转换函数，原样写入
        svc.emit('p-aux2', 'running')
        d = node.getData()
        expect(d.values['p-aux2'].value).toBe('running')
    })

    it('无 points 字段：不订阅任何点位', () => {
        const ds = addDemoSource()
        const binding = { sourceId: ds.id }
        const node = makeNode('n2', binding)
        const { bindNodeData } = useDataService()
        bindNodeData(node)

        expect(mockHolder.instances.length).toBe(0)
    })

    it('rebindIfChanged：点组列表变化后重新订阅；unbindNodeData 退订全部点', () => {
        const ds = addDemoSource()
        const binding: any = {
            sourceId: ds.id,
            points: [
                { pointId: 'p-main' },
                { pointId: 'p-extra' },
            ],
        }
        const node = makeNode('n4', binding)
        const dsService = useDataService()
        dsService.bindNodeData(node)

        const svc = mockHolder.instances[0]
        expect(svc.callbacks.size).toBe(2)

        // 删除附加点组后，rebindIfChanged 应检测到差异并重绑
        binding.points = [{ pointId: 'p-main' }]
        node.getData().binding = binding
        dsService.rebindIfChanged(node)
        expect(svc.callbacks.size).toBe(1)
        expect([...svc.callbacks.keys()]).toEqual(['p-main'])

        // 点组不变时不重绑（实例数仍为 1 个服务）
        const before = mockHolder.instances.length
        dsService.rebindIfChanged(node)
        expect(mockHolder.instances.length).toBe(before)

        // 解绑：退订全部点
        dsService.unbindNodeData(node.id)
        expect(svc.callbacks.size).toBe(0)
    })
})
