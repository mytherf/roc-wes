/**
 * 点位导入解析工具
 *
 * 属性面板「数据绑定」的「导入点位」功能：把多行文本（粘贴或从 .txt/.csv
 * 文件读入）解析为点组列表（点ID + 可选点名称 + 可选备注）。
 *
 * 格式约定（每行一个点位）：
 *   点ID                      —— 仅点ID
 *   点ID<sep>点名称           —— 点ID + 点名称
 *   点ID<sep>点名称<sep>备注   —— 完整三段
 *
 * 分隔符自动探测：文本中含 Tab 时按 Tab 切分（S7 地址如 `DB1,REAL0`
 * 本身含逗号，批量导入此类点位应使用 Tab 分隔）；否则按逗号（中/英文）。
 * 空行与以 # 开头的注释行跳过。
 *
 * Excel/CSV 文件导入：由 xlsx 库解析为行数据后经 rowsToImportDraft
 * 转为 Tab 分隔草稿文本（含逗号字段无需引号包裹，天然安全），
 * 首行为表头（首列「点ID」）时自动跳过。
 */

/** 解析出的单个导入点位 */
export interface ImportedPoint {
    pointId: string
    name?: string
    remark?: string
}

/** 解析结果：有效点位 + 统计信息（供导入对话框提示） */
export interface ParseImportResult {
    points: ImportedPoint[]
    /** 跳过的行数（空行/注释行/首段为空） */
    skippedLines: number
    /** 文本内部重复的点ID行数（保留首次出现） */
    duplicateLines: number
}

/** 自动判定行内分隔符：含 Tab → Tab；否则逗号（中/英文） */
function detectSeparator(text: string): RegExp {
    return text.includes('\t') ? /\t/ : /[,，]/
}

/**
 * 解析点位导入文本。
 * - 逐行 trim 后按分隔符切分：第一段为点ID（为空则整行跳过），
 *   第二段为点名称、第三段及以后合并为备注（备注内允许含分隔符原文不拆分）
 * - 空行与 # 注释行计入 skippedLines；文本内重复点ID计入 duplicateLines
 */
export function parsePointImportText(text: string): ParseImportResult {
    const sep = detectSeparator(text ?? '')
    const points: ImportedPoint[] = []
    const seen = new Set<string>()
    let skippedLines = 0
    let duplicateLines = 0

    // 空文本直接返回（避免 split 产生单个空行被误计入跳过数）
    if (!text) return { points, skippedLines, duplicateLines }

    for (const rawLine of (text ?? '').split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) {
            skippedLines++
            continue
        }
        // 备注可能含分隔符：前两段切出后，剩余整体作为备注
        const firstSep = line.search(sep)
        let pointId: string
        let rest: string
        if (firstSep < 0) {
            pointId = line
            rest = ''
        } else {
            pointId = line.slice(0, firstSep)
            rest = line.slice(firstSep + 1)
        }
        pointId = pointId.trim()
        if (!pointId) {
            skippedLines++
            continue
        }
        if (seen.has(pointId)) {
            duplicateLines++
            continue
        }
        seen.add(pointId)

        let name: string | undefined
        let remark: string | undefined
        const secondSep = rest.search(sep)
        if (secondSep >= 0) {
            name = rest.slice(0, secondSep).trim() || undefined
            remark = rest.slice(secondSep + 1).trim() || undefined
        } else {
            name = rest.trim() || undefined
        }
        points.push({ pointId, name, remark })
    }

    return { points, skippedLines, duplicateLines }
}

/** 单元格转字符串：数字/布尔等非空值转文本，null/undefined/空白转空串 */
function cellToString(cell: unknown): string {
    if (cell === null || cell === undefined) return ''
    return String(cell).trim()
}

/** 是否表头行：首列为「点ID」（大小写/空白不敏感，兼容 pointId） */
export function isImportHeaderRow(cells: unknown[]): boolean {
    const first = cellToString(cells[0]).toLowerCase().replace(/\s+/g, '')
    return first === '点id' || first === 'pointid'
}

/**
 * 把 Excel/CSV 解析出的行数据转为 Tab 分隔的草稿文本（填入导入对话框）。
 * - 首行为表头时跳过；整行为空跳过；最多取前三列（点ID/点名称/备注），
 *   超出的列忽略
 * - 用 Tab 连接：含逗号的 S7 地址无需引号包裹即可安全还原
 */
export function rowsToImportDraft(rows: unknown[][]): string {
    const lines: string[] = []
    rows.forEach((row, idx) => {
        if (!Array.isArray(row)) return
        if (idx === 0 && isImportHeaderRow(row)) return
        const cells = row.slice(0, 3).map(cellToString)
        if (cells.every((c) => !c)) return
        // 尾部空列省略（与手输草稿的「可省略」语义一致）
        while (cells.length > 1 && cells[cells.length - 1] === '') cells.pop()
        lines.push(cells.join('\t'))
    })
    return lines.join('\n')
}
