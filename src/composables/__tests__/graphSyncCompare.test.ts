/**
 * 画布 ↔ Store 全量对比逻辑测试（useGraphSync.isSameGraphData）
 *
 * 背景：点组（多点绑定）上线后，订阅回调会把每个点的实时值写入
 * node.data.values[pointId]。该字段是运行期遥测数据，画布侧持续刷新而
 * Store 侧不同步；若参与对比，任何一次 Store 变更（如属性面板编辑绑定）
 * 都会被误判为"实质变化"→ 触发整画布重建 → 节点实时数据回落旧快照，
 * 用户侧表现为"点位添加后数据丢失"。
 *
 * 验证：value / _timestamp / _quality / values 差异不影响对比结论，
 * 设计字段（binding / label 等）差异仍能正确识别。
 */
import { describe, it, expect } from 'vitest'
import { isSameGraphData } from '@/composables/useGraphSync'

/** 构造最小节点数据 */
function node(id: string, data: Record<string, any>) {
    return { id, x: 0, y: 0, data }
}

const BINDING = { pointId: 'p1', points: [{ pointId: 'p1' }], sourceId: 'ds-1' }

describe('isSameGraphData 运行期字段剥离', () => {
    it('仅 value/_timestamp/_quality/values 不同 → 视为相同（不触发重建）', () => {
        const a = {
            nodes: [node('n1', { binding: BINDING })],
            edges: [],
        }
        const b = {
            nodes: [node('n1', {
                binding: BINDING,
                value: 42,
                _timestamp: Date.now(),
                _quality: 'good',
                values: { p1: { value: 42, timestamp: Date.now(), quality: 'good' } },
            })],
            edges: [],
        }
        expect(isSameGraphData(a as any, b as any)).toBe(true)
    })

    it('values 内容持续刷新（时间戳不同）→ 仍视为相同', () => {
        const base = { binding: BINDING, values: { p1: { value: 1, timestamp: 1000, quality: 'good' } } }
        const fresh = { binding: BINDING, values: { p1: { value: 2, timestamp: 2000, quality: 'good' } } }
        expect(isSameGraphData(
            { nodes: [node('n1', base)], edges: [] } as any,
            { nodes: [node('n1', fresh)], edges: [] } as any,
        )).toBe(true)
    })

    it('binding.points 设计数据变化 → 视为不同（应触发重载）', () => {
        const a = { nodes: [node('n1', { binding: BINDING })], edges: [] }
        const b = {
            nodes: [node('n1', {
                binding: { ...BINDING, points: [{ pointId: 'p1' }, { pointId: 'p2' }] },
            })],
            edges: [],
        }
        expect(isSameGraphData(a as any, b as any)).toBe(false)
    })

    it('label 等普通设计字段变化 → 视为不同', () => {
        const a = { nodes: [node('n1', { label: 'A' })], edges: [] }
        const b = { nodes: [node('n1', { label: 'B' })], edges: [] }
        expect(isSameGraphData(a as any, b as any)).toBe(false)
    })

    it('节点数量变化 → 视为不同', () => {
        const a = { nodes: [node('n1', {})], edges: [] }
        const b = { nodes: [node('n1', {}), node('n2', {})], edges: [] }
        expect(isSameGraphData(a as any, b as any)).toBe(false)
    })
})
