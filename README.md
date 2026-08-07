# ROC-WES — 仓储自动化 SCADA 组态平台（桌面版）

基于 Tauri 2 + Vue 3 + AntV X6 v3 的可视化组态编辑器，面向仓储自动化（WCS）设备监控场景，覆盖 **仿真演示 → 实时监控 → 运行执行** 三大核心环节。

桌面版（RocWes Desktop）由 Tauri 2 封装，内嵌 Rust 原生设备网关，通过 IPC 直连工业协议设备（Modbus TCP 已支持，S7 / OPC UA 规划中），无需任何中间网关进程与本地端口。

---

## 核心能力

### 仿真演示

无需真实 PLC / 网关即可完整体验数据绑定与画面联动：Rust `DemoAdapter` 内置模拟曲线，**全部 7 类协议**（含 S7 / OPC / Modbus）均可演示。

演示模式下，数据源监控面板自动注入各协议特征样例点位（如 `holding:100`、`DB1,REAL0`、`ns=2;s=Ramp`），即使画布无节点绑定也能看到实时模拟数据。

### 实时监控

- **数据源管理**：统一管理 7 种协议的数据源连接，支持演示 / 真实双模式一键切换
- **网关监控面板**：在数据源对话框内实时探测连通性、设备状态、建连耗时、数据点实时值与错误告警（工业协议经 IPC 探测，使用独立 `mon:` 会话避免与业务会话冲突）
- **数据绑定**：节点通过 `binding` 配置关联数据源点位，支持 transform 函数将原始值映射为业务状态
- **边沿触发告警**：节点事件系统采用 PLC 语义（上升沿 / 下降沿触发），避免持续报警

### 运行执行

编辑器中设计的画面可通过「运行」按钮进入 SCADA 运行态（`/run` 路由）：全屏展示设备画面、隐藏编辑工具、数据服务持续订阅，适用于现场看板部署或演示汇报。

---

## 组件库

- **WCS 设备**：堆垛机（Stacker）、输送线（Conveyor）、AGV、穿梭车（Shuttle）、分拣机（Sorter）、提升机（Elevator）、机械臂（Robot）、货架（Rack）
- **IoT 监控**：ECharts 仪表盘（Gauge）、实时折线图（Chart）、指示灯（Indicator）
- **基础图形**：矩形（Rect）、圆形（Circle）、自定义卡片（CustomCard）

每个设备节点预置数据绑定点位，拖入画布即自动关联数据源。

---

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 框架 | Vue 3 + Vite | 前端主体 |
| 图引擎 | AntV X6 v3 | 画布编辑 / 运行态渲染 |
| 状态管理 | Pinia | 工程数据经 Tauri FS 以 JSON 文件落盘持久化 |
| 图表 | ECharts | Gauge / Chart 节点 |
| 语言 | TypeScript | 前端全量 TS |
| 桌面壳 | Tauri 2 | WebView2 + Rust 后端 |
| 设备网关 | Rust（tokio / tokio-modbus） | `src-tauri/crates/` 六边形架构 workspace |
| 前端消息 | mqtt.js | MQTT over WebSocket |

---

## 快速开始

### 环境要求

- Node.js ≥ 22
- Rust stable（≥ 1.95）与 `cargo`
- Windows 10/11（依赖 WebView2 运行时，系统一般已内置）

### 桌面开发

```bash
npm install
npx tauri dev        # 自动先启动 vite，再编译并启动桌面应用
```

桌面版数据链路：前端经 IPC 调用 Rust 网关（`gateway_connect / subscribe / unsubscribe / disconnect`），遥测经 `gateway://telemetry` / `gateway://status` 事件推送，全程无本地端口。Web 类协议数据源（ws / http / sse / mqtt）在 WebView 内直连外部服务。

### 构建与打包

```bash
npx tauri build      # vue-tsc 类型检查 + vite build → NSIS 安装包
```

### 测试与检查（Rust 网关）

```bash
cd src-tauri
cargo test --workspace                 # 单元测试 + 集成测试（6 项）
cargo clippy --workspace --all-targets # 静态检查（零警告基线）
```

---

## 项目结构

```
roc-wes/
├── src/                              # Vue 前端
│   ├── components/
│   │   ├── nodes/                    # X6 节点组件（Stacker/Conveyor/Agv/.../Gauge/Chart）
│   │   ├── X6Canvas.vue              # 画布（编辑 + 事件）
│   │   ├── Sidebar.vue               # 组件库面板
│   │   ├── PropertyPanel.vue         # 属性 / 数据绑定面板
│   │   ├── EditorToolbar.vue         # 工具栏（保存/导出/导入/运行）
│   │   ├── DataSourceDialog.vue      # 数据源管理 + 网关监控
│   │   ├── DataSourceDeviceConfig.vue# 工业协议设备参数
│   │   ├── RouteEditorDialog.vue     # AGV 路线编辑器
│   │   ├── RouteFloatWindow.vue      # 路线浮动窗口
│   │   └── StatusBar.vue             # 状态栏
│   ├── composables/                  # useDataService / useGatewayMonitor / useNodeEvents ...
│   ├── services/                     # 各协议数据服务 + GatewayMonitorService 探针
│   ├── platform/                     # 桌面平台接缝：isTauri() + deviceConfig 映射 + fileStorage（文件落盘）
│   ├── stores/                       # editor / dataSource / route / theme
│   └── views/RunView.vue             # SCADA 运行态
├── src-tauri/                        # Tauri 桌面壳 + Rust 原生网关
│   ├── src/                          # commands(IPC) / factory(组合根) / state / lib
│   └── crates/
│       ├── gateway-core/             # 领域模型：DeviceConfig / Telemetry / trait DeviceAdapter
│       ├── gateway-engine/           # 会话编排：轮询/重连退避/EventSink（+集成测试）
│       ├── gateway-modbus/           # Modbus TCP 适配器（tokio-modbus）
│       └── gateway-demo/             # 演示适配器（模拟曲线）
├── docs/                             # 文档中心（见 docs/README.md）
├── templates/                        # 画面模板
└── package.json
```

---

## 数据接入架构

```
┌──────────────────────────────────────────────────┐
│  前端（Vue 3，WebView2）                           │
│  节点组件 ← useDataService ─┬→ Web 协议服务        │  ws/http/sse/mqtt（WebView 直连）
│                             └→ IpcGatewayService  │  工业协议（IPC）
│  数据源管理 ← useGatewayMonitor ← GatewayMonitorService │
└──────────────┬───────────────────────────────────┘
               │ Tauri IPC（无本地端口）
               ▼
┌──────────────────────────────────────────────────┐
│ Rust 网关（src-tauri/crates）                      │
│ engine 会话：轮询≥200ms、失败指数退避 2s→30s 重连    │
│ Modbus ✅ / Demo ✅ / S7·OPC ⏳                     │
└──────────────┬───────────────────────────────────┘
               │ 原生 TCP
               ▼
┌──────────────────────────────────────────────────┐
│ 真实 PLC / 仪表 / OPC 服务器                        │
└──────────────────────────────────────────────────┘
```

路由规则：`useDataService` 对 `s7 / opc / modbus` 三类工业协议经 IPC 构造 `IpcGatewayService`（设备参数经 `platform/deviceConfig.ts` 映射为 Rust `DeviceConfig`）；`ws / http / sse / mqtt` 类协议在 WebView 内直连外部服务。

---

## 部署

`npx tauri build` 产出 NSIS 安装包（`src-tauri/target/release/bundle/nsis/`）。桌面版自带全部运行依赖，工业协议设备开箱直连（Modbus；S7 / OPC UA 见路线图）。

---

## 文档

文档中心位于 [`docs/README.md`](./docs/README.md)，包含：

- [用户手册](./docs/用户手册.md) — 面向组态 / 运维人员
- [开发指南](./docs/开发指南.md) — 环境、命令、扩展点、关键机制
- [数据源手册](./docs/数据源手册/README.md) — 7 种协议 ×（用户使用 + 开发）
- [Tauri 目标架构](./docs/tauri-目标架构.md) — 桌面版架构设计与实现状态

---

## 许可证

MIT License
