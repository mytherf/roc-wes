# roc-wes 数据源手册 · 总索引

本目录收录 roc-wes 编辑器 **7 种数据源类型** 的完整文档，每种类型各含两份手册：

- **用户使用手册**：面向画面组态/运维人员，讲清「怎么配、怎么用」，含贴近真实业务的实操案例。
- **开发手册**：面向开发者，讲清「怎么实现、怎么扩展」，含架构数据流、关键源码、调试方法。

## 一、数据源类型一览

| 类型 | 标识 | 协议特征 | 接入方式 | 内置演示 | 桌面版真实模式 |
| --- | --- | --- | --- | --- | --- |
| [WebSocket](./websocket/用户使用手册.md) | `websocket` | 全双工长连接、服务端推送 | 浏览器原生 WebSocket | dev 环境 `ws://localhost:8080/ws` | ✅ 直连服务 |
| [HTTP 轮询](./http/用户使用手册.md) | `http` | 请求/响应、定时拉取 | 浏览器原生 fetch | dev 环境 `http://localhost:8081/api/data` | ✅ 直连接口 |
| [SSE](./sse/用户使用手册.md) | `sse` | HTTP 单向推送、自动重连 | 浏览器原生 EventSource | dev 环境 `http://localhost:8082/sse` | ✅ 直连接口 |
| [MQTT](./mqtt/用户使用手册.md) | `mqtt` | 发布/订阅、主题分发 | mqtt.js over WebSocket | dev 环境 `ws://localhost:8083` | ✅ 直连 broker |
| [西门子 S7](./s7/用户使用手册.md) | `s7` | S7comm 二进制（TCP） | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter） | ⏳ 适配器开发中 |
| [OPC UA](./opc/用户使用手册.md) | `opc` | opc.tcp 二进制（TCP） | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter） | ⏳ 适配器开发中 |
| [Modbus](./modbus/用户使用手册.md) | `modbus` | Modbus TCP 二进制 | 桌面版 Rust 原生网关（IPC） | 桌面演示模式（DemoAdapter） | ✅ 原生直连设备 |

> 前 4 种是浏览器原生支持的协议，任何形态下前端 Service 直连即可；后 3 种是工业 TCP 协议，浏览器无法直连，**桌面版经 Tauri IPC 由 Rust 网关原生连接设备**（无中间进程、无本地端口）。内置 Node 网关与工业协议 mock 桥接已退役。

## 二、文档清单

| 数据源 | 用户使用手册 | 开发手册 |
| --- | --- | --- |
| WebSocket | [用户使用手册](./websocket/用户使用手册.md) | [开发手册](./websocket/开发手册.md) |
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
| 西门子 S7 | 规划沿用 nodes7 风格地址（待 S7 spike 确认） | `DB1,REAL0` / `MB0` / `M0.0` |
| OPC UA | NodeId 字符串 | `ns=2;s=Ramp` |
| Modbus | 数据区:地址（0 基） | `holding:100` / `coil:0` |

## 五、演示与端口速查

| 场景 | 说明 |
| --- | --- |
| 浏览器 dev 内置 mock | 随 `npm run dev` 自启：WebSocket 8080、HTTP 8081、SSE 8082、MQTT broker 1883/8083（`mock/server.ts`） |
| 桌面演示模式 | 全部 7 类协议由 Rust `DemoAdapter` 生成模拟曲线，无任何端口 |
| 桌面真实模式 | Rust 网关直接 TCP 连接设备（Modbus 默认端口 502），无中间进程 |

> 生产构建不携带 mock 服务；工业协议不再有 8084/8085/8086 演示桥接与 19100–19102 独立网关进程。

## 六、典型选型建议

- 实时遥测、双向通信、服务端已支持 WS → **WebSocket**
- 服务端只有 REST 接口、数据变化不快 → **HTTP 轮询**
- 服务端单向推送、想走标准 HTTP 且省自重连 → **SSE**
- 海量 IoT 设备、发布/订阅、主题分发 → **MQTT**
- 西门子 S7 系列 PLC → **西门子 S7**（桌面适配器开发中，当前可用演示模式）
- 多厂商统一接入、标准化信息模型 → **OPC UA**（桌面适配器开发中，当前可用演示模式）
- 通用 PLC/仪表、按寄存器读写 → **Modbus**（桌面版已可直连真实设备）

## 七、关键源码索引

| 模块 | 路径 |
| --- | --- |
| 统一类型定义 | `src/services/DataService.ts` |
| 浏览器直连类前端服务 | `src/services/{WebSocket,HttpPolling,Sse,Mqtt}Service.ts` |
| 工业协议前端服务（浏览器保留实现） | `src/services/{S7,Opc,Modbus}Service.ts` + `GatewayService.ts` |
| IPC 数据服务（桌面工业协议） | `src/services/IpcGatewayService.ts` |
| 桌面平台接缝 | `src/platform/isTauri.ts` + `src/platform/deviceConfig.ts` |
| 类型路由与节点绑定 | `src/composables/useDataService.ts` |
| 网关监控探针 | `src/services/GatewayMonitorService.ts`（桌面工业协议走 `mon:` 独立 IPC 会话） |
| 数据源实例 Store | `src/stores/dataSource.ts` |
| 数据源管理对话框 | `src/components/DataSourceDialog.vue` + `DataSourceDeviceConfig.vue` |
| Rust 网关 workspace | `src-tauri/crates/{gateway-core,gateway-engine,gateway-modbus,gateway-demo}` |
| IPC 命令与适配器工厂 | `src-tauri/src/{commands.rs,factory.rs}` |
| 内置演示服务（浏览器 dev） | `mock/server.ts` + `mock/generators.ts` |
