import { describe, it, expect, beforeAll } from 'vitest'
import { ECDSAService } from '@/services/ecc/ECDSAService'
import { LicenseService } from '@/services/ecc/LicenseService'
import {TestUtils} from "@/utils/test-utils.ts";

describe('SCADA Engine 授权集成测试', () => {
    let keyPair: { privateKey: string; publicKey: string }
    let activationCode: string

    beforeAll(() => {
        keyPair = ECDSAService.generateKeyPair()
        activationCode = LicenseService.generateDemoLicense(keyPair.privateKey)
    })

    describe('ECDSA 加密服务', () => {
        it('应正确生成密钥对', () => {
            expect(keyPair.privateKey).toBeDefined()
            expect(keyPair.privateKey.length).toBe(64) // 32 字节
            expect(keyPair.publicKey).toBeDefined()
            expect(keyPair.publicKey.length).toBe(130) // 65 字节（含 04 前缀）
        })

        it('应正确签名和验证', () => {
            const msg = 'Hello, SCADA!'
            const sig = ECDSAService.sign(msg, keyPair.privateKey)
            expect(sig).toBeDefined()
            const isValid = ECDSAService.verify(msg, sig, keyPair.publicKey)
            expect(isValid).toBe(true)
        })

        it('应拒绝篡改的消息', () => {
            const msg = 'Hello, SCADA!'
            const tampered = 'Hello, SCADA?'
            const sig = ECDSAService.sign(msg, keyPair.privateKey)
            const isValid = ECDSAService.verify(tampered, sig, keyPair.publicKey)
            expect(isValid).toBe(false)
        })
    })

    describe('授权服务', () => {
        it('应正确生成授权码', () => {
            expect(activationCode).toBeDefined()
            expect(activationCode.length).toBeGreaterThan(0)
        })

        it('应正确解析和验证授权码', () => {
            const result = ECDSAService.parseAndVerifyActivationCode(activationCode, keyPair.publicKey)
            expect(result.valid).toBe(true)
            expect(result.data).toBeDefined()
            expect(result.data?.id).toBe('demo-license-001')
        })

        it('应正确激活许可证', () => {
            const activated = LicenseService.activate(activationCode, keyPair.publicKey)
            expect(activated).toBe(true)
            const status = LicenseService.getStatus()
            expect(status.isLicensed).toBe(true)
            expect(status.license?.subject).toBe('SCADA Engine Demo')
        })

        it('应正确检查功能权限', () => {
            // 先激活
            LicenseService.activate(activationCode, keyPair.publicKey)
            expect(LicenseService.hasFeature('basic')).toBe(true)
            expect(LicenseService.hasFeature('workflow')).toBe(true)
            expect(LicenseService.hasFeature('realtime')).toBe(true)
            expect(LicenseService.hasFeature('nonexistent')).toBe(false)
        })

        it('应正确检查节点限制', () => {
            LicenseService.activate(activationCode, keyPair.publicKey)
            const result1 = LicenseService.checkNodeLimit(50)
            expect(result1.allowed).toBe(true)
            expect(result1.maxNodes).toBe(100)
            const result2 = LicenseService.checkNodeLimit(150)
            expect(result2.allowed).toBe(false)
        })
    })

    describe('端到端授权流程', () => {
        it('应完成完整授权流程', async () => {
            const result = await TestUtils.simulateLicenseFlow()
            expect(result.activated).toBe(true)
            expect(result.status.isLicensed).toBe(true)
        })
    })
})