/**
 * 授权相关类型定义
 * 基于 ECDSA P-256 + SHA-256 数字签名方案
 */

/** 密钥对（P-256 曲线） */
export interface KeyPair {
    /** 私钥（十六进制字符串，64 字符） */
    privateKey: string
    /** 公钥（十六进制字符串，130 字符，含 04 前缀） */
    publicKey: string
}

/** 授权许可证 */
export interface License {
    /** 许可证唯一标识 */
    id: string
    /** 授权对象（产品名称或客户标识） */
    subject: string
    /** 授权版本 */
    version: string
    /** 签发时间（ISO 8601 字符串） */
    issuedAt: string
    /** 过期时间（ISO 8601 字符串），null 表示永久 */
    expiresAt: string | null
    /** 授权功能列表 */
    features: string[]
    /** 最大节点数限制（0 表示无限制） */
    maxNodes: number
    /** 授权签名（十六进制字符串） */
    signature: string
}

/** 授权验证结果 */
export interface LicenseValidationResult {
    /** 是否有效 */
    valid: boolean
    /** 错误信息（如果无效） */
    error?: string
    /** 授权详情（如果有效） */
    license?: License
}

/** 授权状态 */
export interface LicenseStatus {
    /** 是否已授权 */
    isLicensed: boolean
    /** 授权详情 */
    license: License | null
    /** 剩余天数（null 表示永久或未授权） */
    daysRemaining: number | null
    /** 是否已过期 */
    isExpired: boolean
    /** 最后验证时间 */
    lastVerifiedAt: string | null
}