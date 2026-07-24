import type { Graph, Node } from '@antv/x6'

/**
 * 动画类型
 */
export type AnimationType = 'pulse' | 'blink' | 'rotate' | 'none'

/**
 * 动画配置
 */
export interface AnimationConfig {
    type: AnimationType
    duration?: number // 毫秒
    interval?: number // 毫秒
}

/**
 * 单个动画的运行时状态
 */
interface AnimationState {
    config: AnimationConfig
    node: Node
    /** 动画起始时间戳（用于基于経過时间计算，避免帧率依赖） */
    startTime: number
    /** 闪烁动画的当前可见性（避免重复设置 attr） */
    visible: boolean
}

/**
 * 节点动画服务
 *
 * 使用单一 requestAnimationFrame 循环统一调度所有节点动画，
 * 替代旧版"每个节点一个 setInterval"的实现：
 * - 帧率由浏览器统一控制，性能更好
 * - 多节点动画不会导致定时器爆炸
 * - 动画进度基于经过时间计算，与帧率无关，表现更稳定
 */
export class AnimationService {
    private graph: Graph
    private animations: Map<string, AnimationState> = new Map()
    private frameId: number | null = null

    constructor(graph: Graph) {
        this.graph = graph
    }

    /**
     * 为节点设置动画
     */
    setAnimation(nodeId: string, config: AnimationConfig) {
        this.stopAnimation(nodeId)

        const cell = this.graph.getCellById(nodeId)
        if (!cell?.isNode()) return

        this.animations.set(nodeId, {
            config,
            node: cell as Node,
            startTime: performance.now(),
            visible: true,
        })
        this.ensureLoop()
    }

    /**
     * 停止节点动画并恢复原始样式
     */
    stopAnimation(nodeId: string) {
        const state = this.animations.get(nodeId)
        if (!state) return

        this.resetNodeStyle(state.node)
        this.animations.delete(nodeId)

        // 无动画时停止循环，释放资源
        if (this.animations.size === 0) {
            this.stopLoop()
        }
    }

    /**
     * 停止所有动画
     */
    stopAll() {
        for (const state of this.animations.values()) {
            this.resetNodeStyle(state.node)
        }
        this.animations.clear()
        this.stopLoop()
    }

    /**
     * 销毁服务
     */
    dispose() {
        this.stopAll()
    }

    /**
     * 确保 rAF 循环运行中（有动画时）
     */
    private ensureLoop() {
        if (this.frameId !== null) return

        const tick = (now: number) => {
            for (const state of this.animations.values()) {
                this.updateAnimation(state, now)
            }
            // 仍有动画时继续循环
            if (this.animations.size > 0) {
                this.frameId = requestAnimationFrame(tick)
            } else {
                this.frameId = null
            }
        }
        this.frameId = requestAnimationFrame(tick)
    }

    /**
     * 停止 rAF 循环
     */
    private stopLoop() {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId)
            this.frameId = null
        }
    }

    /**
     * 更新单个动画（基于经过时间计算，与帧率无关）
     */
    private updateAnimation(state: AnimationState, now: number) {
        const { config, node } = state
        const duration = config.duration || 1000
        const interval = config.interval || duration
        const elapsed = now - state.startTime

        switch (config.type) {
            case 'pulse': {
                // 每个 interval 完成一次脉冲（缩放 + 透明度）
                const phase = (elapsed / interval) % 1
                const scale = 1 + 0.08 * Math.sin(phase * Math.PI * 2)
                const opacity = 0.7 + 0.3 * Math.sin(phase * Math.PI * 2)
                node.attr('body', { transform: `scale(${scale})`, opacity })
                break
            }
            case 'blink': {
                // 每 interval/2 切换一次可见性
                const shouldBeVisible = Math.floor(elapsed / (interval / 2)) % 2 === 0
                if (shouldBeVisible !== state.visible) {
                    state.visible = shouldBeVisible
                    node.attr('body', { opacity: shouldBeVisible ? 1 : 0.2 })
                }
                break
            }
            case 'rotate': {
                // 与旧实现等效的旋转速度（每 interval 转 90°）
                const angle = ((elapsed / interval) * 90) % 360
                node.attr('body', { transform: `rotate(${angle}deg)` })
                break
            }
            default:
                break
        }
    }

    /**
     * 重置节点样式
     */
    private resetNodeStyle(node: Node) {
        node.attr('body', {
            transform: '',
            opacity: 1,
        })
    }
}
