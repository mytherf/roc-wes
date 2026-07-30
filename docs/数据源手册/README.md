# roc-wes 数据源手册 · 总索引

本目录收录 roc-wes 编辑器 **7 种数据源类型** 的完整文档，每种类型各含两份手册：

- **用户使用手册**：面向画面组态/运维人员，讲清「怎么配、怎么用」，含贴近真实业务的实操案例。
- **开发手册**：面向开发者，讲清「怎么实现、怎么扩展」，含架构数据流、关键源码、调试方法。

## 一、数据源类型一览

| 类型 | 标识 | 协议特征 | 浏览器接入方式 | 内置演示地址 | 真实网关 |
| --- | --- | --- | --- | --- | --- |
| [WebSocket](./websocket/用户使用手册.md) | `websocket` | 全双工长连接、服务端推送 | 原生 WebSocket，无网关 | `ws://localhost:8080/ws` | —（直连服务） |
| [HTTP 轮询](./http/用户使用手册.md) | `http` | 请求/响应、定时拉取 | 原生 fetch，无网关 | `http://localhost:8081/api/data` | —（直连接口） |
| [SSE](./sse/用户使用手册.md) | `sse` | HTTP 单向推送、自动重连 | 原生 EventSource，无网关 | `http://localhost:8082/sse` | —（直连接口） |
| [MQTT](./mqtt/用户使用手册.md) | `mqtt` | 发布/订阅、主题分发 | mqtt.js over WebSocket，无网关 | `ws://localhost:8083` | —（直连 broker） |
| [西门子 S7](./s7/用户使用手册.md) | `s7` | S7comm 二进制（TCP） | 需 WS 网关桥接 | `ws://localhost:8084/s7` | `ws://localhost:19101/s7` |
| [OPC UA](./opc/用户使用手册.md) | `opc` | opc.tcp 二进制（TCP） | 需 WS 网关桥接 | `ws://localhost:8085/opc` | `ws://localhost:19102/opc` |
| [Modbus](./modbus/用户使用手册.md) | `modbus` | Modbus TCP 二进制 | 需 WS 网关桥接 | `ws://localhost:8086/modbus` | `ws://localhost:19100/modbus` |

> 前 4 种是浏览器原生支持的协议，前端 Service 直连服务即可；后 3 种是工业 TCP 协议，浏览器无法直连，须经独立 WS 网关桥接（网关再以原生协议连接真实设备/仿真端）。

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
| 西门子 S7 | nodes7 地址 | `DB1,REAL0` / `MB0` / `M0.0` |
| OPC UA | NodeId 字符串 | `ns=2;s=Ramp` |
| Modbus | 数据区:地址 | `holding:100` / `coil:0` |

## 五、端口与启动命令速查

内置演示服务随 `npm run dev` 自动启动（`mock/server.ts`）；工业协议真实网关/仿真端需手动启动。

| 服务 | 端口 | 启动命令 | 环境变量 |
| --- | --- | --- | --- |
| WebSocket 演示 | 8080 | （随 dev 自启） | — |
| HTTP 演示 | 8081 | （随 dev 自启） | — |
| SSE 演示 | 8082 | （随 dev 自启） | — |
| MQTT broker（TCP/WS） | 1883 / 8083 | （随 dev 自启） | — |
| S7 演示网关 | 8084 | （随 dev 自启） | — |
| OPC UA 演示网关 | 8085 | （随 dev 自启） | — |
| Modbus 演示网关 | 8086 | （随 dev 自启） | — |
| Modbus 真实网关 | 19100 | `npm run gateway` | `GATEWAY_PORT` |
| Modbus 仿真从站 | 19502 | `npm run simulator` | `SIM_PORT` / `SIM_HOST` |
| S7 真实网关 | 19101 | `npm run s7-gateway` | `GATEWAY_S7_PORT` |
| S7 仿真 PLC | 19503 | `npm run s7-simulator` | `SIM_S7_PORT` / `SIM_S7_HOST` |
| OPC UA 真实网关 | 19102 | `npm run opc-gateway` | `GATEWAY_OPC_PORT` |
| OPC UA 仿真服务器 | 19504 | `npm run opc-simulator` | `SIM_OPC_PORT` / `SIM_OPC_HOST` |

> 真实设备相关端口统一使用 19000–19999 段（避开 Windows 保留端口范围）。

## 六、典型选型建议

- 实时遥测、双向通信、服务端已支持 WS → **WebSocket**
- 服务端只有 REST 接口、数据变化不快 → **HTTP 轮询**
- 服务端单向推送、想走标准 HTTP 且省自重连 → **SSE**
- 海量 IoT 设备、发布/订阅、主题分发 → **MQTT**
- 西门子 S7 系列 PLC → **西门子 S7**
- 多厂商统一接入、标准化信息模型 → **OPC UA**
- 通用 PLC/仪表、按寄存器读写 → **Modbus**

## 七、关键源码索引

| 模块 | 路径 |
| --- | --- |
| 统一类型定义 | `src/services/DataService.ts` |
| 各协议前端服务 | `src/services/{WebSocket,HttpPolling,Sse,Mqtt,S7,Opc,Modbus}Service.ts` |
| 类型路由与节点绑定 | `src/composables/useDataService.ts` |
| 数据源实例 Store | `src/stores/dataSource.ts` |
| 数据源管理对话框 | `src/components/DataSourceDialog.vue` |
| 节点数据绑定面板 | `src/components/PropertyPanel.vue`（数据绑定 tab） |
| 内置演示服务 | `mock/server.ts` + `mock/generators.ts` |
| 工业协议网关/仿真 | `gateway/{modbus-gateway,simulator,s7-gateway,s7-simulator,opc-gateway,opc-simulator}.ts` |
