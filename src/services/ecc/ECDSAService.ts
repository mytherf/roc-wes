/**
 * ECDSA P-256 签名服务 (适配 @noble/curves@2.2.0)
 *
 * 核心变化（v2.x）：
 * 1. 所有导入路径必须包含 .js 后缀
 * 2. 使用 p256.keygen() 生成密钥对
 * 3. p256.sign() 和 p256.verify() 直接操作 Uint8Array
 * 4. 不再需要手动哈希，库内部自动处理
 */
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

export class ECDSAService {
    /**
     * 生成 P-256 密钥对
     * @returns 包含私钥和公钥的密钥对对象（十六进制字符串）
     */
    static generateKeyPair(): { privateKey: string; publicKey: string } {
        // v2 使用 p256.keygen() 直接生成密钥对
        const { secretKey, publicKey } = p256.keygen()
        return {
            privateKey: bytesToHex(secretKey),
            publicKey: bytesToHex(publicKey),
        }
    }

    /**
     * 从私钥导入密钥对
     * @param privateKeyHex 私钥（十六进制字符串）
     */
    static importPrivateKey(privateKeyHex: string): { privateKey: string; publicKey: string } {
        const privateKey = hexToBytes(privateKeyHex)
        // v2 使用 p256.getPublicKey() 从私钥派生公钥
        const publicKey = p256.getPublicKey(privateKey)
        return {
            privateKey: bytesToHex(privateKey),
            publicKey: bytesToHex(publicKey),
        }
    }

    /**
     * 对消息进行签名
     * @param message 待签名的消息（字符串）
     * @param privateKeyHex 私钥（十六进制字符串）
     * @returns DER 编码的签名（十六进制字符串）
     */
    static sign(message: string, privateKeyHex: string): string {
        try {
            const privateKey = hexToBytes(privateKeyHex)
            const messageBytes = new TextEncoder().encode(message)
            // v2 sign 直接接受 Uint8Array 消息
            const signature = p256.sign(messageBytes, privateKey)
            return bytesToHex(signature)
        } catch (error) {
            throw new Error(`签名失败: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    /**
     * 验证签名
     * @param message 原始消息（字符串）
     * @param signatureHex 签名（十六进制字符串）
     * @param publicKeyHex 公钥（十六进制字符串）
     * @returns 签名是否有效
     */
    static verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
        try {
            const publicKey = hexToBytes(publicKeyHex)
            const signature = hexToBytes(signatureHex)
            const messageBytes = new TextEncoder().encode(message)
            // v2 verify 直接接受 Uint8Array
            return p256.verify(signature, messageBytes, publicKey)
        } catch (error) {
            console.error('签名验证失败:', error)
            return false
        }
    }

    /**
     * 验证结构化数据签名（用于 License）
     * @param data 数据对象
     * @param signatureHex 签名（十六进制）
     * @param publicKeyHex 公钥（十六进制）
     * @param fields 参与签名的字段列表（按顺序拼接）
     */
    static verifyStructuredData(
        data: Record<string, any>,
        signatureHex: string,
        publicKeyHex: string,
        fields: string[]
    ): boolean {
        const message = fields.map(field => String(data[field] ?? '')).join('|')
        return this.verify(message, signatureHex, publicKeyHex)
    }

    /**
     * 对结构化数据进行签名
     */
    static signStructuredData(
        data: Record<string, any>,
        privateKeyHex: string,
        fields: string[]
    ): string {
        const message = fields.map(field => String(data[field] ?? '')).join('|')
        return this.sign(message, privateKeyHex)
    }

    /**
     * 生成授权码（Base64 编码的许可证数据 + 签名）
     * 注意：btoa 不支持包含非 ASCII 字符的字符串，生产环境建议使用 Buffer 或 TextEncoder
     */
    static generateActivationCode(licenseData: Record<string, any>, privateKeyHex: string): string {
        const fields = ['id', 'subject', 'version', 'issuedAt', 'expiresAt', 'features', 'maxNodes']
        const signature = this.signStructuredData(licenseData, privateKeyHex, fields)
        const payload = { ...licenseData, signature }
        // 使用 btoa 进行 Base64 编码（仅适用于 ASCII 字符）
        return btoa(JSON.stringify(payload))
    }

    /**
     * 解析并验证授权码
     */
    static parseAndVerifyActivationCode(
        activationCode: string,
        publicKeyHex: string
    ): { valid: boolean; data?: Record<string, any>; error?: string } {
        try {
            const json = atob(activationCode)
            const data = JSON.parse(json)
            const { signature, ...licenseData } = data
            if (!signature) {
                return { valid: false, error: '授权码缺少签名' }
            }
            const fields = ['id', 'subject', 'version', 'issuedAt', 'expiresAt', 'features', 'maxNodes']
            const isValid = this.verifyStructuredData(licenseData, signature, publicKeyHex, fields)
            return {
                valid: isValid,
                data: isValid ? licenseData : undefined,
                error: isValid ? undefined : '签名验证失败',
            }
        } catch (error) {
            return {
                valid: false,
                error: `授权码解析失败: ${error instanceof Error ? error.message : String(error)}`,
            }
        }
    }
}