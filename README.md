# ROC-WES — 仓储自动化 SCADA 组态平台

基于 Vue 3 + AntV X6 v3 的 Web 可视化组态编辑器，面向仓储自动化（WCS）设备监控场景，覆盖 **仿真演示 → 实时监控 → 运行执行** 三大核心环节。

无需后端服务，浏览器内即可完成设备画面编排、多协议数据接入、实时状态监控与 SCADA 运行态展示。

---

## 核心能力

### 仿真演示

内置 7 类模拟数据服务（随 `npm run dev` 自动启动），无需真实 PLC / 网关即可完整体验数据绑定与画面联动：

| 协议 | 模拟地址 | 数据特征 |
|------|----------|----------|
| WebSocket | `ws://localhost:8080/ws` | 正弦波 20~80 |
| HTTP 轮询 | `http://localhost:8081/api/data` | 随机阶梯 |
| SSE | `http://localhost:8082/sse` | 锯齿斜升 |
| MQTT (WS) | `ws://localhost:8083` | 离散档位 |
| S7 (WS 网关) | `ws://localhost:8084/s7` | 设定值跟踪 |
| OPC UA (WS 网关) | `ws://localhost:8085/opc` | 量化阶梯 |
| Modbus (WS 网关) | `ws://localhost:8086/modbus` | 三角波 |

演示模式下，数据源监控面板自动注入各协议特征样例点位（如 `holding:100`、`DB1,REAL0`、`ns=2;s=Ramp`），即使画布无节点绑定也能看到实时模拟数据。

### 实时监控

- **数据源管理**：统一管理 7 种协议的数据源连接，支持演示 / 真实双模式一键切换
- **网关监控面板**：在数据源对话框内实时探测连通性、设备状态、建连耗时、数据点实时值与错误告警
- **数据绑定**：节点通过 `binding` 配置关联数据源点位，支持 transform 函数将原始值映射为业务状态
- **边沿触发告警**：节点事件系统采用 PLC 语义（上升沿 / 下降沿触发），避免持续报警

### 运行执行

编辑器中设计的画面可通过「运行」按钮进入 SCADA 运行态（`/run` 路由）：

- 全屏展示设备画面，隐藏编辑工具
- 数据服务持续订阅，节点实时刷新
- 适用于现场看板式部署或演示汇报

---

## 组件库

### WCS 设备

堆垛机（Stacker）、输送线（Conveyor）、AGV、穿梭车（Shuttle）、分拣机（Sorter）、提升机（Elevator）、机械臂（Robot）、货架（Rack）

### IoT 监控

ECharts 仪表盘（Gauge）、实时折线图（Chart）、指示灯（Indicator）

### 基础图形

矩形（Rect）、圆形（Circle）、自定义卡片（CustomCard）

每个设备节点预置数据绑定点位，拖入画布即自动关联数据源。

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3 | ^3.5 |
| 构建 | Vite | ^8.1 |
| 图引擎 | AntV X6 | ^3.1 |
| 状态管理 | Pinia | ^3.0 |
| 图表 | ECharts | ^6.1 |
| 语言 | TypeScript | ~6.0 |
| MQTT | mqtt.js | ^5.15 |
| 工业协议 | nodes7 / node-opcua / modbus-serial | — |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（自动拉起全部模拟数据服务）
npm run dev
# → http://localhost:5173
```

### 真实设备网关

连接真实 PLC / 网关时，启动对应的独立网关进程（浏览器经 WebSocket 桥接原生 TCP 协议）：

```bash
# Modbus TCP 网关（端口 19100）+ 仿真从站（端口 19502）
npm run gateway
npm run simulator

# S7comm 网关（端口 19101）+ 仿真 PLC（端口 19503）
npm run s7-gateway
npm run s7-simulator

# OPC UA 网关（端口 19102）+ 仿真服务端（端口 19504）
npm run opc-gateway
npm run opc-simulator
```

在数据源管理中将对应协议切换为「真实模式」，填入设备地址即可。

### 生产构建

```bash
npm run build    # vue-tsc 类型检查 + vite build
npm run preview  # 本地预览构建产物
```

---

## 项目结构

```
roc-wes/
├── src/
│   ├── components/
│   │   ├── nodes/                  # X6 节点组件
│   │   │   ├── StackerNode.vue     # 堆垛机
│   │   │   ├── ConveyorNode.vue    # 输送线
│   │   │   ├── AgvNode.vue         # AGV
│   │   │   ├── ShuttleNode.vue     # 穿梭车
│   │   │   ├── SorterNode.vue      # 分拣机
│   │   │   ├── ElevatorNode.vue    # 提升机
│   │   │   ├── RobotNode.vue       # 机械臂
│   │   │   ├── RackNode.vue        # 货架
│   │   │   ├── GaugeNode.vue       # 仪表盘
│   │   │   ├── ChartNode.vue       # 折线图
│   │   │   ├── IndicatorNode.vue   # 指示灯
│   │   │   ├── CustomCard.vue      # 自定义卡片
│   │   │   ├── nodeTemplates.ts    # 节点配置模板
│   │   │   └── registry.ts         # X6 形状注册
│   │   ├── X6Canvas.vue            # 画布（编辑 + 事件）
│   │   ├── Sidebar.vue             # 组件库面板
│   │   ├── PropertyPanel.vue       # 属性 / 数据绑定面板
│   │   ├── EditorToolbar.vue       # 工具栏（保存/导出/导入/运行）
│   │   ├── DataSourceDialog.vue    # 数据源管理 + 网关监控
│   │   ├── DataSourceDeviceConfig.vue  # 工业协议设备参数
│   │   ├── NodeDetailDialog.vue    # 节点详情弹窗
│   │   └── StatusBar.vue           # 状态栏
│   ├── composables/
│   │   ├── useDataService.ts       # 数据订阅生命周期
│   │   ├── useGatewayMonitor.ts    # 网关监控状态管理
│   │   ├── useNodeEvents.ts        # 节点事件（边沿触发）
│   │   ├── useNodeData.ts          # 节点数据注入
│   │   ├── useNodeStatus.ts        # 节点运行状态
│   │   ├── useGraphSync.ts         # 画布 ↔ Store 同步
│   │   └── useDisplayMode.ts       # 显示模式切换
│   ├── services/
│   │   ├── DataService.ts          # IDataService 接口
│   │   ├── GatewayService.ts       # 工业协议 WS 网关基类
│   │   ├── S7Service.ts            # S7comm 服务
│   │   ├── OpcService.ts           # OPC UA 服务
│   │   ├── ModbusService.ts        # Modbus 服务
│   │   ├── MqttService.ts          # MQTT 服务
│   │   ├── WebSocketService.ts     # WebSocket 服务
│   │   ├── HttpPollingService.ts   # HTTP 轮询服务
│   │   ├── SseService.ts           # SSE 服务
│   │   ├── MockDataService.ts      # 本地模拟数据
│   │   ├── GatewayMonitorService.ts # 网关连通性探针
│   │   ├── NodeEventService.ts     # 事件引擎
│   │   ├── AnimationService.ts     # 动画服务
│   │   └── PointIdGenerator.ts     # 点位 ID 生成器
│   ├── stores/
│   │   ├── editor.ts               # 画布状态（手动持久化）
│   │   └── dataSource.ts           # 数据源配置（自动持久化）
│   ├── views/
│   │   └── RunView.vue             # SCADA 运行态
│   ├── router/index.ts
│   ├── utils/graphSerializer.ts
│   ├── layouts/MainLayout.vue
│   ├── App.vue
│   └── main.ts
├── gateway/                        # 独立 Node.js 网关进程
│   ├── gateway-shared.ts           # 网关工厂（WS 桥接骨架）
│   ├── modbus-gateway.ts           # Modbus TCP → WS（19100）
│   ├── modbus-adapter.ts           # Modbus 批量读适配
│   ├── s7-gateway.ts              # S7comm → WS（19101）
│   ├── s7-adapter.ts              # nodes7 读适配
│   ├── opc-gateway.ts             # OPC UA → WS（19102）
│   ├── opc-adapter.ts             # node-opcua 订阅适配
│   ├── simulator.ts               # Modbus 仿真从站（19502）
│   ├── s7-simulator.ts            # S7 仿真 PLC（19503）
│   └── opc-simulator.ts           # OPC UA 仿真服务端（19504）
├── mock/                           # 内置模拟服务（dev 环境）
│   ├── server.ts                   # 7 类模拟服务统一启动
│   └── generators.ts              # 各协议特征数据生成
├── docs/数据源手册/                 # 7 类型 × 用户使用 + 开发手册
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 数据接入架构

```
┌─────────────────────────────────────────────────────────┐
│  浏览器（Vue 3）                                         │
│                                                         │
│  节点组件 ← useDataService ← IDataService 实现          │
│                │                                        │
│  数据源管理 ← useGatewayMonitor ← GatewayMonitorService │
└────────────┬───────────────────────────────┬────────────┘
             │ WebSocket / HTTP / SSE / MQTT-WS
             ▼                               ▼
┌────────────────────────┐    ┌──────────────────────────────┐
│  内置模拟服务 (mock/)   │    │  独立网关进程 (gateway/)      │
│  端口 8080-8086        │    │  端口 19100-19102            │
│  随 vite dev 自动启动   │    │  手动启动，桥接真实 TCP 设备  │
└────────────────────────┘    └──────────┬───────────────────┘
                                         │ TCP
                                         ▼
                              ┌─────────────────────┐
                              │  真实 PLC / 网关     │
                              │  Modbus / S7 / OPC  │
                              └─────────────────────┘
```

浏览器无法直接建立 TCP 连接，工业协议（S7comm / OPC UA / Modbus TCP）通过独立 Node.js 网关进程桥接为 WebSocket，前端统一以订阅制协议 `{action:'subscribe', topic}` 接收实时数据。

---

## 部署

构建产物为纯静态文件（`dist/`），可部署至任意静态托管：

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

生产环境中，内置模拟服务不会启动。如需连接真实设备，在服务器上运行 `gateway/` 下对应网关进程，并在数据源管理中配置真实地址。

---

## 数据源手册

`docs/数据源手册/` 目录包含 7 种协议的用户使用手册与开发手册，涵盖连接配置、点位格式、transform 函数编写等内容。

---

## 许可证

MIT License
