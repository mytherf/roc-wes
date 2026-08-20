// ========== 点 ID 助手注册表（开闭原则扩展点）==========
// 背景：不同协议对「绑定点 ID」的录入规则不同——
//   S7 点位地址结构复杂（数据区 + DB 块 + 类型 + 偏移），禁手输，
//   一律经「地址生成助手」对话框产生，点组还要按 DB 块分 tab 展示；
//   其余协议点 ID 自由输入，无校验无分组。
// 这些协议差异过去硬编码在属性面板绑定页（isS7Source 分支链），
// 现统一收敛为本注册表：新增一种「点 ID 有专属录入规则」的协议时，
// 只需提供助手对话框组件并追加一条注册项，绑定页无需改动。
//
// 未注册的协议走缺省行为：自由输入、不校验、不分组。

import type { Component } from 'vue'
import type { DataSourceType } from '@/stores/dataSource'
import { isValidS7Address, extractDbPrefix } from '@/utils/s7Address'
import S7AddressAssistantDialog from './S7AddressAssistantDialog.vue'

/** 点组归组键：注册项未提供 groupKeyOf 时不分组 */
export type PointGroupKeyFn = (pointId: string) => string

/** 点 ID 助手注册项（按数据源协议类型注册） */
export interface PointIdAssistantEntry {
    /** 点 ID 录入对话框组件；契约：
     *    prop `pointId`（现有点 ID，可反解析时回填编辑）
     *    emit `confirm(pointId)` 确定写入 / `cancel()` 放弃 */
    dialog: Component
    /** 点 ID 是否禁止手输（只读展示，仅能经助手对话框录入） */
    readOnly?: boolean
    /** 校验点 ID 合法性（批量导入点位时非法行跳过并计数）；缺省不校验 */
    validate?: (pointId: string) => boolean
    /** 点组归组键（如 S7 按 DB 前缀分 tab）；缺省扁平展示全部分组 */
    groupKeyOf?: PointGroupKeyFn
    /** 归组键对应的 tab 显示名；缺省直接使用归组键 */
    groupLabel?: (key: string) => string
}

/** S7 非 DB 前缀点位（M/I/Q 区等）的归组键（「其他点位」tab，置尾） */
export const POINT_GROUP_OTHER_KEY = '__other__'

/** 点 ID 助手注册表：数据源类型 → 注册项 */
export const POINT_ID_ASSISTANT_REGISTRY: Partial<Record<DataSourceType, PointIdAssistantEntry>> = {
    s7: {
        dialog: S7AddressAssistantDialog,
        readOnly: true,
        validate: isValidS7Address,
        // 点组按 DB 前缀归组展示；非 DB 地址归「其他点位」
        groupKeyOf: (pointId) => extractDbPrefix(pointId) ?? POINT_GROUP_OTHER_KEY,
        groupLabel: (key) => (key === POINT_GROUP_OTHER_KEY ? '其他点位' : key),
    },
}

/** 查询数据源类型的点 ID 助手（未注册返回 null，绑定页按自由输入处理） */
export function getPointIdAssistant(type?: DataSourceType | string): PointIdAssistantEntry | null {
    if (!type) return null
    return POINT_ID_ASSISTANT_REGISTRY[type as DataSourceType] ?? null
}
