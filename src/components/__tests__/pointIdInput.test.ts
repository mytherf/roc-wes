// @vitest-environment jsdom
/**
 * 真实环境验证：点ID 输入框逐字输入不回显丢失
 *
 * 复现路径（修复前 bug）：
 *   击键 → updateBinding 把 binding 写回 store → selectedElement 生成新对象 →
 *   深度 watch(element) 触发回填草稿 → 未选数据源时 binding=undefined → 草稿被清空
 *   → 输入框内容消失，无法输入。
 *
 * 验证方式：挂载真实 PropertyPanel 组件（jsdom），选中节点后逐字符 setValue 主点ID
 * 输入框，断言每敲一个字符输入值都保留，且最终 binding.points 正确写入节点数据。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

// 屏蔽文件持久化（测试环境无 Tauri FS）
vi.mock('@/platform/fileStorage', () => ({
    readJsonFile: vi.fn(async () => null),
    writeJsonFile: vi.fn(async () => undefined),
    getLastFileError: vi.fn(() => ''),
    existsFile: vi.fn(async () => false),
    removePath: vi.fn(async () => true),
}))

import PropertyPanel from '@/components/PropertyPanel.vue'
import { useEditorStore } from '@/stores/editor'

/** 模拟 X6 默认 setData 的深合并（lodash.merge 语义）：
 *  对象递归合并、数组按下标逐项合并、undefined 源值被跳过 */
function mergeLikeX6(prev: any, src: any): any {
    if (src === undefined) return prev
    const isObj = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v)
    if (Array.isArray(prev) && Array.isArray(src)) {
        const out = [...prev]
        src.forEach((v, i) => { out[i] = mergeLikeX6(prev[i], v) })
        return out
    }
    if (isObj(prev) && isObj(src)) {
        const out: any = { ...prev }
        for (const k of Object.keys(src)) out[k] = mergeLikeX6(prev[k], (src as any)[k])
        return out
    }
    return src
}

/** 构造假 X6 节点（getData/setData/updateData/位置尺寸 API，setData 语义与真实 X6 一致） */
function makeFakeCell(id: string) {
    let data: any = { id, shape: 'gauge', label: '测试节点' }
    return {
        isNode: () => true,
        getData: () => data,
        setData: (d: any) => {
            // 真实 X6：setData 默认深合并（merge({}, prev, d)）
            data = mergeLikeX6(data, d)
        },
        updateData: (d: any) => {
            // 真实 X6：updateData = setData(deep:false) = 顶层 Object.assign
            data = { ...data, ...d }
        },
        getPosition: () => ({ x: 10, y: 20 }),
        getSize: () => ({ width: 100, height: 80 }),
        get cellData() {
            return data
        },
    }
}

/** 构造假 Graph 与 canvasRef（PropertyPanel 仅用到 getCellById / 绑定方法） */
function makeFakeCanvas(cell: ReturnType<typeof makeFakeCell>) {
    const fakeGraph = {
        getCellById: (id: string) => (id === (cell as any).cellData.id ? cell : null),
        getGridSize: () => 10,
        // 事件 API 桩：PropertyPanel 会订阅 cell:change:data 同步路线运动状态
        on: vi.fn(),
        off: vi.fn(),
    }
    return {
        graph: { value: fakeGraph },
        bindNodeData: vi.fn(),
        unbindNodeData: vi.fn(),
        updateNodePosition: vi.fn(),
        updateNodeSize: vi.fn(),
    }
}

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('属性面板点ID输入（真实组件挂载）', () => {
    it('未选数据源时逐字输入主点ID：每个字符都保留，不被回填清空', async () => {
        const editorStore = useEditorStore()
        editorStore.setGraphData({
            nodes: [{ id: 'node-1', data: { shape: 'gauge', label: '测试节点' } } as any],
            edges: [],
        })
        editorStore.setSelected('node-1')

        const cell = makeFakeCell('node-1')
        const canvasRef = makeFakeCanvas(cell)
        const wrapper = mount(PropertyPanel, { props: { canvasRef } })

        // 找到主点ID输入框（主点组第一个 input）
        const input = wrapper.find('.binding-group-card input')
        expect(input.exists()).toBe(true)

        // 逐字符输入，模拟真实击键：每一步断言输入值未被清空
        const target = 'sensor.temp.001'
        for (let i = 1; i <= target.length; i++) {
            const partial = target.slice(0, i)
            await input.setValue(partial)
            expect((input.element as HTMLInputElement).value).toBe(partial)
        }

        // 未选数据源：点位同样提交保存（sourceId 后补），切换节点/数据源不丢失
        expect((input.element as HTMLInputElement).value).toBe(target)
        const storeNode = editorStore.graphData.nodes.find((n) => n.id === 'node-1')
        expect(storeNode?.data?.binding).toMatchObject({
            points: [{ pointId: target }],
        })
        expect(storeNode?.data?.binding?.sourceId).toBeUndefined()
        wrapper.unmount()
    })

    it('已选数据源时逐字输入：binding.points 逐次写入节点数据，输入不中断', async () => {
        const editorStore = useEditorStore()
        editorStore.setGraphData({
            nodes: [{ id: 'node-1', data: { shape: 'gauge', label: '测试节点' } } as any],
            edges: [],
        })
        editorStore.setSelected('node-1')

        // 注入一个演示模式数据源供下拉选择
        const { useDataSourceStore, BUILTIN_MOCK_URLS } = await import('@/stores/dataSource')
        const dsStore = useDataSourceStore()
        const ds = dsStore.addDataSource({
            name: 'demo-ws',
            type: 'websocket',
            url: BUILTIN_MOCK_URLS.websocket,
        })

        const cell = makeFakeCell('node-1')
        const canvasRef = makeFakeCanvas(cell)
        const wrapper = mount(PropertyPanel, { props: { canvasRef } })

        // 选择数据源（触发 updateBinding）：定位含「未选择数据源」选项的 select
        const selects = wrapper.findAll('select')
        const select = selects.find((s) =>
            s.findAll('option').some((o) => o.text().includes('未选择数据源'))
        )
        expect(select).toBeTruthy()
        await select!.setValue(ds.id)

        // 逐字输入主点ID
        const input = wrapper.find('.binding-group-card input')
        const target = 'p-main'
        for (let i = 1; i <= target.length; i++) {
            const partial = target.slice(0, i)
            await input.setValue(partial)
            expect((input.element as HTMLInputElement).value).toBe(partial)
        }

        // store 中节点 binding 应为完整点组配置
        const storeNode = editorStore.graphData.nodes.find((n) => n.id === 'node-1')
        expect(storeNode?.data?.binding).toMatchObject({
            sourceId: ds.id,
            points: [{ pointId: 'p-main' }],
        })
        wrapper.unmount()
    })

    it('删除附加点组：节点 binding.points 整体替换，无深合并残留旧条目', async () => {
        const editorStore = useEditorStore()
        const { useDataSourceStore, BUILTIN_MOCK_URLS } = await import('@/stores/dataSource')
        const dsStore = useDataSourceStore()
        const ds = dsStore.addDataSource({
            name: 'demo-ws',
            type: 'websocket',
            url: BUILTIN_MOCK_URLS.websocket,
        })

        // 节点已带两点绑定（主点 + 附加点）
        editorStore.setGraphData({
            nodes: [{
                id: 'node-1',
                data: {
                    shape: 'gauge', label: '测试节点',
                    binding: {
                        sourceId: ds.id,
                        points: [{ pointId: 'p-main' }, { pointId: 'p-aux' }],
                    },
                },
            } as any],
            edges: [],
        })
        editorStore.setSelected('node-1')

        const cell = makeFakeCell('node-1')
        // 预置节点数据与 store 一致（含两点绑定）
        cell.updateData({
            binding: {
                sourceId: ds.id,
                points: [{ pointId: 'p-main' }, { pointId: 'p-aux' }],
            },
        })
        const canvasRef = makeFakeCanvas(cell)
        const wrapper = mount(PropertyPanel, { props: { canvasRef } })

        // 回填后应有两个点组卡片（主点 + 附加点 1）
        expect(wrapper.findAll('.binding-group-card').length).toBe(2)

        // 点击附加点组的删除按钮
        await wrapper.find('.extra-point-remove').trigger('click')

        // 节点数据里的 points 必须只剩主点——
        // 若写回走默认深合并（数组按下标合并），p-aux 会残留在尾部
        const nodeBinding = (cell.cellData as any).binding
        expect(nodeBinding.points).toEqual([{ pointId: 'p-main' }])

        // store 侧同样只剩主点
        const storeNode = editorStore.graphData.nodes.find((n) => n.id === 'node-1')
        expect(storeNode?.data?.binding?.points).toEqual([{ pointId: 'p-main' }])
        wrapper.unmount()
    })

    it('切换选中节点：未选数据源时录入的点位不丢失（回来仍在）', async () => {
        const editorStore = useEditorStore()
        editorStore.setGraphData({
            nodes: [
                { id: 'node-1', data: { shape: 'gauge', label: '节点1' } } as any,
                { id: 'node-2', data: { shape: 'gauge', label: '节点2' } } as any,
            ],
            edges: [],
        })
        editorStore.setSelected('node-1')

        const cell = makeFakeCell('node-1')
        const canvasRef = makeFakeCanvas(cell)
        const wrapper = mount(PropertyPanel, { props: { canvasRef } })

        // 未选数据源，直接录入主点ID
        const input = wrapper.find('.binding-group-card input')
        await input.setValue('sensor.temp.001')

        // 切换到 node-2：草稿被 node-2 的空绑定回填
        editorStore.setSelected('node-2')
        await nextTick()

        // 切回 node-1：录入的点位必须还在（从 store 回填）
        editorStore.setSelected('node-1')
        await nextTick()
        const inputAfter = wrapper.find('.binding-group-card input')
        expect((inputAfter.element as HTMLInputElement).value).toBe('sensor.temp.001')
        wrapper.unmount()
    })

    it('切换数据源：置空再改选不丢失已录入点组', async () => {
        const editorStore = useEditorStore()
        editorStore.setGraphData({
            nodes: [{ id: 'node-1', data: { shape: 'gauge', label: '测试节点' } } as any],
            edges: [],
        })
        editorStore.setSelected('node-1')

        const { useDataSourceStore, BUILTIN_MOCK_URLS } = await import('@/stores/dataSource')
        const dsStore = useDataSourceStore()
        const ds = dsStore.addDataSource({
            name: 'demo-ws',
            type: 'websocket',
            url: BUILTIN_MOCK_URLS.websocket,
        })

        const cell = makeFakeCell('node-1')
        const canvasRef = makeFakeCanvas(cell)
        const wrapper = mount(PropertyPanel, { props: { canvasRef } })

        // 选数据源 → 录入主点 + 附加点
        const select = wrapper.findAll('select').find((s) =>
            s.findAll('option').some((o) => o.text().includes('未选择数据源'))
        )!
        await select.setValue(ds.id)
        await wrapper.find('.binding-group-card input').setValue('p-main')
        await wrapper.find('.add-extra-point-btn').trigger('click')
        const inputs = wrapper.findAll('.binding-group-card input')
        // 输入框顺序：[主点ID, 主点转换, 附加点ID, 附加点转换]
        await inputs[2].setValue('p-aux')

        let storeNode = editorStore.graphData.nodes.find((n) => n.id === 'node-1')
        expect(storeNode?.data?.binding?.points).toEqual([
            { pointId: 'p-main' },
            { pointId: 'p-aux' },
        ])

        // 切换数据源时先置空：点位不能被清空
        await select.setValue('')
        storeNode = editorStore.graphData.nodes.find((n) => n.id === 'node-1')
        expect(storeNode?.data?.binding?.points).toEqual([
            { pointId: 'p-main' },
            { pointId: 'p-aux' },
        ])
        expect(storeNode?.data?.binding?.sourceId).toBeUndefined()

        // 重新选择数据源：sourceId 恢复，点组原样保留
        await select.setValue(ds.id)
        storeNode = editorStore.graphData.nodes.find((n) => n.id === 'node-1')
        expect(storeNode?.data?.binding).toMatchObject({
            sourceId: ds.id,
            points: [{ pointId: 'p-main' }, { pointId: 'p-aux' }],
        })
        wrapper.unmount()
    })
})
