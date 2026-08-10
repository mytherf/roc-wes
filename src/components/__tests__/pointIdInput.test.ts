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
import { setActivePinia, createPinia } from 'pinia'

// 屏蔽文件持久化（测试环境无 Tauri FS）
vi.mock('@/platform/fileStorage', () => ({
    readJsonFile: vi.fn(async () => null),
    writeJsonFile: vi.fn(async () => undefined),
}))

import PropertyPanel from '@/components/PropertyPanel.vue'
import { useEditorStore } from '@/stores/editor'

/** 构造假 X6 节点（getData/setData/位置尺寸 API） */
function makeFakeCell(id: string) {
    let data: any = { id, shape: 'gauge', label: '测试节点' }
    return {
        isNode: () => true,
        getData: () => data,
        setData: (d: any) => {
            data = d
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

        // 未选数据源：binding 不生效（undefined），但草稿内容必须保留
        expect((input.element as HTMLInputElement).value).toBe(target)
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
            pointId: 'p-main',
            sourceId: ds.id,
            points: [{ pointId: 'p-main' }],
        })
        wrapper.unmount()
    })
})
