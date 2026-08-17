# WebSocket 基础知识手册

> 本篇为通用协议知识科普。roc-wes 桌面版的 WebSocket 客户端由 Rust 网关（`tokio-tungstenite`）实现，不走浏览器 API；项目内的接入方式见 [WebSocket 数据源使用手册](./WebSocket%20数据源使用手册.md) 与 [开发手册](./WebSocket%20数据源开发手册.md)。

## 一、什么是 WebSocket？

WebSocket 是一种在单个 TCP 连接上提供全双工通信的网络协议，于 2011 年被 IETF 标准化为 RFC 6455。它允许客户端与服务器之间建立持久的连接，实现实时的双向通信。

### 核心特性

- **双向通信**：客户端和服务器都可以主动发送消息，打破了传统 HTTP 只能由客户端发起请求的限制。
- **全双工**：允许双方同时发送和接收消息。
- **低开销**：连接持久化，减少频繁建立和关闭连接的开销；数据帧头部极小（仅 2-14 字节）。
- **兼容性好**：可运行在 HTTP 端口 80 和 443 上，支持 HTTP 代理和中间件。
- **URI 方案**：使用 `ws://`（非加密）或 `wss://`（加密）作为连接地址。

### 协议演进

- **RFC 6455（2011）** ：基础标准
- **RFC 8441（2018）** ：定义了在 HTTP/2 上运行 WebSocket 的机制
- **RFC 9220（2022）** ：将支持扩展至 HTTP/3


## 二、为什么需要 WebSocket？

传统的 HTTP 协议采用“请求-响应”模式，服务器无法主动向客户端推送数据。为了实现实时通信，开发者曾使用以下变通方案：

| 方案 | 工作原理 | 缺点 |
|------|---------|------|
| **短轮询** | 客户端定时发送 HTTP 请求 | 大量无效请求，浪费资源，延迟高 |
| **长轮询** | 服务器保持连接直到有数据才响应 | 每次仍需重新建立 TCP 连接，资源消耗大 |

WebSocket 通过一次握手建立持久连接，后续数据以帧（Frame）形式双向传输，延迟可降低 90% 以上。


## 三、WebSocket 的工作原理

### 1. 握手过程

WebSocket 的连接从一个 HTTP 请求开始：

**客户端请求**：
```
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```


关键请求头说明：
- `Upgrade: websocket` —— 表明希望将协议升级为 WebSocket
- `Connection: Upgrade` —— 表明连接将被升级
- `Sec-WebSocket-Key` —— 客户端生成的 16 字节随机值的 Base64 编码，用于安全验证
- `Sec-WebSocket-Version: 13` —— 协议版本号（当前唯一广泛支持的版本）

**服务器响应**（握手成功时）：
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```


状态码 `101` 表示协议切换成功。此后，HTTP 连接升级为 WebSocket 连接，双方可在同一 TCP 连接上自由收发数据。

### 2. 数据帧格式

握手完成后，通信使用 WebSocket 专用的轻量级帧协议。每个数据帧的结构如下：

| 字段 | 长度 | 说明 |
|------|------|------|
| FIN | 1 bit | 是否为消息的最后一帧（1=是） |
| RSV1-3 | 3 bit | 保留位，用于扩展协议 |
| Opcode | 4 bit | 帧类型（见下表） |
| Mask | 1 bit | 是否启用掩码（客户端发送必须为 1） |
| Payload Len | 7 bit | 负载长度（可扩展至 16 或 64 bit） |
| Masking Key | 32 bit | 掩码密钥（客户端发送时使用） |
| Payload Data | 可变 | 实际传输的数据 |

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|      |A|     (7)     |       (16/64)               |
|N|V|V|V| (4)  |S|             |   (if payload len==126/127)   |
| |1|2|3|      |K|             |                               |
+-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
|     Extended payload length continued, if payload len == 127  |
+ - - - - - - - - - - - - - - - +-------------------------------+
|                               |         Masking-key          |
|                               |          (if MASK set to 1)  |
+-------------------------------+-------------------------------+
|                    Payload Data                               |
+---------------------------------------------------------------+
```

**Opcode 操作码**（帧类型）：

| 值 | 类型 |
|----|------|
| 0x0 | 延续帧（数据分片） |
| 0x1 | 文本帧（UTF-8） |
| 0x2 | 二进制帧 |
| 0x8 | 连接关闭帧 |
| 0x9 | Ping 帧（心跳检测） |
| 0xA | Pong 帧（心跳响应） |

**掩码机制**：客户端发送到服务器的数据帧必须进行掩码处理（使用随机生成的 Masking Key 对负载数据进行异或运算），服务器收到后反向还原。这是为了防止缓存污染攻击。

### 3. 连接状态

WebSocket 连接的生命周期包含四个状态：

| 状态 | 说明 |
|------|------|
| CONNECTING | 握手进行中（值为 0） |
| OPEN | 连接就绪，可双向通信（值为 1） |
| CLOSING | 关闭握手进行中（值为 2） |
| CLOSED | 连接已终止（值为 3） |

### 4. 心跳与保活机制

为了维持长连接，WebSocket 协议支持心跳检测：

- 客户端可定期发送 **Ping 帧**给服务器
- 服务器收到后必须回复 **Pong 帧**
- 如果一定时间内未收到 Pong 响应，可判断连接已断开，触发重连

心跳间隔通常建议小于 60 秒。这有助于：
- 检测网络中断
- 防止中间网络设备（如 NAT、负载均衡器）因长时间无流量而断开连接


## 四、客户端使用（JavaScript）

### 1. 创建 WebSocket 对象

```javascript
// 创建连接（ws:// 非加密，wss:// 加密）
const socket = new WebSocket('ws://localhost:8080');

// 或指定子协议
const socket = new WebSocket('ws://example.com/socket', 'protocolOne');
```


### 2. 监听事件

```javascript
// 连接建立
socket.addEventListener('open', (event) => {
    console.log('WebSocket 连接已打开');
    socket.send('Hello Server!');  // 发送消息
});

// 接收消息
socket.addEventListener('message', (event) => {
    console.log('收到消息:', event.data);
});

// 发生错误
socket.addEventListener('error', (event) => {
    console.error('WebSocket 错误');
});

// 连接关闭
socket.addEventListener('close', (event) => {
    console.log('连接已关闭');
});
```


### 3. 发送与关闭

```javascript
// 发送消息（支持字符串、Blob、ArrayBuffer）
socket.send('Hello Server!');

// 关闭连接
socket.close(1000, '正常关闭');  // 1000 表示正常关闭
```


### 4. readyState 检查

```javascript
if (socket.readyState === WebSocket.OPEN) {
    socket.send('消息');
}
```


## 五、服务端实现示例

### Node.js（使用 ws 库）

```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('客户端已连接');

    ws.on('message', (message) => {
        console.log(`收到: ${message}`);
        // 广播给所有连接的客户端
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`广播: ${message}`);
            }
        });
    });

    ws.on('close', () => {
        console.log('客户端已断开');
    });
});

console.log('WebSocket 服务器运行在 8080 端口');
```


### 其他语言支持

- **Python**：使用 `websockets` 库
- **Java**：使用 JSR-356（Java API for WebSocket）或 Spring WebSocket
- **C#**：使用原生 WebSocket 支持


## 六、应用场景

WebSocket 适用于需要低延迟、实时双向通信的场景：

| 场景 | 说明 |
|------|------|
| **即时聊天** | 实时收发消息、正在输入提示、已读回执 |
| **在线游戏** | 多玩家操作即时同步 |
| **金融交易** | 实时股票报价、价格更新（毫秒级响应） |
| **实时通知** | 监控告警、系统推送 |
| **体育赛事** | 实时比分、比赛数据推送 |
| **协同编辑** | 多人同时编辑文档 |


## 七、WebSocket vs HTTP

| 对比维度 | WebSocket | HTTP |
|----------|-----------|------|
| 连接方式 | 持久连接（一次握手，持续通信） | 非持久（每次请求需重新建立连接） |
| 通信方向 | 双向（全双工） | 单向（请求-响应） |
| 延迟 | 极低 | 高 |
| 头部开销 | 极小（2-14 字节） | 大（每次请求携带完整头部） |
| 服务器推送 | 支持（主动推送） | 不支持（需轮询模拟） |
| 适用场景 | 实时、高频交互 | 传统 Web 请求、静态资源 |


## 八、最佳实践与注意事项

### 安全性

1. **生产环境必须使用 WSS**（加密连接），`ws://` 仅用于本地开发
2. **验证 Origin**：防止跨站 WebSocket 劫持
3. **身份认证**：在握手阶段验证 JWT 或 Session Token，拒绝未授权连接
4. **限流**：对每个连接实施消息频率限制，防止资源耗尽
5. **输入校验**：对所有接收的消息进行验证和清理

### 稳定性

1. **实现心跳机制**：定期发送 Ping/Pong 帧检测连接活性
2. **断线重连**：断开后使用指数退避策略重连（1s、2s、4s...，加随机偏移，上限 30 秒）
3. **限制并发连接数**：每个用户建议不超过 5 个并发连接

### 性能

1. **禁用代理缓冲**（如 Nginx 的 `proxy_buffering`），避免增加延迟
2. **大消息分片传输**，提高传输效率
3. **使用异步非阻塞 I/O**，提高系统吞吐量

### 注意事项

- **WebSocket API 无法应用背压**（Backpressure）：当消息到达速度超过处理速度时，可能导致内存耗尽或 CPU 100%
- **浏览器兼容性**：WebSocket API 自 2015 年起已在主流浏览器中得到广泛支持