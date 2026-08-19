import { describe, it, expect } from 'vitest'
import {
  buildS7Address,
  parseS7Address,
  isValidS7Address,
  extractDbPrefix,
  S7_GEN_TYPES,
  S7_IO_TYPES,
  S7_AREAS,
} from '@/utils/s7Address'

describe('buildS7Address（DB 区标量地址）', () => {
  it('各标量类型按 DB{n},{TYPE}{偏移} 拼接', () => {
    expect(buildS7Address({ db: 30, type: 'REAL', offset: 0 })).toBe('DB30,REAL0')
    expect(buildS7Address({ db: 1, type: 'INT', offset: 4 })).toBe('DB1,INT4')
    expect(buildS7Address({ db: 30, type: 'WORD', offset: 42 })).toBe('DB30,WORD42')
    expect(buildS7Address({ db: 7, type: 'DINT', offset: 6 })).toBe('DB7,DINT6')
    expect(buildS7Address({ db: 2, type: 'DWORD', offset: 8 })).toBe('DB2,DWORD8')
    expect(buildS7Address({ db: 3, type: 'BYTE', offset: 10 })).toBe('DB3,BYTE10')
    expect(buildS7Address({ db: 5, type: 'LREAL', offset: 16 })).toBe('DB5,LREAL16')
  })

  it('偏移 0 与类型小写输入均合法（输出统一大写）', () => {
    expect(buildS7Address({ db: 1, type: 'real' as any, offset: 0 })).toBe('DB1,REAL0')
  })

  it('非法参数返回空串', () => {
    expect(buildS7Address({ db: 0, type: 'INT', offset: 0 })).toBe('')      // DB 号必须 ≥1
    expect(buildS7Address({ db: -1, type: 'INT', offset: 0 })).toBe('')
    expect(buildS7Address({ db: 1, type: 'INT', offset: -2 })).toBe('')     // 偏移不可为负
    expect(buildS7Address({ db: 1.5, type: 'INT', offset: 0 })).toBe('')    // 非整数
    expect(buildS7Address({ db: 1, type: '' as any, offset: 0 })).toBe('')  // 未知类型
    expect(buildS7Address({ db: 1, type: 'BOOL', offset: 0 })).toBe('')     // BOOL 缺位号
    expect(buildS7Address({ db: 0, type: 'BOOL', offset: 0, bit: 0 })).toBe('') // BOOL 位地址同样校验 DB 号
  })
})

describe('buildS7Address（DB 区 BOOL 位地址）', () => {
  it('按 DB{n},X{字节}.{位} 拼接', () => {
    expect(buildS7Address({ db: 30, type: 'BOOL', offset: 0, bit: 0 })).toBe('DB30,X0.0')
    expect(buildS7Address({ db: 1, type: 'BOOL', offset: 332, bit: 7 })).toBe('DB1,X332.7')
  })

  it('位号越界返回空串', () => {
    expect(buildS7Address({ db: 1, type: 'BOOL', offset: 0, bit: 8 })).toBe('')
    expect(buildS7Address({ db: 1, type: 'BOOL', offset: 0, bit: -1 })).toBe('')
  })
})

describe('buildS7Address（M/I/Q 区地址）', () => {
  it('标量按 {区}{B|W|D}{偏移} 拼接', () => {
    expect(buildS7Address({ area: 'M', db: 0, type: 'BYTE', offset: 0 })).toBe('MB0')
    expect(buildS7Address({ area: 'M', db: 0, type: 'WORD', offset: 2 })).toBe('MW2')
    expect(buildS7Address({ area: 'M', db: 0, type: 'DWORD', offset: 4 })).toBe('MD4')
    expect(buildS7Address({ area: 'I', db: 0, type: 'BYTE', offset: 0 })).toBe('IB0')
    expect(buildS7Address({ area: 'Q', db: 0, type: 'WORD', offset: 2 })).toBe('QW2')
    expect(buildS7Address({ area: 'Q', db: 0, type: 'DWORD', offset: 8 })).toBe('QD8')
  })

  it('位地址按 {区}{字节}.{位} 拼接（X 省略写法，与 Rust parse_io 一致）', () => {
    expect(buildS7Address({ area: 'M', db: 0, type: 'BOOL', offset: 0, bit: 0 })).toBe('M0.0')
    expect(buildS7Address({ area: 'I', db: 0, type: 'BOOL', offset: 10, bit: 3 })).toBe('I10.3')
    expect(buildS7Address({ area: 'Q', db: 0, type: 'BOOL', offset: 1, bit: 7 })).toBe('Q1.7')
  })

  it('M/I/Q 区不支持 REAL/INT 等类型化写法（返回空串）', () => {
    expect(buildS7Address({ area: 'M', db: 0, type: 'REAL', offset: 0 })).toBe('')
    expect(buildS7Address({ area: 'I', db: 0, type: 'INT', offset: 0 })).toBe('')
    expect(buildS7Address({ area: 'Q', db: 0, type: 'LREAL', offset: 0 })).toBe('')
  })
})

describe('parseS7Address（反解析回填）', () => {
  it('DB 区标量', () => {
    expect(parseS7Address('DB30,REAL0')).toEqual({ area: 'DB', db: 30, type: 'REAL', offset: 0 })
    expect(parseS7Address('DB1,INT4')).toEqual({ area: 'DB', db: 1, type: 'INT', offset: 4 })
    expect(parseS7Address('DB5,LREAL16')).toEqual({ area: 'DB', db: 5, type: 'LREAL', offset: 16 })
    expect(parseS7Address('DB3,BYTE10')).toEqual({ area: 'DB', db: 3, type: 'BYTE', offset: 10 })
    expect(parseS7Address('DB3,B10')).toEqual({ area: 'DB', db: 3, type: 'BYTE', offset: 10 }) // B 别名归一 BYTE
  })

  it('DB 区 BOOL 位地址', () => {
    expect(parseS7Address('DB30,X0.0')).toEqual({ area: 'DB', db: 30, type: 'BOOL', offset: 0, bit: 0 })
    expect(parseS7Address('DB1,X332.7')).toEqual({ area: 'DB', db: 1, type: 'BOOL', offset: 332, bit: 7 })
  })

  it('M/I/Q 区标量与位地址', () => {
    expect(parseS7Address('MB0')).toEqual({ area: 'M', db: 0, type: 'BYTE', offset: 0 })
    expect(parseS7Address('MW2')).toEqual({ area: 'M', db: 0, type: 'WORD', offset: 2 })
    expect(parseS7Address('MD4')).toEqual({ area: 'M', db: 0, type: 'DWORD', offset: 4 })
    expect(parseS7Address('IB0')).toEqual({ area: 'I', db: 0, type: 'BYTE', offset: 0 })
    expect(parseS7Address('QW2')).toEqual({ area: 'Q', db: 0, type: 'WORD', offset: 2 })
    expect(parseS7Address('M0.0')).toEqual({ area: 'M', db: 0, type: 'BOOL', offset: 0, bit: 0 })
    expect(parseS7Address('MX10.3')).toEqual({ area: 'M', db: 0, type: 'BOOL', offset: 10, bit: 3 }) // X 可省略写法
  })

  it('大小写不敏感并归一', () => {
    expect(parseS7Address('db7,dint6')).toEqual({ area: 'DB', db: 7, type: 'DINT', offset: 6 })
    expect(parseS7Address('mw10')).toEqual({ area: 'M', db: 0, type: 'WORD', offset: 10 })
    expect(parseS7Address('  DB1,X0.0 ')).toEqual({ area: 'DB', db: 1, type: 'BOOL', offset: 0, bit: 0 })
  })

  it('非法地址返回 null', () => {
    expect(parseS7Address('DB1,REAL0.4')).toBeNull()       // 数组点（v2 规划）
    expect(parseS7Address('DB1,332.0')).toBeNull()         // DB 位无 X 前缀（回填不支持）
    expect(parseS7Address('DB0,INT0')).toBeNull()          // DB 号 0
    expect(parseS7Address('DB,X0.0')).toBeNull()           // 缺 DB 号
    expect(parseS7Address('M')).toBeNull()
    expect(parseS7Address('MR0')).toBeNull()               // 旧文档 MR 写法
    expect(parseS7Address('sensor.temp.001')).toBeNull()
    expect(parseS7Address('holding:100')).toBeNull()
    expect(parseS7Address('')).toBeNull()
  })

  it('build 与 parse 互逆（助手生成 → 回填编辑不丢信息）', () => {
    const samples = [
      { db: 30, type: 'REAL' as const, offset: 0 },
      { db: 1, type: 'BOOL' as const, offset: 5, bit: 3 },
      { area: 'M' as const, db: 0, type: 'WORD' as const, offset: 12 },
      { area: 'Q' as const, db: 0, type: 'BOOL' as const, offset: 2, bit: 6 },
    ]
    for (const parts of samples) {
      const addr = buildS7Address(parts)
      expect(addr).not.toBe('')
      const parsed = parseS7Address(addr)
      expect(parsed).not.toBeNull()
      expect(buildS7Address(parsed!)).toBe(addr) // 回填后重新生成得到同一地址
    }
  })
})

describe('isValidS7Address（导入严格校验）', () => {
  it('合法地址通过，非法地址拒绝', () => {
    expect(isValidS7Address('DB1,REAL0')).toBe(true)
    expect(isValidS7Address('DB30,X0.0')).toBe(true)
    expect(isValidS7Address('MB0')).toBe(true)
    expect(isValidS7Address('q1.7')).toBe(true)
    expect(isValidS7Address('DB1,REAL0.4')).toBe(false)
    expect(isValidS7Address('sensor.temp.001')).toBe(false)
    expect(isValidS7Address('')).toBe(false)
  })
})

describe('extractDbPrefix（DB 块前缀提取）', () => {
  it('标准 S7 地址提取并大写归一', () => {
    expect(extractDbPrefix('DB30,INT2')).toBe('DB30')
    expect(extractDbPrefix('db7,lreal16')).toBe('DB7')
    expect(extractDbPrefix('Db1,X0.0')).toBe('DB1')
    expect(extractDbPrefix('  DB12,REAL0')).toBe('DB12') // 允许前导空白
  })

  it('非 DB 地址返回 null（M/I/Q 区归「其他点位」）', () => {
    expect(extractDbPrefix('MB0')).toBeNull()
    expect(extractDbPrefix('sensor.temp.001')).toBeNull()
    expect(extractDbPrefix('holding:100')).toBeNull()
    expect(extractDbPrefix('ns=2;s=Ramp')).toBeNull()
    expect(extractDbPrefix('')).toBeNull()
  })
})

describe('类型与数据区清单（与 Rust 网关对齐）', () => {
  it('DB 区 7 标量 + BOOL；M/I/Q 区 BYTE/WORD/DWORD/BOOL；四数据区', () => {
    expect(S7_GEN_TYPES).toHaveLength(8)
    expect(S7_GEN_TYPES).toContain('BOOL')
    expect(S7_IO_TYPES).toEqual(['BYTE', 'WORD', 'DWORD', 'BOOL'])
    expect(S7_AREAS).toEqual(['DB', 'M', 'I', 'Q'])
  })
})
