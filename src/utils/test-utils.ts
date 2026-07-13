import { ECDSAService } from '@/services/ecc/ECDSAService'
import { LicenseService } from '@/services/ecc/LicenseService'

/**
 * 测试工具
 * 用于生成测试数据和执行集成测试
 */
export class TestUtils {
    /**
     * 生成测试用的密钥对
     */
    static generateTestKeyPair() {
        return ECDSAService.generateKeyPair()
    }

    /**
     * 生成测试用的授权码
     */
    static generateTestLicense(privateKeyHex: string): string {
        return LicenseService.generateDemoLicense(privateKeyHex)
    }

    /**
     * 模拟完整的授权流程
     */
    static async simulateLicenseFlow() {
        console.log('🧪 开始授权流程测试...')

        // 1. 生成密钥对
        const keyPair = this.generateTestKeyPair()
        console.log('✅ 密钥对生成成功')
        console.log(`   公钥: ${keyPair.publicKey.substring(0, 40)}...`)

        // 2. 生成授权码
        const activationCode = this.generateTestLicense(keyPair.privateKey)
        console.log('✅ 授权码生成成功')
        console.log(`   授权码: ${activationCode.substring(0, 40)}...`)

        // 3. 验证授权码
        const result = ECDSAService.parseAndVerifyActivationCode(activationCode, keyPair.publicKey)
        console.log(`✅ 授权码验证: ${result.valid ? '通过' : '失败'}`)

        // 4. 激活许可证
        const activated = LicenseService.activate(activationCode, keyPair.publicKey)
        console.log(`✅ 许可证激活: ${activated ? '成功' : '失败'}`)

        // 5. 检查授权状态
        const status = LicenseService.getStatus()
        console.log('📊 授权状态:', status)

        return { keyPair, activationCode, result, activated, status }
    }
}