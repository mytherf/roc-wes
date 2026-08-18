# WebSocket 数据源 · 开发手册

> 面向需要维护、调试或扩展 WebSocket 数据接入的开发者。数据源类型标识：`websocket`。

## 一、架构与数据流

WebSocket 数据接入统一由桌面端 Rust 网关接管（**真实模式与演示模式同一条 IPC 链路**，WebView 不直连外部服务）：

```
真实模式：
┌────────────┐  subscribe(pointId)  ┌───────────────────┐   Tauri IPC    ┌────────────────────────┐
│ X6 节点     │ ────────────────▶ │ IpcGatewayService │ ────────────▶ │ Rust WebSocketAdapter  │ ══ WS 长连接 ══▶ 服务端
│  .value     │ ◀──────────────── │  (src/services)   │ ◀──────────── │ (gateway-websocket crate)│
└────────────┘  DataPoint 回调      └───────────────────┘ telemetry 事件  └────────────────────────┘

演示模式：链路相同，仅适配器换为 Rust DemoAdapter（正弦波生成，不占用端口）
```

数据流向（真实模式）：`useDataService` 按数据源创建/缓存 `IpcGatewayService` → 节点绑定时调用 `service.subscribe(pointId, cb)` → 经 IPC 通知 Rust 会话订阅 → Rust 适配器通过 WS 向服务端发送订阅帧 → 服务端推送数据帧 → 适配器后台读取任务解析入缓冲 → 引擎按轮询周期（`pollIntervalMs`，默认 1000ms）批量经 `gateway://telemetry` 事件推回前端 → 前端解析为 `DataPoint` 回调 → 回调把值写入 `node.data.value` 并触发节点事件评估。数据延迟 ≤ pollIntervalMs。

## 二、核心类型定义

所有数据源服务都实现统一接口（`src/services/DataService.ts`）：

```ts
export interface DataPoint {
    id: string                       // 数据点唯一标识
    value: number | string
    timestamp: number
    quality?: 'good' | 'bad' | 'uncertain'
}

export type DataCallback = (point: DataPoint) => void

export interface IDataService {
    subscribe(pointId: string, callback: DataCallback): void
    unsubscribe(pointId: string): void
    isConnected(): boolean
    disconnect(): void
}
```

节点侧的绑定配置（存储在节点 `data.binding`，完整定义见 `src/services/DataService.ts`）：

```ts
export interface BindingPointEntry {
    pointId: string                  // 用于订阅的数据点 ID
    name?: string                    // 点名称（可选，人类可读标识，不参与订阅）
    transformSource?: string         // 该点专属转换函数源码（可选）
    remark?: string                  // 备注（可选，纯说明性文字）
}

export interface DataBindingConfig {
    points: BindingPointEntry[]      // 全部绑定点组：首组为主点（points[0].pointId 即主点 ID，驱动 data.value）
    sourceId?: string                // 引用「数据源管理」中的实例；无 sourceId 则不订阅（节点保持静态值）
    interval?: number                // 更新间隔（毫秒，仅 HTTP 轮询有效）
}
```

数据源实例（`src/stores/dataSource.ts`）：

```ts
export interface DataSource {
    id: string
    name: string
    type: DataSourceType            // 'websocket' | ...
    url: string
    description?: string
    config?: Record<string, any>    // 协议特定参数（WebSocket 通常为空）
}
```

## 三、数据源注册与演示模式判定

用户在「数据源管理」对话框新建数据源（`src/stores/dataSource.ts`）。对话框的类型下拉与连接配置均由注册表驱动（`src/components/dataSource/protocolConfigRegistry.ts`）：选 WebSocket + 真实设备模式时渲染 `dataSource/WebsocketProtocolConfig.vue` 子组件，在其地址栏填写服务地址（存数据源 `url`）；演示模式不显示地址栏，保存时 `config.demo` 置为 `true`；演示模式下还可选择「演示波形」（缺省正弦，四档任选），选择后写入 `config.profile`。

是否为演示模式由 `src/platform/deviceConfig.ts` 的 `isDemoSource` 判定：仅以 `config.demo === true` 为准（演示模式地址可为空）。两种模式保存后均落盘到 `datasources.json`：

```json
{ "id": "ds-1712345-abc123", "name": "内置WebSocket模拟源", "type": "websocket", "url": "", "config": { "demo": true } }
```

```json
{ "id": "ds-1712345-def456", "name": "车间遥测", "type": "websocket", "url": "ws://127.0.0.1:12345", "config": { "demo": false } }
```

前者判定为演示模式（映射 Rust 网关配置 `{ protocol:'websocket', isMock:true, pollIntervalMs }`，缺省正弦；若用户选了「演示波形」则额外带 `profile`）；后者为真实模式（`{ protocol:'websocket', url, pollIntervalMs }`），均交 Rust 网关接管。

## 四、节点绑定提交（PropertyPanel）

属性面板「数据绑定」页选择数据源 + 填写点ID（可选点名称/备注，可「＋ 添加点组」追加附加点，或「⇪ 导入点位（批量）」从 CSV / Excel（xlsx/xls）/ txt 文件批量导入，可先「下载模板」（带表头的 CSV，Excel 可直接打开）填写后再导入；导入方式可选追加（缺省，重复跳过）或覆盖现有点组；粘贴文本每行 `点ID，点名称，备注`）后，`updateBinding` 把配置写入节点并触发订阅（两种模式完全一致）：

```ts
// 有主点即提交绑定，sourceId 允许后补（无 sourceId 的绑定运行期不订阅，节点保持静态值）
if (primary) {
  binding = {
    points: validGroups,                         // 全部点组：点ID + 点名称 + 转换函数 + 备注成组，首组为主点
    sourceId: bindingSourceId.value || undefined,
  }
}
// 写 X6 节点：必须 updateData 顶层整体替换（deep:false），深合并会导致点组删除残留
node.updateData({ binding })
// 写 Store 持久化
editorStore.updateNode(nodeId, { data: { ...(storeNode.data || {}), binding } })
// 先退订旧点，再重建订阅
props.canvasRef.unbindNodeData(nodeId)
if (binding) props.canvasRef.bindNodeData(node)
```

## 五、路由与点组订阅（useDataService）

`src/composables/useDataService.ts` 统一路由并缓存服务实例（全部协议演示/真实模式一律走 Rust 网关）：

```ts
// 所有数据源统一经 Rust 原生网关（IPC）
const service = new IpcGatewayService(
    key,
    buildDeviceConfig(sourceType, sourceUrl, sourceConfig), // websocket → { protocol:'websocket', url, pollIntervalMs }（演示模式另带 isMock:true；选了波形才带 profile）
    sourceType.toUpperCase(),
)
```

缓存键为 `${sourceType}:${sourceUrl}:${JSON.stringify(config)}`：10 个节点绑同一个数据源只创建 **1 个** IPC 会话（`dataServiceMap`），各自订阅不同的 pointId。节点绑定时按**点组**逐点订阅（`resolveBindingPoints` 归一化：取 `points[]` 去重去空）：

```ts
for (const p of resolveBindingPoints(binding)) {
    const transform = compileTransform(p.transformSource)   // 每点编译自己组内的转换函数
    service.subscribe(p.pointId, (point) => {
        const converted = transform ? transform(point.value) : point.value
        // 全部点写入 data.values[pointId]（{ value, rawValue, timestamp, quality }）
        // 主点额外写入 data.value / _rawValue / _timestamp / _quality 驱动节点渲染
        node.setData(nextData)
        evaluateNodeEvents(node.id, currentData, nextData)  // 触发比较类事件（上升沿）
    })
}
```

未绑定数据源（无 `sourceId`）的节点不订阅任何数据，保持静态值。

## 六、IPC 连接与订阅分发（IpcGatewayService → Rust）

`src/services/IpcGatewayService.ts` 实现统一的 `IDataService` 接口，底层为 Tauri IPC（所有数据源的唯一通道）。两种模式仅 `gateway_connect` 的 config 不同：

```ts
// 建会话：演示模式用 DemoAdapter，真实模式用 WebSocketAdapter（作为 WS 客户端连接外部服务）
await invoke('gateway_connect', { deviceId, config: { protocol: 'websocket', isMock: true, pollIntervalMs: 1000 } })
await invoke('gateway_connect', { deviceId, config: { protocol: 'websocket', url: 'ws://127.0.0.1:12345', pollIntervalMs: 1000 } })

// 订阅：登记回调 + 通知 Rust（连接建立前的订阅会补发；真实模式下网关每 tick 差量同步，
// 向服务端发 subscribe 帧）
await invoke('gateway_subscribe', { deviceId, pointId })

// 接收遥测：批量事件按 pointId 分发给该点的所有回调
listen('gateway://telemetry', (e) => {
  for (const p of e.payload.points) { /* 分发给 callbacks.get(p.pointId) */ }
})
```

真实模式下 Rust 侧 `WebSocketAdapter` 接管订阅/解析：建连后拆为读写两半，writer 任务发订阅帧，reader 任务解析推送帧入缓冲，引擎按轮询周期排空缓冲批量上报。

## 七、Rust 适配器实现

文件：`src-tauri/crates/gateway-websocket/src/lib.rs`（`WebSocketAdapter`，每协议一个独立 crate）。

关键机制（「后台读取任务 + 最新值缓冲」模式）：

- **建连与拆分**：`connect()` 用 `tokio-tungstenite` 建连后拆为读写两半；writer 任务经 mpsc 通道收订阅/退订指令并发送 JSON 帧，reader 任务专职解析推送帧。
- **解析入缓冲**：reader 解析 JSON 帧（点ID取 `topic||id||pointId`，值取 `value??data`），仅当前已订阅点位的帧写入共享缓冲，防止缓冲膨胀。
- **订阅差量同步**：`read(point_ids)` 每 tick 对比上次订阅集，新增/移除点位分别下发 `{action:"subscribe"|"unsubscribe", topic}` 帧，随后排空缓冲返回未读样本（无新数据返回空 vec，引擎自动跳过）。
- **断线重连**：reader 退出时置 `dead` 标志，下次 `read()` 报错触发网关引擎指数退避重连（2s→30s），重连后按当前订阅集重新下发订阅帧。

## 八、数据格式与点ID约定

| 方向 | 报文 | 说明 |
| --- | --- | --- |
| Rust 网关 → 服务端 | `{ "action": "subscribe", "topic": "<pointId>" }` | 订阅 |
| Rust 网关 → 服务端 | `{ "action": "unsubscribe", "topic": "<pointId>" }` | 取消订阅 |
| 服务端 → Rust 网关 | `{ "topic", "value", "timestamp"?, "quality"? }` | 数据帧 |

数据帧中点ID字段三选一：`topic` / `id` / `pointId`；数值字段二选一：`value` / `data`；`timestamp`（毫秒）与 `quality` 可省略。点ID即订阅主题，无格式约束，需与服务端一致；不含上述字段的业务指令帧会被安全忽略。

## 九、内置模拟引擎（演示模式）

演示模式由桌面端 Rust 网关内置实现：`src-tauri/crates/gateway-demo/src/lib.rs` 的 `DemoAdapter`（未选波形时缺省正弦），不监听任何端口。

链路：前端 `useDataService` 判定演示模式 → 创建 `IpcGatewayService`（`{ protocol:'websocket', isMock:true }`）→ `invoke('gateway_connect')` → Rust 会话任务按轮询周期调用 `DemoAdapter.read()` → 遥测经 `gateway://telemetry` 事件批量推回前端。真实模式链路完全相同，仅配置为 `{ protocol:'websocket', url, pollIntervalMs }`、适配器为 `WebSocketAdapter`。

波形 profile 由 `buildDeviceConfig` 推导：仅当用户显式选择了合法档位才下发 `config.profile`（四档以波形形状命名、与协议无关：sine=正弦波 / randomWalk=随机游走 / sawtooth=锯齿斜升 / steps=离散档位，任意协议均可指定）；未选择或非法（含旧版协议名）时一律省略，由 Rust 缺省正弦波兜底（全部协议一致）。

数据生成算法——平滑正弦波 + 确定性伪噪声，范围约 20~80：

```rust
/// 正弦波：主波（约 20~80）+ 微噪声，随时间连续变化
fn sine_value(point_id: &str, now_ms: u64) -> f64 {
    let phase = (hash_u64(point_id) % 628) as f64 / 100.0;   // 0~2π，错开各点波形
    let noise = (pseudo_noise(point_id, now_ms) - 0.5) * 2.0; // ±1
    round1(50.0 + 30.0 * (now_ms as f64 / 5000.0 + phase).sin() + noise)
}
```

不同 pointId 的相位由哈希派生错开，多个仪表的曲线不会重叠；数据每轮询一次批量推一批（减少 IPC 开销）。

## 十、数据到达节点 UI 与生命周期管理

`node.setData()` 触发 X6 的 `change:data` 事件，节点 Vue 组件通过 `src/composables/useNodeData.ts` 声明的响应式 ref 自动刷新：

```ts
const { value } = useNodeData(props.node, { value: 0 })  // 模板里 {{ value }} 实时跳动
```

生命周期与清理：

- **断线重连**：真实模式下外部服务停止（或网络中断）后，网关引擎指数退避自动重连（2s→30s）；重连成功后按当前订阅集重新下发订阅帧，无需手动干预。
- **改绑定点ID**：`unbindNodeData(nodeId)` 先退订（真实模式下网关向服务端发 `unsubscribe` 帧）再重建订阅。
- **画布重载**：`unbindAllNodes()` 只退订**不断会话**（会话可复用）。
- **组件卸载**：`dispose()` 退订 + `disconnect()` 销毁全部 IPC 会话（应用退出时 Rust 侧也统一 shutdown）。

## 十一、扩展指南

- **修改模拟数据特征**：编辑 `src-tauri/crates/gateway-demo/src/lib.rs` 的 `sine_value()`（如改为方波、叠加趋势项），`cargo test -p gateway-demo` 验证后重新 `npx tauri dev`。
- **新增推送字段**：在 `src-tauri/crates/gateway-common/src/lib.rs` 的 `parse_frame()` 中扩展解析，并同步前端 `DataPoint` 接口。
- **支持自定义订阅协议**：若你的后端订阅帧不是 `{action,topic}`，在 `gateway-websocket/src/lib.rs` 的订阅帧构造处适配。
- **调整重连策略**：网关引擎统一采用指数退避（2s→30s），见 `src-tauri/crates/gateway-engine`；轮询周期由数据源配置 `pollIntervalMs` 决定（下限 200ms）。

## 十二、调试与验证

1. 演示模式：`npx tauri dev` 启动桌面应用，新建 WebSocket 演示数据源并绑定节点，观察正弦波数值每秒刷新；连接成功后 `gateway://status` 事件 message 为「demo 设备已连接」（演示会话一律由 DemoAdapter 承接，配置仍保持 `protocol:'websocket'` + `isMock:true`）。
2. 真实模式：无真实设备时可用 **HslCommunicationTools**（HslCommunication 工业联调工具）一键起 WS 服务端做集成测试：切到 WebSocket 页签 → 设置监听地址（如 `ws://127.0.0.1:12345`）并启动 → roc-wes 建真实模式数据源指向该地址 → 工具「接收」区可见网关的订阅帧；在「指令」框手动发送 `{"topic":"sensor.temp.001","value":63.4}` 即可观察节点刷新。工具不实现订阅语义（数据帧需手动发送），正好用于验证网关对任意推送格式的解析兼容性。也可用 `wscat` 独立验证服务端协议约定：

```bash
wscat -c ws://192.168.0.10:9000/telemetry
> {"action":"subscribe","topic":"conveyor.01.speed"}
< {"topic":"conveyor.01.speed","value":53.2,"timestamp":1730000000000,"quality":"good"}
```

3. IPC 通道排查：若无数据，依次检查 `gateway://status` 事件是否收到 `connected: true`、`invoke('gateway_subscribe')` 是否成功（前端控制台 `[IPC]` 日志）、Rust 侧日志 `gateway_websocket` 目标是否有连接/订阅记录。

## 十三、关键文件清单

| 文件 | 职责 |
| --- | --- |
| `src/services/DataService.ts` | `DataPoint` / `IDataService` / `DataBindingConfig` 定义 |
| `src/services/IpcGatewayService.ts` | IPC 数据服务（所有数据源唯一通道） |
| `src/composables/useDataService.ts` | 统一路由、缓存服务、节点绑定 |
| `src/stores/dataSource.ts` | 数据源实例 CRUD 与持久化 |
| `src/components/DataSourceDialog.vue` | 数据源管理对话框（类型下拉、保存，注册表驱动） |
| `src/components/dataSource/protocolConfigRegistry.ts` | 协议连接配置注册表（开闭原则扩展点） |
| `src/components/dataSource/WebsocketProtocolConfig.vue` | 真实设备模式连接配置子组件（地址栏） |
| `src/platform/deviceConfig.ts` | `isDemoSource` 演示判定与 Rust 网关配置映射 |
| `src/components/PropertyPanel.vue` | 「数据绑定」标签页 UI 与 `updateBinding` 提交（含导入点位对话框） |
| `src/utils/pointImport.ts` | 点位导入解析（粘贴文本分隔符自动探测：含 Tab 按 Tab 否则逗号；Excel/CSV 行数据转 Tab 分隔草稿，首行表头自动跳过） |
| `src/composables/useNodeData.ts` | 节点组件响应式数据刷新 |
| `src-tauri/crates/gateway-websocket/src/lib.rs` | WebSocket 适配器（真实模式：订阅、缓冲、重连） |
| `src-tauri/crates/gateway-common/src/lib.rs` | Web 协议共享内核（帧解析 / 最新值缓冲） |
| `src-tauri/crates/gateway-demo/src/lib.rs` | 内置演示波形引擎（`sine_value()` 正弦波算法） |
