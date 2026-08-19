/**
 * S7 地址工具：点 ID 生成助手、反解析与 DB 块前缀提取（属性面板数据绑定用）
 *
 * 地址语法与 Rust 网关 gateway-s7 的 parse_point 严格一致（nodes7 风格）：
 * - DB 标量：DB{n},{TYPE}{偏移}，如 DB30,REAL0（类型 REAL/LREAL/INT/WORD/DINT/DWORD/BYTE）
 * - DB 位：  DB{n},X{字节}.{位}，如 DB30,X0.0（BOOL，X 前缀可省略，生成时统一带 X）
 * - M/I/Q 区：{区}{B|W|D}{偏移}，如 MB0/MW2/MD4、IB0/QW2；位 {区}{字节}.{位}，如 M0.0
 *   （M/I/Q 区仅字节/字/双字/位，无 REAL/LREAL/INT/DINT 等类型化写法）
 */

/** 数据区：DB 块 / M（Merker）/ I（输入）/ Q（输出） */
export const S7_AREAS = ['DB', 'M', 'I', 'Q'] as const
export type S7Area = (typeof S7_AREAS)[number]

/** DB 区生成助手支持的数据类型（BOOL 走位地址，其余为标量） */
export const S7_GEN_TYPES = ['REAL', 'LREAL', 'INT', 'WORD', 'DINT', 'DWORD', 'BYTE', 'BOOL'] as const
export type S7GenType = (typeof S7_GEN_TYPES)[number]

/** M/I/Q 区支持的类型：B→BYTE / W→WORD / D→DWORD，另有位 BOOL（Rust parse_io 仅这四种） */
export const S7_IO_TYPES = ['BYTE', 'WORD', 'DWORD', 'BOOL'] as const
export type S7IoType = (typeof S7_IO_TYPES)[number]

export interface S7AddressParts {
  /** 数据区（缺省 DB） */
  area?: S7Area
  /** DB 块号（≥1，仅 DB 区） */
  db: number
  /** 数据类型 */
  type: S7GenType
  /** 字节偏移（≥0） */
  offset: number
  /** 位号（仅 BOOL：0-7） */
  bit?: number
}

/** parseS7Address 的反解析结果（非法地址返回 null） */
export interface S7ParsedAddress extends Required<Pick<S7AddressParts, 'area' | 'db' | 'type' | 'offset'>> {
  /** 位号（仅 BOOL 位地址） */
  bit?: number
}

/** IO 区类型 → 地址后缀（B/W/D） */
const IO_TYPE_SUFFIX: Record<Exclude<S7IoType, 'BOOL'>, string> = { BYTE: 'B', WORD: 'W', DWORD: 'D' }

/**
 * 拼接合法 S7 点 ID；参数非法（db<1、偏移<0、BOOL 位号越界、区/类型不匹配）返回 ''。
 * 类型大小写不敏感，输出统一大写。M/I/Q 区仅 BYTE/WORD/DWORD/BOOL。
 */
export function buildS7Address(parts: S7AddressParts): string {
  const area = (parts.area ?? 'DB') as S7Area
  const { db, offset } = parts
  const type = String(parts.type ?? '').toUpperCase() as S7GenType
  if (!(S7_AREAS as readonly string[]).includes(area)) return ''
  if (area === 'DB' && (!Number.isInteger(db) || db < 1)) return ''
  if (!Number.isInteger(offset) || offset < 0) return ''
  if (type === 'BOOL') {
    const bit = parts.bit
    if (bit === undefined || !Number.isInteger(bit) || bit < 0 || bit > 7) return ''
    return area === 'DB' ? `DB${db},X${offset}.${bit}` : `${area}${offset}.${bit}`
  }
  if (area === 'DB') {
    if (!(S7_GEN_TYPES as readonly string[]).includes(type)) return ''
    return `DB${db},${type}${offset}`
  }
  // M/I/Q 区标量：仅 BYTE/WORD/DWORD（后缀 B/W/D）；BOOL 已在位地址分支提前返回
  if (!(S7_IO_TYPES as readonly string[]).includes(type)) return ''
  return `${area}${IO_TYPE_SUFFIX[type as Exclude<S7IoType, 'BOOL'>]}${offset}`
}

/** 匹配 `字节.位`（位号 0-7）；如 "0.0" / "332.7" */
const BIT_RE = /^(\d+)\.([0-7])$/

/**
 * 反解析合法 S7 点 ID 为各字段（大小写不敏感，输出归一化）；非法返回 null。
 * 与 Rust parse_point 同边界：DB 数组点（REAL0.4）与 DB 无 X 前缀位写法不支持回填。
 */
export function parseS7Address(pointId: string): S7ParsedAddress | null {
  const s = (pointId ?? '').trim().toUpperCase()
  if (!s) return null
  // DB 区：DB{n},{TYPE}{off} 或位 DB{n},X{字节}.{位}
  if (s.startsWith('DB')) {
    const comma = s.indexOf(',')
    if (comma <= 2) return null
    const db = Number(s.slice(2, comma))
    if (!Number.isInteger(db) || db < 1) return null
    const rest = s.slice(comma + 1)
    if (rest.startsWith('X')) {
      const m = BIT_RE.exec(rest.slice(1))
      if (!m) return null
      return { area: 'DB', db, type: 'BOOL', offset: Number(m[1]), bit: Number(m[2]) }
    }
    const m = /^(REAL|LREAL|INT|WORD|DINT|DWORD|BYTE|B)(\d+)$/.exec(rest)
    if (!m) return null // 数组点（含 .）等非法格式
    return { area: 'DB', db, type: (m[1] === 'B' ? 'BYTE' : m[1]) as S7GenType, offset: Number(m[2]) }
  }
  // M/I/Q 区：位 M0.0 / MX0.0（X 可省略）；标量 {区}{B|W|D}{off}
  const area = s[0]
  if (area === 'M' || area === 'I' || area === 'Q') {
    let rest = s.slice(1)
    if (rest.startsWith('X')) rest = rest.slice(1)
    const bitM = BIT_RE.exec(rest)
    if (bitM) return { area: area as S7Area, db: 0, type: 'BOOL', offset: Number(bitM[1]), bit: Number(bitM[2]) }
    const m = /^([BWD])(\d+)$/.exec(rest)
    if (!m) return null
    const type = { B: 'BYTE', W: 'WORD', D: 'DWORD' }[m[1]] as S7GenType
    return { area: area as S7Area, db: 0, type, offset: Number(m[2]) }
  }
  return null
}

/** 是否合法 S7 地址（导入严格校验用；等价于 parseS7Address 非 null） */
export function isValidS7Address(pointId: string): boolean {
  return parseS7Address(pointId) !== null
}

/**
 * 提取点 ID 的 DB 块前缀（大写归一，如 'db30,INT2' → 'DB30'）；
 * 非 DB 地址（M/I/Q 区、业务点、Modbus、空）返回 null。仅要求以 DB{n} 开头，
 * 后半段是否合法不校验（宽松匹配，用于展示分组）。
 */
export function extractDbPrefix(pointId: string): string | null {
  const m = /^\s*DB(\d+)/i.exec(pointId ?? '')
  return m ? `DB${m[1]}` : null
}
