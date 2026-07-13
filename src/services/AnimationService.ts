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
 * 节点动画服务
 * 独立调度器，管理所有节点的动画
 */
export class AnimationService {
    private graph: Graph
    private animations: Map<string, AnimationConfig> = new Map()
    private timers: Map<string, number> = new Map()
    private frameId: number | null = null

    constructor(graph: Graph) {
        this.graph = graph
    }

    /**
     * 为节点设置动画
     */
    setAnimation(nodeId: string, config: AnimationConfig) {
        this.stopAnimation(nodeId)
        this.animations.set(nodeId, config)
        this.startAnimation(nodeId, config)
    }

    /**
     * 停止节点动画
     */
    stopAnimation(nodeId: string) {
        if (this.timers.has(nodeId)) {
            clearInterval(this.timers.get(nodeId))
            this.timers.delete(nodeId)
        }
        this.animations.delete(nodeId)
        // 恢复节点原始样式
        const node = this.graph.getCellById(nodeId)
        if (node?.isNode()) {
            this.resetNodeStyle(node as Node)
        }
    }

    /**
     * 启动动画
     */
    private startAnimation(nodeId: string, config: AnimationConfig) {
        const node = this.graph.getCellById(nodeId)
        if (!node?.isNode()) return

        const duration = config.duration || 1000
        const interval = config.interval || duration

        switch (config.type) {
            case 'pulse':
                this.startPulse(node as Node, duration, interval)
                break
            case 'blink':
                this.startBlink(node as Node, duration, interval)
                break
            case 'rotate':
                this.startRotate(node as Node, duration, interval)
                break
            default:
                break
        }
    }

    /**
     * 脉冲动画（缩放 + 透明度）
     */
    private startPulse(node: Node, _duration: number, interval: number) {
        let phase = 0
        const timer = window.setInterval(() => {
            phase = (phase + 0.1) % 1
            const scale = 1 + 0.08 * Math.sin(phase * Math.PI * 2)
            const opacity = 0.7 + 0.3 * Math.sin(phase * Math.PI * 2)
            node.attr('body', {
                transform: `scale(${scale})`,
                opacity,
            })
        }, interval / 10)
        this.timers.set(node.id, timer)
    }

    /**
     * 闪烁动画（透明度）
     */
    private startBlink(node: Node, _duration: number, interval: number) {
        let visible = true
        const timer = window.setInterval(() => {
            visible = !visible
            node.attr('body', {
                opacity: visible ? 1 : 0.2,
            })
        }, interval / 2)
        this.timers.set(node.id, timer)
    }

    /**
     * 旋转动画
     */
    private startRotate(node: Node, _duration: number, interval: number) {
        let angle = 0
        const timer = window.setInterval(() => {
            angle = (angle + 3) % 360
            node.attr('body', {
                transform: `rotate(${angle}deg)`,
            })
        }, interval / 30)
        this.timers.set(node.id, timer)
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

    /**
     * 停止所有动画
     */
    stopAll() {
        for (const [nodeId] of this.timers) {
            this.stopAnimation(nodeId)
        }
        this.animations.clear()
    }

    /**
     * 销毁
     */
    dispose() {
        this.stopAll()
        if (this.frameId) {
            cancelAnimationFrame(this.frameId)
            this.frameId = null
        }
    }
}