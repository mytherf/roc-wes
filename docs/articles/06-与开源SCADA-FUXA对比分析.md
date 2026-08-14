# 与开源 SCADA/HMI 平台 FUXA 的对比分析

> 对象：[FUXA](https://frangoteam.github.io/FUXA/)（frangoteam 开源，MIT 许可）vs 本项目 roc-wes。
> 目的：从产品定位、技术架构、协议接入、组态编辑、数据存储、运行监控、系统能力七个维度做逐项对照，明确 roc-wes 的差异化优势、能力差距与可借鉴点，为后续演进排期提供依据。
> FUXA 信息取自其 GitHub 仓库（README、`server/runtime`、`client/src/app` 源码目录）与官方文档；roc-wes 信息取自当前代码库实测盘点。

## 一、一句话定位

| | FUXA | roc-wes |
|---|---|---|
| 定位 | 通用 **Web 化 SCADA/HMI 平台**，面向工业自动化与 IoT 的实时过程可视化 | 面向**仓储自动化（WCS）**的**桌面组态编辑器**，仿真演示 → 实时监控 → 运行执行一体 |
| 形态 | B/S：Node.js 服务端 + 浏览器 Angular 客户端，多用户访问 | 纯桌面：Tauri 2 壳（Rust）内嵌 Vue 3，单机单用户、无需服务器 |
| 许可 | MIT（另有付费 FUXA Pro，€100 买断：白标、模板、事件日志、不限安装） | 内部项目 |

一句话概括差异：**FUXA 是"服务器 + 多客户端"的通用 Web SCADA；roc-wes 是"单机桌面 + 设备直连"的仓储专用组态工具**。二者在部署形态上分属两类，多数能力差异都源于这一根本分野。

## 二、技术架构对比

### FUXA

```
浏览器(Angular SPA)
   │  HTTP REST + Socket.IO(实时值推送)
Node.js 服务端(Express, 端口 1881)
   ├── runtime/devices   设备驱动层（15 类驱动，见下）
   ├── runtime/storage   历史数据 DAQ（SQLite/InfluxDB/时序库）
   ├── runtime/alarms    报警引擎
   ├── runtime/scripts   服务端脚本
   ├── runtime/scheduler + jobs  定时任务/报表生成
   ├── runtime/notificator       通知（邮件等）
   ├── runtime/users / apikeys   用户与密钥
   └── runtime/plugins           插件（含 Node-RED 集成）
存储：_appdata(工程) / _db(SQLite) / _logs / _images
```

要点：前后端分离的**服务端中心化**架构。设备采集、报警、脚本、历史库全部跑在 Node 服务端；浏览器只是呈现层，天然支持多客户端同时访问同一工程。部署形态极多：Docker / 源码 / npm 全局包 / Electron 桌面壳 / 无头便携二进制（嵌入式）。

### roc-wes

```
Vue 3 SPA（WebView2 内嵌，vite 1420 仅 dev 用）
   │  invoke / listen（Tauri IPC，无 HTTP、无本地端口）
Rust 侧（Cargo workspace，六边形架构）
   ├── gateway-core    领域模型 + DeviceAdapter 端口
   ├── gateway-engine  会话编排（tokio，退避重连，轮询≥200ms）
   ├── gateway-modbus  Modbus TCP 适配器（tokio-modbus）
   ├── gateway-demo    DemoAdapter（4 种协议特征波形）
   └── 桌面壳 roc-wes-desktop：commands/factory/state + tauri-plugin-fs/dialog/single-instance
存储：%APPDATA%\com.rocwes.desktop 下 JSON 文件（原子写）
```

要点：**无服务器进程**。工业协议由 Rust 原生 TCP 直连设备，遥测经 IPC 事件推给前端；Web 系协议（WebSocket/HTTP/SSE/MQTT）由 WebView 直连。工程数据全部落盘为 JSON，多工程按目录隔离。

### 架构差异小结

| 维度 | FUXA | roc-wes |
|---|---|---|
| 部署单元 | Node 服务（可容器化）+ 浏览器 | 单个 NSIS 安装包 |
| 实时通道 | Socket.IO（服务端广播） | Tauri IPC 事件（进程内） |
| 协议实现位置 | Node 驱动层（node-snap7、modbus-serial、node-opcua 等 JS 库） | Rust crate（tokio-modbus 已落地；S7/OPC 占位）+ WebView 直连 |
| 多客户端 | 原生支持（多浏览器同时看） | 不支持（单机；但支持多 OS 窗口/多屏投放） |
| 现场部署 | 需一台服务器常开 | 装到工位机即用，无运维进程 |
| 技术债风险 | Node 原生依赖（node-snap7/odbc）在 Linux/树莓派上安装困难（官方 README 专门给了裁剪指引） | 桌面壳绑定 Windows/WebView2；跨平台需补 Tauri target |

## 三、设备协议接入对比

FUXA 服务端内置 **15 类驱动**（`server/runtime/devices/device.js` 实测清单）：

Modbus RTU/TCP、Siemens S7、OPC-UA、BACnet/IP、MQTT、Ethernet/IP（Allen-Bradley）、Omron Ethernet/IP、HTTP Request（WebAPI）、ODBC、ADS（Beckhoff）、GPIO（树莓派）、WebCam、MELSEC（三菱）、Redis、FuxaServer（内部虚拟设备）。

roc-wes 定义 **7 种数据源类型**，实现状态如下：

| 协议 | FUXA | roc-wes |
|---|---|---|
| Modbus RTU/TCP | ✅（modbus-serial，RTU+TCP） | ✅ TCP（Rust tokio-modbus，含点位段合并批量读）；**无 RTU 串口** |
| Siemens S7 | ✅（node-snap7） | ⚠️ 占位（配置/演示波形已就位，Rust 适配器待 spike） |
| OPC-UA | ✅（node-opcua） | ⚠️ 占位（同上，待引入 opcua crate） |
| BACnet/IP | ✅ | ❌ 无 |
| MQTT | ✅（服务端代理接入） | ✅（WebView 内 mqtt.js over ws） |
| Ethernet/IP（AB） | ✅ | ❌ 无 |
| Omron Ethernet/IP | ✅ | ❌ 无 |
| HTTP 轮询 | ✅（HTTP Request 驱动） | ✅（WebView 直连轮询） |
| WebSocket | ❌（无原生 WS 驱动，靠 MQTT/WebAPI） | ✅（WebView 直连） |
| SSE | ❌ | ✅（WebView 直连） |
| ODBC / 数据库类 | ✅（ODBC、Redis） | ❌ 无 |
| ADS / GPIO / WebCam / MELSEC | ✅ | ❌ 无 |
| 内部虚拟设备 | ✅ FuxaServer | ✅ DemoAdapter（演示模式覆盖全部 7 类协议，特征波形仿真） |

结论：**协议广度 FUXA 明显领先**（15 vs 7，且工业重型协议全部有真实实现）；roc-wes 当前真实可用的工业协议只有 Modbus TCP，S7/OPC UA 还是占位。roc-wes 的特色是**演示模式做得更深**——所有协议都有确定性波形仿真，开箱即可完整体验绑定与联动，这对售前演示与新手上手价值很高；FUXA 的 FuxaServer 仅提供内部虚拟点。

## 四、组态编辑器对比

| 维度 | FUXA | roc-wes |
|---|---|---|
| 编辑方式 | 浏览器内 SVG 组态：基础图形 + 控件（gauges/controls）+ 社区 SVG 部件库（FUXA-SVG-Widgets 仓库） | X6 图编辑：拖拽节点 + 连线，12 个业务组件（堆垛机/输送线/AGV/穿梭车/分拣机/提升机/机械臂/货架 + 仪表盘/折线图/指示灯/自定义卡片）+ rect/circle 基础形 |
| 画面组织 | 多 View（页面）+ 视图间导航 | 单画布为主 + 4 个画面模板 JSON（agv 调度/立库/全仓/分拣线）；多工程隔离替代多页面 |
| 绑定模型 | 控件属性 ↔ 设备 Tag 绑定，支持 SVG 动效 | 节点 `binding` 点组（`points[]`，主点驱动渲染 + 全点写 `values`），每点可挂 transform 箭头函数 |
| 撤销/重做 | 未作为核心能力 | ✅ X6 History 插件（过滤遥测噪声、拖动合批）+ store 快照双机制，50 步 |
| 快捷键 | 常规 | ✅ 完整快捷键体系（复制/粘贴/成组选择/对齐微调/保存/撤销） |
| 显示模式 | 常规渲染 | ✅ 全局/单节点「图标模式」自适应压缩，适合整仓大画面 |
| 缩放/网格/框选 | ✅ | ✅（0.2~3 倍缩放、点网格、rubberband 框选、虚拟渲染 margin 150） |
| 组件来源 | 通用工业部件 + 社区 SVG | **仓储设备专用组件，预置绑定点位模板**（拖入即可绑定），行业纵深强 |

结论：编辑器的**通用性与图形自由度 FUXA 更高**（任意 SVG 组态、部件生态）；roc-wes 走**行业纵深**路线——组件即仓储设备、带预置点位与动画语义，配套撤销/快捷键/图标模式这些"编辑器基本盘"近期刚补齐。两者是"通用画布 vs 领域模板"的取舍。

## 五、数据存储与历史对比

| 维度 | FUXA | roc-wes |
|---|---|---|
| 工程存储 | 服务端 _appdata（工程文件） | JSON 文件原子写（tauri-plugin-fs，tmp+rename），多工程 `projects/<id>/` 三件套隔离 |
| 历史数据（DAQ） | ✅ 内置历史库：SQLite/InfluxDB/其他时序库；ODBC/Redis 外联 | ❌ 无历史库；折线图为**滑动窗口 20 点**的运行态缓冲，不落盘 |
| 报警记录 | ✅ 报警历史 + 事件日志（Pro 增强） | ⚠️ 仅运行期弹窗/日志，无持久化报警历史 |
| 报表 | ✅ Reports 模块（定时生成，jobs 调度） | ❌ 无 |
| 工程导入导出 | 工程文件 | ✅ 单 JSON 工程文件（`rocwes-project` 格式，IPC 直写任意路径） |

这是**差距最大的一块**：FUXA 是完整 SCADA 数据闭环（采集 → 历史 → 报警 → 报表），roc-wes 目前只有"实时"没有"历史"。若要对标 SCADA，历史数据/报警持久化/报表是 roc-wes 的三大空洞。

## 六、运行监控与报警对比

| 维度 | FUXA | roc-wes |
|---|---|---|
| 运行态 | 浏览器直接查看（多客户端） | RunView 运行模式（只读画布，F5 一键进入），可开独立 OS 窗口多屏投放 |
| 节点详情 | 控件弹窗 | ✅ 双击节点开**每节点独立 OS 窗口**（NodeDetailDialog） |
| 报警类型 | 阈值/状态/趋势/复合告警，支持确认(ack)、通知 | 事件规则：changed/gt/lt/gte/lte/eq/neq + **PLC 式上升沿触发**（防持续报警），动作 console/alert/http 外发 |
| 告警通知 | ✅ notificator（邮件等） | ⚠️ 仅弹窗 + http 外发，无邮件/推送 |
| 脚本 | ✅ 服务端 JS 脚本（Tag 触发/定时） | ❌ 无脚本引擎（transform 函数仅做点位映射） |
| 定时任务 | ✅ scheduler/jobs | ❌ 无 |
| 连接监控 | 设备连接状态 | ✅ GatewayMonitorService：独立 `mon:` 会话探测，连通性/建连耗时/点位值/错误去重 |
| 动画 | SVG 状态动效 | AnimationService + RouteService 驱动**设备沿路线运动**（AGV/穿梭车路径动画） |

roc-wes 的**路线编辑器是独有亮点**：航点/线段（速度/方向/停顿/事件）三形态编辑（底部面板/浮动窗口/独立 OS 窗口），画布叠加方向箭头可视化，运行态驱动节点沿线运动——这是仓储 AGV/穿梭车场景的刚需，FUXA 没有对应概念。报警语义上 roc-wes 的边沿触发设计与 PLC 习惯对齐，但报警的持久化、确认流、通知渠道远不如 FUXA 完整。

## 七、系统能力对比

| 维度 | FUXA | roc-wes |
|---|---|---|
| 用户/权限 | ✅ users 模块 + 登录 + auth guard + API keys | ❌ 无（单机单用户） |
| 多语言 | ✅ language 模块（含 RTL 语言） | ❌ 无 i18n（中文硬编码） |
| 主题 | 常规 | ✅ 4 套主题（ISA-101 高绩效 HMI 默认/工业暗色/亮色/深蓝），画布与图表跟随 |
| 多实例 | Web 天然多客户端 | ✅ 应用单实例插件 + 多工程管理（CRUD/切换/复制/迁移/导入导出） |
| 部署 | Docker/NPM/源码/Electron/无头二进制，跨 Linux/Win/macOS/树莓派 | NSIS 安装包（Windows）；dev 走 `npx tauri dev` |
| 生态集成 | ✅ Node-RED 插件、社区 SVG 部件库、DeepWiki | 文档体系完善（用户手册/开发指南/7 协议×2 数据源手册/articles 系列） |
| 测试 | 未见成体系测试基线 | 前端 vitest 3 文件 14 项 + Rust 11 项 + 集成测试，clippy 零警告基线 |

## 八、能力矩阵总览

图例：● 完整　◐ 部分/有限　○ 缺失

| 能力域 | FUXA | roc-wes |
|---|---|---|
| 工业协议广度（含 S7/OPC/BACnet/EIP） | ● | ◐（Modbus 真实，S7/OPC 占位） |
| Web 系协议（WS/MQTT/HTTP/SSE） | ◐ | ● |
| 演示/仿真模式 | ◐（内部点） | ●（全协议波形仿真） |
| 组态图形自由度（SVG 部件生态） | ● | ◐ |
| 仓储行业组件纵深 | ○ | ● |
| 撤销/重做、快捷键 | ○ | ● |
| 路线/AGV 动画编排 | ○ | ● |
| 多窗口/多屏投放 | ○ | ● |
| 历史数据 DAQ | ● | ○ |
| 报警体系（历史/确认/通知） | ● | ◐ |
| 报表 | ● | ○ |
| 脚本引擎 | ● | ○ |
| 定时任务 | ● | ○ |
| 用户/权限 | ● | ○ |
| 多语言 | ● | ○ |
| 主题 | ◐ | ● |
| 多工程管理 | ◐ | ● |
| 免服务器桌面部署 | ◐（Electron 需服务） | ● |
| 测试基线 | ○ | ● |

## 九、差距与借鉴建议

roc-wes 相对 FUXA 的**核心差距**（按"补齐后收益"排序）：

1. **历史数据（DAQ）**：当前只有运行态滑动窗口。若产品要对标"SCADA"而非"组态看板"，历史库（哪怕先用 SQLite 落盘 values）是绕不开的。
2. **工业协议落地**：S7/OPC UA 目前是占位，这是现场接入的硬门槛；FUXA 用 node-snap7/node-opcua 已验证可行，roc-wes 需在 Rust 侧补 snap7 绑定或 opcua crate（文档中已列为最高风险 spike）。
3. **报警持久化与通知**：边沿触发逻辑已有，缺报警历史、确认流、邮件/推送渠道。
4. **报表与脚本**：FUXA 的 scheduler+jobs+scripts 是标准 SCADA 能力，roc-wes 全缺；短期可用"事件 http 动作 + 外部系统"过渡。
5. **i18n 与用户体系**：仅当产品要出海或多角色使用时才需要；单机桌面定位下优先级低。

roc-wes 的**差异化护城河**（应继续加强而非向 FUXA 看齐）：

- 仓储设备组件库 + 预置点位模板 + 路线动画编排——FUXA 无对应物，是垂直行业纵深；
- 全协议演示仿真——售前/教学场景的开箱体验；
- 免服务器、装到工位机即用——对"每台设备配一个监控终端"的仓储现场比 B/S 更省事；
- ISA-101 主题与编辑器基本盘（撤销/快捷键/图标模式）——组态体验打磨。

## 十、结论

FUXA 是**通用、成熟、服务端中心化**的 Web SCADA：协议广、数据闭环全（历史/报警/报表/脚本/用户/多语言），适合"一套服务器 + 多终端"的工厂级监控。roc-wes 是**垂直、桌面、行业化**的仓储组态工具：在 WCS 组件、路线动画、演示仿真、免服务器部署上形成差异化，但**历史数据、报警闭环、报表脚本、真实 S7/OPC 接入**是它距离"完整 SCADA"的主要空洞。

选型建议：若目标是通用工厂监控、多用户 Web 访问，FUXA 是现成且更完整的选择；若目标是仓储自动化现场的桌面化、行业化监控，roc-wes 的纵深更贴合，但应按上表顺序补齐 DAQ 与工业协议落地，才能真正承接 SCADA 级需求。

---

### 参考来源

- FUXA 官方文档：https://frangoteam.github.io/FUXA/
- FUXA GitHub 仓库：https://github.com/frangoteam/FUXA
- FUXA 社区 SVG 部件库：https://github.com/frangoteam/FUXA-SVG-Widgets
- FUXA Pro / frangoteam：https://frangoteam.org
- FUXA 中文技术解读（架构/协议）：[FUXA 工业可视化平台架构解析](https://blog.csdn.net/gitblog_00703/article/details/160355014)、[FUXA 终极指南](https://blog.csdn.net/gitblog_01049/article/details/160946096)、[学习开源 SCADA 框架 FUXA](https://blog.csdn.net/luck332/article/details/159925920)
