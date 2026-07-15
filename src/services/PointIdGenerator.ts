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
    private static instance: PointIdGenerator
    private usedIds: Set<string> = new Set()

    private constructor() {}

    /**
     * 获取单例实例
     */
    static getInstance(): PointIdGenerator {
        if (!this.instance) {
            this.instance = new PointIdGenerator()
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
            // 检查 binding 中的 pointId
            if (data.binding?.pointId) {
                this.usedIds.add(data.binding.pointId)
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