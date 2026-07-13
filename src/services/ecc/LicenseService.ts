import { ECDSAService } from './ECDSAService'
import type { License, LicenseValidationResult, LicenseStatus } from '@/types/ecc/license'

/**
 * 授权服务
 * 管理许可证的生成、验证、持久化和功能权限查询
 *
 * 授权流程：
 * 1. 服务端使用私钥对许可证数据签名
 * 2. 客户端使用内置公钥验证签名
 * 3. 验证通过后，根据许可证内容控制功能
 */
export class LicenseService {
    // 内置公钥（硬编码，用于验证授权）—— 此处为示例，生产环境应从服务端动态获取或通过环境变量注入
    private static readonly PUBLIC_KEY =
        '04d5a2c8e9f1b3d7a9c5e7f1b3d5a7c9e1f3b5d7a9c1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1b3d5a7c9e1f3b5d7a9c1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3'

    private static currentLicense: License | null = null
    private static isVerified = false

    /**
     * 验证许可证（不含签名数据）
     */
    static validateLicense(
        licenseData: Omit<License, 'signature'>,
        signature: string,
        publicKeyHex?: string
    ): LicenseValidationResult {
        const pubKey = publicKeyHex || this.PUBLIC_KEY
        const fields = ['id', 'subject', 'version', 'issuedAt', 'expiresAt', 'features', 'maxNodes']
        const data = licenseData as unknown as Record<string, any>
        const isValid = ECDSAService.verifyStructuredData(data, signature, pubKey, fields)
        if (!isValid) {
            return { valid: false, error: '签名验证失败，许可证无效' }
        }
        // 检查过期时间
        if (licenseData.expiresAt) {
            const expiresAt = new Date(licenseData.expiresAt)
            if (expiresAt < new Date()) {
                return { valid: false, error: '许可证已过期' }
            }
        }
        const license: License = { ...licenseData, signature }
        return { valid: true, license }
    }

    /**
     * 从授权码加载许可证
     */
    static loadLicenseFromActivationCode(
        activationCode: string,
        publicKeyHex?: string
    ): LicenseValidationResult {
        const pubKey = publicKeyHex || this.PUBLIC_KEY
        const result = ECDSAService.parseAndVerifyActivationCode(activationCode, pubKey)
        if (!result.valid || !result.data) {
            return { valid: false, error: result.error || '授权码无效' }
        }
        const { signature, ...licenseData } = result.data as any
        return this.validateLicense(
            {
                id: licenseData.id,
                subject: licenseData.subject,
                version: licenseData.version,
                issuedAt: licenseData.issuedAt,
                expiresAt: licenseData.expiresAt || null,
                features: licenseData.features || [],
                maxNodes: licenseData.maxNodes || 0,
            },
            signature,
            pubKey
        )
    }

    /**
     * 激活许可证
     * @param activationCode 授权码
     * @param publicKeyHex 公钥（可选）
     * @returns 是否激活成功
     */
    static activate(activationCode: string, publicKeyHex?: string): boolean {
        const result = this.loadLicenseFromActivationCode(activationCode, publicKeyHex)
        if (result.valid && result.license) {
            this.currentLicense = result.license
            this.isVerified = true
            // 持久化到 localStorage
            try {
                localStorage.setItem('scada-license', JSON.stringify({
                    license: this.currentLicense,
                    activatedAt: new Date().toISOString(),
                }))
            } catch (e) {
                console.warn('许可证持久化失败:', e)
            }
            return true
        }
        return false
    }

    /**
     * 从本地存储恢复许可证
     */
    static restoreFromStorage(): boolean {
        try {
            const stored = localStorage.getItem('scada-license')
            if (!stored) return false
            const data = JSON.parse(stored)
            if (!data.license) return false
            const { signature, ...licenseData } = data.license
            const result = this.validateLicense(licenseData, signature)
            if (result.valid && result.license) {
                this.currentLicense = result.license
                this.isVerified = true
                return true
            }
            return false
        } catch (e) {
            return false
        }
    }

    /**
     * 获取当前授权状态
     */
    static getStatus(): LicenseStatus {
        if (!this.isVerified || !this.currentLicense) {
            // 尝试从存储恢复
            if (this.restoreFromStorage()) {
                return this.getStatus()
            }
            return {
                isLicensed: false,
                license: null,
                daysRemaining: null,
                isExpired: false,
                lastVerifiedAt: null,
            }
        }
        const license = this.currentLicense
        const isExpired = license.expiresAt ? new Date(license.expiresAt) < new Date() : false
        let daysRemaining: number | null = null
        if (license.expiresAt) {
            const diff = new Date(license.expiresAt).getTime() - Date.now()
            daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
        }
        return {
            isLicensed: true,
            license,
            daysRemaining,
            isExpired,
            lastVerifiedAt: new Date().toISOString(),
        }
    }

    /**
     * 检查是否拥有某项功能
     * @param feature 功能名称，如 'basic', 'workflow', 'realtime'
     */
    static hasFeature(feature: string): boolean {
        const status = this.getStatus()
        if (!status.isLicensed || !status.license) return false
        return status.license.features.includes(feature) || status.license.features.includes('*')
    }

    /**
     * 检查节点数量限制
     * @param nodeCount 当前节点数
     */
    static checkNodeLimit(nodeCount: number): { allowed: boolean; maxNodes: number } {
        const status = this.getStatus()
        if (!status.isLicensed || !status.license) {
            // 未授权：默认 5 个节点
            return { allowed: nodeCount <= 5, maxNodes: 5 }
        }
        const maxNodes = status.license.maxNodes || 0
        if (maxNodes === 0) {
            return { allowed: true, maxNodes: 0 } // 0 表示无限制
        }
        return { allowed: nodeCount <= maxNodes, maxNodes }
    }

    /**
     * 清除授权（注销）
     */
    static clear(): void {
        this.currentLicense = null
        this.isVerified = false
        try {
            localStorage.removeItem('scada-license')
        } catch (e) { /* ignore */ }
    }

    /**
     * 生成演示许可证（仅用于开发测试）
     * 生产环境应由服务端生成
     */
    static generateDemoLicense(privateKeyHex: string): string {
        const licenseData = {
            id: 'demo-license-001',
            subject: 'SCADA Engine Demo',
            version: '1.0.0',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            features: ['basic', 'advanced', 'workflow', 'realtime'],
            maxNodes: 100,
        }
        return ECDSAService.generateActivationCode(licenseData, privateKeyHex)
    }
}