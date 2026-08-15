//! gateway-web — Web 协议适配器 crate（WebSocket / HTTP / SSE / MQTT）
//!
//! 真实模式的四种 Web 协议数据源由 Rust 原生客户端接管：
//! 与演示模式/工业协议同一条链路（gateway-engine 会话轮询 + IPC 事件），
//! WebView 不再直接发起任何协议连接。
//!
//! 推送型协议（WebSocket/SSE/MQTT）采用「后台读取任务 + 最新值缓冲」：
//! - `connect()` 建立连接并 spawn 接收任务，推送数据解析后按点位写入缓冲；
//! - `read(point_ids)` 每轮询周期同步订阅差量并排空缓冲返回（无新数据返回空 vec）；
//! - 连接异常置位 dead 标志，下次 `read()` 返回错误，触发引擎指数退避重连。

mod common;
mod http;
mod mqtt;
mod sse;
mod websocket;

pub use common::{parse_frame, topic_matches};
pub use http::HttpAdapter;
pub use mqtt::MqttAdapter;
pub use sse::SseAdapter;
pub use websocket::WebSocketAdapter;
