import { describe, it, expect } from 'vitest'
import { ECDSAService } from '@/services/ecc/ECDSAService'
import {LicenseService} from "@/services/ecc/LicenseService.ts";

describe('性能基准测试', () => {
    const keyPair = ECDSAService.generateKeyPair()
    const msg = 'A'.repeat(1000) // 1KB 消息

    it('ECDSA 签名性能 (100次)', () => {
        const start = performance.now()
        for (let i = 0; i < 100; i++) {
            ECDSAService.sign(msg, keyPair.privateKey)
        }
        const end = performance.now()
        const avg = (end - start) / 100
        console.log(`📊 ECDSA 签名平均耗时: ${avg.toFixed(2)}ms`)
        // 期望平均耗时 < 20ms（现代浏览器）
        expect(avg).toBeLessThan(20)
    })

    it('ECDSA 验证性能 (100次)', () => {
        const sig = ECDSAService.sign(msg, keyPair.privateKey)
        const start = performance.now()
        for (let i = 0; i < 100; i++) {
            ECDSAService.verify(msg, sig, keyPair.publicKey)
        }
        const end = performance.now()
        const avg = (end - start) / 100
        console.log(`📊 ECDSA 验证平均耗时: ${avg.toFixed(2)}ms`)
        expect(avg).toBeLessThan(15)
    })

    it('授权码生成与验证性能 (50次)', () => {
        const start = performance.now()
        for (let i = 0; i < 50; i++) {
            const code = LicenseService.generateDemoLicense(keyPair.privateKey)
            const result = ECDSAService.parseAndVerifyActivationCode(code, keyPair.publicKey)
            expect(result.valid).toBe(true)
        }
        const end = performance.now()
        const avg = (end - start) / 50
        console.log(`📊 授权码生成+验证平均耗时: ${avg.toFixed(2)}ms`)
        expect(avg).toBeLessThan(30)
    })
})