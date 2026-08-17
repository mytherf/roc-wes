# roc-wes 数据源手册 · 总索引

本目录收录 roc-wes 编辑器 **7 种数据源类型** 的完整文档，每种类型各含两份手册：

- **用户使用手册**：面向画面组态/运维人员，讲清「怎么配、怎么用」，含贴近真实业务的实操案例。
- **开发手册**：面向开发者，讲清「怎么实现、怎么扩展」，含架构数据流、关键源码、调试方法。

## 一、数据源类型一览

| 类型 | 标识 | 协议特征 | 接入方式（真实模式） | 内置演示 | 桌面版真实模式 |
| --- | --- | --- | --- | --- | --- |
| [WebSocket](websocket/WebSocket 数据源使用手册.md) | `websocket` | 全双工长连接、服务端推送 | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter 正弦波） | ✅ WebSocketAdapter 直连服务 |
| [HTTP 轮询](./http/用户使用手册.md) | `http` | 请求/响应、定时拉取 | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter 随机游走） | ✅ HttpAdapter 直连接口 |
| [SSE](./sse/用户使用手册.md) | `sse` | HTTP 单向推送、自动重连 | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter 锯齿波） | ✅ SseAdapter 直连接口 |
| [MQTT](./mqtt/用户使用手册.md) | `mqtt` | 发布/订阅、主题分发 | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter 离散档位） | ✅ MqttAdapter 直连 broker |
| [西门子 S7](./s7/用户使用手册.md) | `s7` | S7comm 二进制（TCP） | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter） | ✅ 原生直连 PLC（snap7-client） |
| [OPC UA](./opc/用户使用手册.md) | `opc` | opc.tcp 二进制（TCP） | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter） | ✅ 原生轮询读取（opcua crate） |
| [Modbus](./modbus/用户使用手册.md) | `modbus` | Modbus TCP 二进制 | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter） | ✅ 原生直连设备 |

> 全部 7 种数据源的演示与真实模式统一由桌面端 Rust 网关经 Tauri IPC 接管（**无中间进程、无本地端口**）：Web 协议由对应适配器 crate（gateway-websocket/http/sse/mqtt）连接外部服务，工业协议由 gateway-modbus/s7/opcua 直接 TCP 连接设备。前端 WebView 不直连任何外部服务，旧浏览器时代的直连服务类已移除。
> 全部 7 类协议的**演示模式**均由桌面端 Rust 网关内置 `DemoAdapter` 生成模拟数据（按协议 profile 生成特征波形），不占用任何端口。Node 版内置模拟服务器（原 mock/ 目录）与工业协议 mock 桥接均已退役。

## 二、文档清单

| 数据源 | 用户使用手册 | 开发手册 |
| --- | --- | --- |
| WebSocket | [用户使用手册](websocket/WebSocket 数据源使用手册.md) | [开发手册](websocket/WebSocket 数据源开发手册.md) |
| HTTP 轮询 | [用户使用手册](./http/用户使用手册.md) | [开发手册](./http/开发手册.md) |
| SSE | [用户使用手册](./sse/用户使用手册.md) | [开发手册](./sse/开发手册.md) |
| MQTT | [用户使用手册](./mqtt/用户使用手册.md) | [开发手册](./mqtt/开发手册.md) |
| 西门子 S7 | [用户使用手册](./s7/用户使用手册.md) | [开发手册](./s7/开发手册.md) |
| OPC UA | [用户使用手册](./opc/用户使用手册.md) | [开发手册](./opc/开发手册.md) |
| Modbus | [用户使用手册](./modbus/用户使用手册.md) | [开发手册](./modbus/开发手册.md) |

## 三、统一数据模型（所有数据源通用）

无论哪种数据源，编辑器内部都归一为统一的「数据点」模型，节点绑定与事件评估都基于此：

```ts
interface DataPoint {
  id: string                 // 数据点标识（即各协议的 pointId/topic/地址/NodeId）
  value: number | string     // 数值
  timestamp: number          // 毫秒时间戳
  quality?: 'good' | 'bad' | 'uncertain'  // 数据质量
}
```

节点通过属性面板「数据绑定」标签页接入：选择**数据源实例**（数据源管理中创建）+ 填写**点ID** + 可选**转换函数**。绑定后数据点更新会自动写入 `node.data.value`（附带 `_timestamp`/`_quality`），并驱动节点事件评估。

## 四、点ID（pointId）约定速查

| 数据源 | 点ID含义 | 示例 |
| --- | --- | --- |
| WebSocket | 订阅主题 | `sensor.temp.001` |
| HTTP 轮询 | 查询参数 pointId | `env.humidity.01` |
| SSE | 查询参数 pointId | `progress.task.01` |
| MQTT | MQTT 主题（支持 `+`/`#`） | `device/pump/01/status` |
| 西门子 S7 | nodes7 风格地址（DB/M/I/Q 区标量与位；数组点 v2） | `DB1,REAL0` / `MB0` / `M0.0` |
| OPC UA | NodeId 字符串 | `ns=2;s=Ramp` |
| Modbus | 数据区:地址（0 基） | `holding:100` / `coil:0` |

## 五、演示与端口速查

| 场景 | 说明 |
| --- | --- |
| 桌面演示模式 | 全部 7 类协议由 Rust `DemoAdapter` 按协议 profile 生成特征波形（WebSocket 正弦 / HTTP 随机游走 / SSE 锯齿 / MQTT 档位），无任何端口 |
| 桌面真实模式 | 全部 7 类协议由 Rust 网关适配器直接连接真实服务/设备（工业协议如 Modbus 默认端口 502），无中间进程 |

> Node 版内置模拟服务器（原 `mock/server.ts`，曾占用 8080/8081/8082/8083 端口）已移除；生产构建与开发态均不再启动任何本地 mock 端口。工业协议不再有 8084/8085/8086 演示桥接与 19100–19102 独立网关进程。
> 注：`BUILTIN_MOCK_URLS` 中的 `ws://localhost:8080/ws` 等地址仅保留作**演示模式标识**（表单预填与历史数据源识别），无对应本地服务。

## 六、典型选型建议

- 实时遥测、双向通信、服务端已支持 WS → **WebSocket**
- 服务端只有 REST 接口、数据变化不快 → **HTTP 轮询**
- 服务端单向推送、想走标准 HTTP 且省自重连 → **SSE**
- 海量 IoT 设备、发布/订阅、主题分发 → **MQTT**
- 西门子 S7 系列 PLC → **西门子 S7**（桌面版已可直连真实 PLC）
- 多厂商统一接入、标准化信息模型 → **OPC UA**（桌面版已可轮询真实服务器）
- 通用 PLC/仪表、按寄存器读写 → **Modbus**（桌面版已可直连真实设备）

## 七、关键源码索引

| 模块 | 路径 |
| --- | --- |
| 统一类型定义 | `src/services/DataService.ts` |
| IPC 数据服务（全部数据源唯一通道） | `src/services/IpcGatewayService.ts` |
| 桌面平台接缝 | `src/platform/deviceConfig.ts` |
| 类型路由与节点绑定 | `src/composables/useDataService.ts` |
| 网关监控探针 | `src/services/GatewayMonitorService.ts`（`mon:` 独立 IPC 会话，避免与业务会话冲突） |
| 数据源实例 Store | `src/stores/dataSource.ts` |
| 数据源管理对话框 | `src/components/DataSourceDialog.vue` + `DataSourceDeviceConfig.vue` |
| Rust 网关 workspace | `src-tauri/crates/{gateway-core,gateway-engine,gateway-modbus,gateway-s7,gateway-opcua,gateway-websocket,gateway-http,gateway-sse,gateway-mqtt,gateway-common,gateway-demo}` |
| IPC 命令与适配器工厂 | `src-tauri/src/{commands.rs,factory.rs}` |
| 内置演示波形引擎（桌面演示模式） | `src-tauri/crates/gateway-demo/src/lib.rs`（DemoAdapter 按协议 profile 生成特征波形） |
