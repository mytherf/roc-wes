# 从零搭建仓储自动化 SCADA 组态平台（五）：SCADA 运行态与单循环动画引擎

> 本系列最终篇。从编辑态到运行态的切换机制、单 requestAnimationFrame 循环驱动的动画引擎、数据订阅的生命周期管理、PLC 语义的边沿触发事件系统，以及主题切换与生产部署。

![SCADA 运行态与动画引擎](images/05-scada-runtime.svg)

## 一、从编辑态到运行态

编辑器中精心编排的画面——设备节点、数据绑定、路线规划、告警规则——最终都要投入实际使用。点击工具栏的「运行」按钮，画面切换到 SCADA 运行态：全屏展示、隐藏编辑工具、数据服务持续订阅、节点实时刷新。

### 数据交接

编辑态和运行态是两个完全独立的路由页面（`/` 和 `/run`），它们之间通过 `sessionStorage` 交接数据：

```typescript
// EditorToolbar.vue - 点击运行
function handleRun() {
  const data = editorStore.graphData
  sessionStorage.setItem('scada-run-data', JSON.stringify(data))
  window.open('/run', '_blank')
}
```

```typescript
// views/RunView.vue - onMounted
const raw = sessionStorage.getItem('scada-run-data')
const graphData = JSON.parse(raw!)

// 用 X6 重建画布
graph.value!.fromJSON({
  cells: [
    ...graphData.nodes,
    ...graphData.edges,
  ],
})
```

运行态是完全**只读**的——`Graph` 实例创建时 `interacting: false`，禁用所有编辑交互（但保留平移和缩放）。它从 `sessionStorage` 接收一份冻结快照，不连接编辑态的 Pinia store。这意味着在运行态打开的画面不会受编辑器后续修改的影响。

### 运行态的数据订阅

虽然运行态不连接 editorStore，但数据订阅是独立的——`RunView.vue` 同样使用 `useDataService` 组合式函数：

```typescript
// RunView.vue
const { bindNodeData, unbindNodeData, dispose } = useDataService(() => graph.value!)

// 遍历所有节点，重新建立数据绑定
graph.value!.getNodes().forEach(node => {
  const data = node.getData()
  if (data?.binding?.pointId) {
    bindNodeData(node, data.binding)
  }
})

// 组件卸载时清理
onBeforeUnmount(() => { dispose() })
```

编辑态和运行态共享同一套数据服务基础设施（`IDataService` 接口 + 7 种协议实现 + 服务缓存），但各自维护独立的服务实例生命周期。

### 虚拟渲染

运行态启用了 X6 的虚拟渲染：`virtual: { enabled: true, margin: 150 }`。对于包含数百个节点的大型 SCADA 画面，只有视口附近 150px 范围内的节点会被实际渲染到 DOM，大幅降低内存占用和渲染开销。

## 二、单循环动画引擎

SCADA 画面中，设备节点需要动画来表达运行状态：堆垛机行走进度条、输送线滚动效果、AGV 沿路线移动、指示灯闪烁。如果每个节点各自启动 `setInterval`，100 个节点就是 100 个定时器——性能灾难。

### 设计：一个 rAF 驱动所有动画

`AnimationService` 用**单个 `requestAnimationFrame` 循环**统一调度所有节点的动画：

```typescript
// services/AnimationService.ts
class AnimationService {
  private animations = new Map<string, AnimationState>()
  private rafId: number | null = null

  setAnimation(nodeId: string, config: AnimationConfig) {
    // 停止旧动画
    this.stopAnimation(nodeId)

    this.animations.set(nodeId, {
      nodeId,
      type: config.type,        // 'pulse' | 'blink' | 'rotate' | 'move'
      startTime: performance.now(),
      domNode: this.findDomNode(nodeId),
      // ...
    })

    // 懒启动：第一个动画时启动 rAF 循环
    if (!this.rafId) this.startLoop()
  }

  stopAnimation(nodeId: string) {
    const state = this.animations.get(nodeId)
    if (state) {
      this.resetVisual(state)
      this.animations.delete(nodeId)
    }
    // 最后一个动画停止时关闭 rAF 循环
    if (this.animations.size === 0) this.stopLoop()
  }

  private startLoop() {
    const tick = () => {
      const now = performance.now()
      for (const state of this.animations.values()) {
        this.updateAnimation(state, now)
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
```

### 基于时间的动画（帧率无关）

动画进度基于**经过时间**计算，而不是帧数：

```typescript
private updateAnimation(state: AnimationState, now: number) {
  const elapsed = now - state.startTime
  const duration = state.config.duration ?? 1000

  switch (state.type) {
    case 'pulse': {
      // 正弦脉冲：opacity 在 0.3~1 之间周期变化
      const phase = (elapsed % duration) / duration
      const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2))
      state.domNode.style.opacity = String(opacity)
      break
    }
    case 'blink': {
      // 闪烁：每 duration/2 毫秒切换可见性
      const visible = Math.floor(elapsed / (duration / 2)) % 2 === 0
      state.domNode.style.visibility = visible ? 'visible' : 'hidden'
      break
    }
    case 'rotate': {
      // 匀速旋转
      const angle = (elapsed / duration) * 360 % 360
      state.domNode.style.transform = `rotate(${angle}deg)`
      break
    }
  }
}
```

基于时间意味着：无论显示器是 60Hz 还是 144Hz，无论帧率是否波动，动画的视觉速度始终一致。60Hz 屏幕上每帧前进 16.7ms，144Hz 屏幕上每帧前进 6.9ms，但经过 1 秒后的动画进度都是 100%。

### 生命周期管理

动画服务的生命周期与画布绑定：

- **节点添加时**：`useGraphSync` 的 `cell:added` 钩子检查节点是否配置了动画，有则调用 `setAnimation`
- **节点删除时**：`cell:removed` 钩子调用 `stopAnimation`
- **数据更新时**：transform 函数可能改变节点状态，触发动画类型切换（如堆垛机从 idle 变为 moving）
- **画布销毁时**：`dispose()` 停止所有动画、取消 rAF

当没有活跃动画时，rAF 循环完全停止——不消耗 CPU。

## 三、PLC 语义的边沿触发事件

SCADA 系统中的告警不应该持续触发——一个温度超限告警应该在**温度从正常变为超限时触发一次**，而不是在温度持续超限时每秒都报一次。这就是 PLC 编程中的**边沿触发**概念。

### 事件模型

```typescript
interface NodeEventRule {
  id: string
  name: string
  trigger: 'rising' | 'falling'   // 上升沿 or 下降沿
  field: string                    // 监测的数据字段
  threshold: number                // 阈值
  action: {
    type: 'alert' | 'sound' | 'script'
    config: Record<string, any>
  }
}
```

- **上升沿（rising）**：字段值从 ≤ threshold 变为 > threshold 时触发
- **下降沿（falling）**：字段值从 > threshold 变为 ≤ threshold 时触发

### 评估引擎

`NodeEventService` 在每次数据更新时评估事件规则：

```typescript
// services/NodeEventService.ts
function evaluateNodeEvents(node: Cell, rules: NodeEventRule[]) {
  const data = node.getData()
  const eventState = data.__eventState ?? {}  // 上一次各字段的状态

  for (const rule of rules) {
    const currentValue = data[rule.field]
    const prevState = eventState[rule.field] ?? false

    let triggered = false
    if (rule.trigger === 'rising') {
      triggered = !prevState && currentValue > rule.threshold
    } else {
      triggered = prevState && currentValue <= rule.threshold
    }

    if (triggered) {
      fireAction(rule.action, { node, rule, value: currentValue })
    }

    // 更新状态
    eventState[rule.field] = currentValue > rule.threshold
  }

  // 写回事件状态（不触发 cell:change）
  node.setData({ __eventState: eventState }, { silent: true })
}
```

每个字段维护一个布尔状态（是否超过阈值），边沿触发通过比较**当前状态与上一次状态**来判断。这确保了告警只在状态变化的瞬间触发一次。

### 事件配置 UI

`PropertyPanel.vue` 的事件标签页提供了可视化的规则编辑器：

```
┌─────────────────────────────────────┐
│  节点事件                            │
│  ┌─────────────────────────────────┐│
│  │ + 添加规则                      ││
│  │                                 ││
│  │ 规则 1: 温度过高告警            ││
│  │ 触发: [上升沿 ▼]               ││
│  │ 字段: [temperature       ]     ││
│  │ 阈值: [80                ]     ││
│  │ 动作: [告警 ▼]                 ││
│  │                         [删除]  ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

事件规则存储在节点的 `data.events` 中，随画布数据一起序列化和持久化。`useNodeEvents` 组合式函数管理规则的加载、编辑和提交——采用 draft-then-commit 模式，编辑在草稿上进行，自动提交到 X6 节点和 Store。

## 四、主题系统

项目内置 3 套主题：`industrial`（深蓝工业风，默认）、`light`（明亮）、`ocean`（海洋蓝）。

### CSS 变量驱动

主题切换完全通过 CSS 自定义属性实现：

```css
[data-theme="industrial"] {
  --panel-bg: #1a1d23;
  --text-primary: #e8e8e8;
  --border-color: #2d3039;
  --canvas-bg: #0f1117;
  --accent: #1890ff;
  /* ... 30+ 变量 */
}

[data-theme="light"] {
  --panel-bg: #ffffff;
  --text-primary: #1f1f1f;
  --border-color: #e8e8e8;
  --canvas-bg: #f5f5f5;
  --accent: #1890ff;
}
```

`<html data-theme="industrial">` 上的属性切换触发全局样式响应。所有组件通过 `var(--panel-bg)` 等引用主题变量，不需要任何 JavaScript 逻辑。

### 画布主题同步

X6 画布的背景色和网格颜色不直接受 CSS 变量控制（X6 用自己的渲染引擎）。`X6Canvas.vue` 通过 `MutationObserver` 监听 `data-theme` 属性变化，读取对应的 CSS 变量值，然后调用 `graph.setBackgroundColor()` 和 `graph.setGrid()` 更新画布：

```typescript
const observer = new MutationObserver((mutations) => {
  if (mutations.some(m => m.attributeName === 'data-theme')) {
    const style = getComputedStyle(document.documentElement)
    graph.setBackgroundColor(style.getPropertyValue('--canvas-bg').trim())
    graph.setGrid({
      color: style.getPropertyValue('--grid-color').trim(),
    })
  }
})
observer.observe(document.documentElement, { attributes: true })
```

## 五、生产部署

### 构建

```bash
npm run build
# 1. vue-tsc 类型检查
# 2. vite build → dist/
```

构建产物是纯静态文件（HTML + CSS + JS），约 2.3MB（gzip 后约 600KB）。

### Nginx 部署

```nginx
server {
    listen 80;
    server_name scada.example.com;
    root /var/www/roc-wes/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

因为使用了 Vue Router 的 history 模式，需要 `try_files` 回退到 `../../index.html`。

### 连接真实设备

生产环境中，内置模拟服务不会启动。连接真实 PLC 需要：

1. 在工控机上运行对应的网关进程：
   ```bash
   npm run gateway        # Modbus TCP → WS（端口 19100）
   npm run s7-gateway     # S7comm → WS（端口 19101）
   npm run opc-gateway    # OPC UA → WS（端口 19102）
   ```

2. 在数据源管理对话框中，将对应协议切换为「真实模式」，填入 PLC 的 IP 地址和端口参数。

网关进程以 WebSocket 桥接方式工作：前端通过 WebSocket 连接网关，网关用原生 TCP 协议连接 PLC。

### 未来演进方向

**Tauri 桌面化**：如果需要系统托盘、开机自启、串口直连（Modbus RTU over RS-485）、多窗口跨显示器等桌面能力，可以用 Tauri 封装。前端代码 100% 复用，网关可以作为 sidecar 进程打包。安装包约 5~10MB，远小于 Electron 的 80~100MB。

**后端持久化**：当前的画布数据存在 `localStorage`（约 5MB 上限）。对于多用户协作、项目版本管理等场景，可以接入后端 API，把 `editorStore.graphData` 序列化后存数据库。`IDataService` 接口也可以扩展一个 `HttpApiService` 实现，对接 RESTful 后端。

**移动端查看**：X6 的画布在移动端浏览器上可以查看（只读），但编辑体验受限于屏幕尺寸。如果移动端监控是刚需，可以考虑做一个轻量的 H5 运行态页面，只展示关键设备和数据。

## 六、系列总结

回顾这 5 篇文章，我们从架构设计到实现细节，完整拆解了 roc-wes 的核心实现：

| 篇目 | 核心内容 | 关键技术点 |
|------|----------|------------|
| 第 1 篇 | 项目总览与架构设计 | 四层架构、7 协议统一接入、技术选型 |
| 第 2 篇 | 画布编辑器核心实现 | X6 集成、节点注册表、配置驱动工厂、双向同步防循环 |
| 第 3 篇 | 多协议数据接入体系 | IDataService、GatewayService 模板方法、Transform 序列化 |
| 第 4 篇 | 路线编辑器与浮动窗口 | Generation 后缀、Teleport defer、自由拖拽 |
| 第 5 篇 | SCADA 运行态与动画引擎 | 单 rAF 循环、边沿触发事件、主题系统 |

整个项目的设计哲学可以归纳为几个核心原则：

**接口驱动的多态**：`IDataService` 让 7 种协议对节点组件透明。

**配置驱动的工厂**：`NodeTemplate` 数组取代了 200 行的 if-else。

**单一数据源 + 防循环同步**：Store 是唯一真相源，5 个标志位守护画布与 Store 的边界。

**时间驱动的动画**：一个 rAF 循环取代 N 个定时器，帧率无关。

**边沿触发的事件**：PLC 语义的状态变化检测，避免告警风暴。

希望这个系列对你的 SCADA / 组态 / 可视化编辑器项目有启发。项目开源，欢迎 Star 和贡献。

---

**上一篇**：[（四）路线编辑器与浮动窗口：Teleport 的巧妙运用](04-路线编辑器与浮动窗口.md)
**系列首篇**：[（一）项目总览与架构设计](01-项目总览与架构设计.md)
