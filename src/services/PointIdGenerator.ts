// ========== 点 ID 生成器（单例）==========
// 什么是“点 ID”（pointId）？
//   每个节点绑定数据时需要一个唯一的标识，如 'sensor.temp'、'agv.status'。
//   如果两个节点用了同一个点 ID，它们会订阅到同一路数据，造成混乱。
// 本类的作用：
//   1. 记住哪些 ID 已被使用（避免重复）
//   2. 生成唯一 ID（冲突时自动追加 _1、_2 序号）
//   3. 节点删除时释放 ID（便于复用）
// 设计为单例：整个应用共享同一份“已使用集合”。

/**
 * 点ID生成器
 * 用于自动生成、管理和去重点ID
 *
 * 核心功能：
 * 1. 从画布节点中初始化已使用的点ID集合
 * 2. 根据模板生成唯一的点ID（自动添加序号避免冲突）
 * 3. 节点删除时释放点ID，便于复用
 *
 * 使用场景：
 * - 侧边栏拖拽节点时自动生成点ID
 * - 节点复制时重新生成点ID（避免冲突）
 */
export class PointIdGenerator {
    private static instance: PointIdGenerator // 单例实例（static：所有地方共享一个）
    private usedIds: Set<string> = new Set() // 已使用 ID 集合（Set：自动去重）

    private constructor() {} // 私有构造：禁止外部 new，只能通过 getInstance() 获取

    /**
     * 获取单例实例
     * @returns 全局唯一的生成器实例
     */
    static getInstance(): PointIdGenerator {
        if (!this.instance) {
            this.instance = new PointIdGenerator() // 第一次调用时创建
        }
        return this.instance
    }

    /**
     * 初始化已使用的点ID集合（从画布节点中读取）
     * @param nodes 画布节点数组
     */
    initFromNodes(nodes: any[]): void {
        this.usedIds.clear()
        for (const node of nodes) {
            // 获取节点数据
            const data = node.getData?.()
            if (!data) continue

            // 检查 pointId 字段
            if (data.pointId) {
                this.usedIds.add(data.pointId)
            }
            // 检查 binding 中的点位（多点组：优先 points 列表，条目兼容字符串/对象；旧数据回退单字段 pointId）
            const binding = data.binding
            if (binding) {
                const points = Array.isArray(binding.points) && binding.points.length > 0
                    ? binding.points
                    : (binding.pointId ? [binding.pointId] : [])
                for (const entry of points) {
                    const pid = typeof entry === 'string' ? entry : entry?.pointId
                    if (pid) this.usedIds.add(pid)
                }
            }
        }
    }

    /**
     * 生成唯一的点ID
     * @param template 模板，如 'sensor.temp'
     * @param suffix 可选后缀（如设备编号），会附加在模板后
     * @returns 唯一的点ID字符串
     *
     * @example
     * generator.generate('sensor.temp')        // 'sensor.temp'
     * generator.generate('sensor.temp')        // 'sensor.temp_1'
     * generator.generate('sensor.temp', '01')  // 'sensor.temp.01'
     */
    generate(template: string, suffix?: string | number): string {
        let base = template
        if (suffix !== undefined) {
            base = `${template}.${suffix}`
        }

        // 如果模板本身未被使用，直接返回
        if (!this.usedIds.has(base)) {
            this.usedIds.add(base)
            return base
        }

        // 否则添加序号
        let index = 1
        let newId = `${base}_${index}`
        while (this.usedIds.has(newId)) {
            index++
            newId = `${base}_${index}`
        }
        this.usedIds.add(newId)
        return newId
    }

    /**
     * 释放点ID（节点删除时调用）
     * @param pointId 要释放的点ID
     */
    release(pointId: string): void {
        if (pointId) {
            this.usedIds.delete(pointId)
        }
    }

    /**
     * 重置生成器（清空所有已使用ID）
     */
    reset(): void {
        this.usedIds.clear()
    }

    /**
     * 检查点ID是否已被使用
     */
    isUsed(pointId: string): boolean {
        return this.usedIds.has(pointId)
    }

    /**
     * 获取所有已使用的点ID列表（用于调试）
     */
    getUsedIds(): string[] {
        return Array.from(this.usedIds)
    }
}