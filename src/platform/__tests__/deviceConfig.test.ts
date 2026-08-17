/**
 * buildDeviceConfig 演示波形选择测试
 *
 * 验证目标：
 * 1. 演示模式未选波形：Web 协议按协议特征波形，工业协议省略 profile（Rust 默认正弦）
 * 2. 演示模式选了波形：config.profile 优先生效（任意协议均可指定）
 * 3. 非法 profile 值回退协议特征波形；真实模式不受 profile 影响
 */
import { describe, it, expect } from 'vitest'
import { buildDeviceConfig, isDemoSource, DEMO_WAVE_OPTIONS } from '@/platform/deviceConfig'

describe('buildDeviceConfig 演示波形选择', () => {
    it('演示模式未选波形：Web 协议按协议特征波形', () => {
        expect(buildDeviceConfig('websocket', '', { demo: true }))
            .toMatchObject({ kind: 'demo', profile: 'websocket' })
        expect(buildDeviceConfig('http', '', { demo: true }))
            .toMatchObject({ kind: 'demo', profile: 'http' })
        expect(buildDeviceConfig('sse', '', { demo: true }))
            .toMatchObject({ kind: 'demo', profile: 'sse' })
        expect(buildDeviceConfig('mqtt', '', { demo: true }))
            .toMatchObject({ kind: 'demo', profile: 'mqtt' })
    })

    it('演示模式未选波形：工业协议省略 profile', () => {
        const cfg = buildDeviceConfig('modbus', '', { demo: true })
        expect(cfg).toMatchObject({ kind: 'demo' })
        expect((cfg as any).profile).toBeUndefined()
    })

    it('演示模式选了波形：config.profile 优先（含工业协议）', () => {
        expect(buildDeviceConfig('websocket', '', { demo: true, profile: 'sse' }))
            .toMatchObject({ kind: 'demo', profile: 'sse' })
        expect(buildDeviceConfig('modbus', '', { demo: true, profile: 'mqtt' }))
            .toMatchObject({ kind: 'demo', profile: 'mqtt' })
    })

    it('非法 profile 值：回退协议特征波形', () => {
        expect(buildDeviceConfig('websocket', '', { demo: true, profile: 'square' }))
            .toMatchObject({ kind: 'demo', profile: 'websocket' })
    })

    it('真实模式不受 demo/profile 影响', () => {
        expect(buildDeviceConfig('websocket', 'ws://127.0.0.1:12345', { demo: false }))
            .toMatchObject({ kind: 'websocket', url: 'ws://127.0.0.1:12345' })
    })

    it('isDemoSource 仅认 config.demo === true', () => {
        expect(isDemoSource({ demo: true })).toBe(true)
        expect(isDemoSource({ demo: false })).toBe(false)
        expect(isDemoSource(undefined)).toBe(false)
        expect(isDemoSource({})).toBe(false)
    })

    it('波形选项覆盖全部四档且值唯一', () => {
        const values = DEMO_WAVE_OPTIONS.map((o) => o.value)
        expect(values).toEqual(['websocket', 'http', 'sse', 'mqtt'])
    })
})
