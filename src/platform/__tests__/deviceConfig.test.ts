/**
 * buildDeviceConfig 演示波形选择测试
 *
 * 验证目标：
 * 1. 演示模式不是独立协议：protocol 保持原协议类型 + isMock: true
 * 2. 波形：未选时全部协议省略 profile（Rust 缺省正弦）；
 *    选了则 config.profile 优先生效（任意协议均可指定）
 * 3. 非法 profile 值（含旧版协议名）省略 profile；真实模式不带 isMock
 */
import { describe, it, expect } from 'vitest'
import { buildDeviceConfig, isDemoSource, DEMO_WAVE_OPTIONS } from '@/platform/deviceConfig'

describe('buildDeviceConfig 演示波形选择', () => {
    it('演示模式未选波形：protocol 保持原协议 + isMock，全部协议省略 profile（缺省正弦）', () => {
        for (const type of ['websocket', 'http', 'sse', 'mqtt'] as const) {
            const cfg = buildDeviceConfig(type, '', { demo: true })
            expect(cfg).toMatchObject({ protocol: type, isMock: true })
            expect((cfg as any).profile).toBeUndefined()
        }
    })

    it('演示模式未选波形：Modbus/S7/OPC 省略 profile（必填字段占位空值）', () => {
        const cfg = buildDeviceConfig('modbus', '', { demo: true })
        expect(cfg).toMatchObject({ protocol: 'modbus', isMock: true, host: '', port: 502, unitId: 1 })
        expect((cfg as any).profile).toBeUndefined()
    })

    it('演示模式选了波形：config.profile 优先（含 Modbus/S7/OPC）', () => {
        expect(buildDeviceConfig('websocket', '', { demo: true, profile: 'sawtooth' }))
            .toMatchObject({ protocol: 'websocket', isMock: true, profile: 'sawtooth' })
        expect(buildDeviceConfig('modbus', '', { demo: true, profile: 'steps' }))
            .toMatchObject({ protocol: 'modbus', isMock: true, profile: 'steps' })
    })

    it('非法 profile 值（含旧版协议名）：省略 profile（缺省正弦）', () => {
        for (const profile of ['square', 'websocket', 'mqtt']) {
            const cfg = buildDeviceConfig('websocket', '', { demo: true, profile })
            expect((cfg as any).profile).toBeUndefined()
        }
    })

    it('真实模式：protocol 输出且不带 isMock', () => {
        const cfg = buildDeviceConfig('websocket', 'ws://127.0.0.1:12345', { demo: false })
        expect(cfg).toMatchObject({ protocol: 'websocket', url: 'ws://127.0.0.1:12345' })
        expect((cfg as any).isMock).toBeUndefined()
    })

    it('isDemoSource 仅认 config.demo === true', () => {
        expect(isDemoSource({ demo: true })).toBe(true)
        expect(isDemoSource({ demo: false })).toBe(false)
        expect(isDemoSource(undefined)).toBe(false)
        expect(isDemoSource({})).toBe(false)
    })

    it('波形选项覆盖全部四档且值唯一', () => {
        const values = DEMO_WAVE_OPTIONS.map((o) => o.value)
        expect(values).toEqual(['sine', 'randomWalk', 'sawtooth', 'steps'])
    })
})

describe('buildDeviceConfig 真实模式统一地址', () => {
    it('Modbus/S7 设备地址取数据源 url（支持 主机:端口，缺省端口按协议）', () => {
        expect(buildDeviceConfig('modbus', '192.168.0.10', { unitId: 3 }))
            .toMatchObject({ protocol: 'modbus', host: '192.168.0.10', port: 502, unitId: 3 })
        expect(buildDeviceConfig('modbus', '192.168.0.10:1502', {}))
            .toMatchObject({ protocol: 'modbus', host: '192.168.0.10', port: 1502 })
        expect(buildDeviceConfig('s7', '192.168.0.20', { rack: 0, slot: 1 }))
            .toMatchObject({ protocol: 's7', host: '192.168.0.20', port: 102, rack: 0, slot: 1 })
    })

    it('OPC UA 地址即端点 URL', () => {
        expect(buildDeviceConfig('opc', 'opc.tcp://192.168.0.30:4840', {}))
            .toMatchObject({ protocol: 'opc', endpoint: 'opc.tcp://192.168.0.30:4840' })
    })

    it('存量兼容：url 为空时回退旧 config.host / config.endpoint 字段', () => {
        expect(buildDeviceConfig('modbus', '', { host: '10.0.0.5', port: 1502 }))
            .toMatchObject({ protocol: 'modbus', host: '10.0.0.5', port: 1502 })
        expect(buildDeviceConfig('opc', '', { endpoint: 'opc.tcp://10.0.0.6:4840' }))
            .toMatchObject({ protocol: 'opc', endpoint: 'opc.tcp://10.0.0.6:4840' })
    })
})
