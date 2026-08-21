// ========== nodeTemplates v3 回归测试 ==========
// 覆盖两项约定（见 docs/开发指南/演示模式自定义数据方案.md §8）：
// 1. 新建节点不注入默认 pointId/binding（旧演示时代的 sensor.temp 等遗留点ID 已移除）；
// 2. 同类型多次创建互不影响（静态 data 深拷贝，函数 data/buildData 返回全新对象）。

import { describe, it, expect } from 'vitest'
import { nodeTemplates, buildNodeConfig } from '@/components/nodes/nodeTemplates'

describe('nodeTemplates v3：新建节点干净起步', () => {
    it('所有模板不再配置 pointIdTemplate / transform（遗留默认点ID 已移除）', () => {
        for (const item of nodeTemplates) {
            expect((item as any).pointIdTemplate, `${item.type} 不应再有 pointIdTemplate`).toBeUndefined()
            expect((item as any).transform, `${item.type} 不应再有 transform`).toBeUndefined()
        }
    })

    it('buildNodeConfig 不注入 pointId 与 binding（仪表盘）', () => {
        const gauge = nodeTemplates.find((t) => t.type === 'gauge-node')!
        const config = buildNodeConfig(gauge)
        expect(config.shape).toBe('gauge-node')
        expect(config.data).toMatchObject({ title: '温度', unit: '°C', value: 50 })
        expect(config.data.pointId).toBeUndefined()
        expect(config.data.binding).toBeUndefined()
    })

    it('货架 buildData 产出初始货格但不含 pointId/binding', () => {
        const rack = nodeTemplates.find((t) => t.type === 'rack-node')!
        const config = buildNodeConfig(rack)
        expect(Array.isArray(config.data.floorGrids)).toBe(true)
        expect(config.data.pointId).toBeUndefined()
        expect(config.data.binding).toBeUndefined()
    })

    it('同类型第二次创建保持独立（静态 data 深拷贝，不受第一个节点影响）', () => {
        const agv = nodeTemplates.find((t) => t.type === 'agv-node')!
        const first = buildNodeConfig(agv)
        const second = buildNodeConfig(agv)
        // 不是同一引用，且修改第一个不影响第二个
        expect(second.data).not.toBe(first.data)
        first.data.name = '被改过的AGV'
        first.data.battery = 0
        expect(second.data.name).toBe('AGV-01')
        expect(second.data.battery).toBe(85)
    })

    it('函数形式 data 每次返回全新对象（折线图 history 不共享）', () => {
        const chart = nodeTemplates.find((t) => t.type === 'chart-node')!
        const first = buildNodeConfig(chart)
        const second = buildNodeConfig(chart)
        expect(second.data.history).not.toBe(first.data.history)
    })
})
