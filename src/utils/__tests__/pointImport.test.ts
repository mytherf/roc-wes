/**
 * parsePointImportText 单元测试
 *
 * 覆盖「导入点位」文本解析：三段格式、分隔符自动探测（Tab 优先以兼容
 * 含逗号的 S7 地址）、注释/空行跳过、文本内去重、备注含分隔符不拆分等边界。
 */
import { describe, it, expect } from 'vitest'
import { parsePointImportText } from '@/utils/pointImport'

describe('parsePointImportText（逗号模式）', () => {
    it('仅点ID：逐行解析', () => {
        const r = parsePointImportText('sensor.temp.001\nsensor.humi.001')
        expect(r.points).toEqual([
            { pointId: 'sensor.temp.001' },
            { pointId: 'sensor.humi.001' },
        ])
        expect(r.skippedLines).toBe(0)
        expect(r.duplicateLines).toBe(0)
    })

    it('三段完整格式：点ID + 点名称 + 备注', () => {
        const r = parsePointImportText('sensor.temp.001, 温度1号, 锅炉房东侧')
        expect(r.points).toEqual([
            { pointId: 'sensor.temp.001', name: '温度1号', remark: '锅炉房东侧' },
        ])
    })

    it('中文逗号与英文逗号等价', () => {
        const r = parsePointImportText('a，名称A\nc,名称C')
        expect(r.points).toEqual([
            { pointId: 'a', name: '名称A' },
            { pointId: 'c', name: '名称C' },
        ])
    })

    it('备注含逗号：第三段起整体作为备注，不再拆分', () => {
        const r = parsePointImportText('p-1, 名称, 备注含逗号，也在内')
        expect(r.points).toEqual([
            { pointId: 'p-1', name: '名称', remark: '备注含逗号，也在内' },
        ])
    })

    it('空行与 # 注释行跳过并计数', () => {
        const r = parsePointImportText('# 点位清单\n\np-1\n   \n# 尾注')
        expect(r.points).toEqual([{ pointId: 'p-1' }])
        expect(r.skippedLines).toBe(4)
    })

    it('文本内重复点ID：保留首次出现，重复行计数', () => {
        const r = parsePointImportText('p-1, 首次\np-1, 重复')
        expect(r.points).toEqual([{ pointId: 'p-1', name: '首次' }])
        expect(r.duplicateLines).toBe(1)
    })

    it('首段为空（行以分隔符开头）：整行跳过', () => {
        const r = parsePointImportText(', 无点ID\np-1')
        expect(r.points).toEqual([{ pointId: 'p-1' }])
        expect(r.skippedLines).toBe(1)
    })

    it('CRLF 换行与两侧空白：正常解析', () => {
        const r = parsePointImportText('p-1 , 名称 \r\n p-2\r\n')
        expect(r.points).toEqual([
            { pointId: 'p-1', name: '名称' },
            { pointId: 'p-2' },
        ])
    })

    it('空文本：返回空结果', () => {
        const r = parsePointImportText('')
        expect(r.points).toEqual([])
        expect(r.skippedLines).toBe(0)
        expect(r.duplicateLines).toBe(0)
    })
})

describe('parsePointImportText（Tab 模式：含 Tab 时整文按 Tab 切分）', () => {
    it('S7 地址含逗号：Tab 分隔下点ID完整保留', () => {
        const r = parsePointImportText('DB1,REAL0\t堆垛机1号温度\tDB 块 1 偏移 0\nMB0\t标志位')
        expect(r.points).toEqual([
            { pointId: 'DB1,REAL0', name: '堆垛机1号温度', remark: 'DB 块 1 偏移 0' },
            { pointId: 'MB0', name: '标志位' },
        ])
    })

    it('Tab 模式下逗号属于点ID/备注内容，不作分隔符', () => {
        const r = parsePointImportText('a,b\t名称，含逗号')
        expect(r.points).toEqual([
            { pointId: 'a,b', name: '名称，含逗号' },
        ])
    })
})
