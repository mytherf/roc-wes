//! WebSocket 适配器：Rust 作为 WS 客户端连接外部推送服务
//!
//! 协议约定与旧前端 WebSocketService 完全一致：
//! - 订阅/退订：连接上发送 `{ "action": "subscribe" | "unsubscribe", "topic": <点ID> }`；
//! - 数据帧：JSON，点ID 取 `topic|id|pointId`，值取 `value|data`。
//!
//! 实现模式：connect 后拆出读写半，writer 任务经 mpsc 通道收发订阅指令帧，
//! reader 任务解析推送帧写入缓冲；read() 每 tick 同步订阅差量并排空缓冲。

use crate::common::{new_buffer, parse_frame, SampleBuffer};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use gateway_core::{DeviceAdapter, GatewayError, Telemetry, WebsocketConfig};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tracing::{debug, warn};

/// 客户端实际连接的流类型（可能带 TLS）
type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// writer 任务指令
enum WsCmd {
    Subscribe(String),
    Unsubscribe(String),
}

pub struct WebSocketAdapter {
    url: String,
    /// 推送帧缓冲（按点位保留最新未读样本）
    buffer: SampleBuffer,
    /// 已向服务端发送 subscribe 的点集（与下一轮 point_ids 做差量同步）
    subscribed: HashSet<String>,
    /// 与 reader 任务共享的活动订阅集：只缓冲已订阅点，防止缓冲区膨胀
    active: Arc<Mutex<HashSet<String>>>,
    /// writer 任务指令通道（None = 未连接）
    cmd_tx: Option<mpsc::Sender<WsCmd>>,
    /// 后台任务句柄（reader + writer）
    tasks: Vec<JoinHandle<()>>,
    /// reader 检测到连接断开时置位 → 下次 read 报错触发引擎重连
    dead: Arc<AtomicBool>,
}

impl WebSocketAdapter {
    pub fn new(config: WebsocketConfig) -> Self {
        Self {
            url: config.url,
            buffer: new_buffer(),
            subscribed: HashSet::new(),
            active: Arc::new(Mutex::new(HashSet::new())),
            cmd_tx: None,
            tasks: Vec::new(),
            dead: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait]
impl DeviceAdapter for WebSocketAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        let (stream, _resp) = connect_async(&self.url)
            .await
            .map_err(|e| GatewayError::Connect(e.to_string()))?;
        let (sink, reader) = stream.split();
        let (tx, rx) = mpsc::channel::<WsCmd>(64);
        self.cmd_tx = Some(tx);
        self.dead.store(false, Ordering::SeqCst);
        self.tasks.push(tokio::spawn(writer_task(sink, rx)));
        self.tasks.push(tokio::spawn(reader_task(
            reader,
            self.buffer.clone(),
            self.active.clone(),
            self.dead.clone(),
        )));
        debug!(url = %self.url, "WebSocket 已连接");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        for t in self.tasks.drain(..) {
            t.abort(); // 丢弃 sink 会关闭连接，abort 确保任务立即退出
        }
        self.cmd_tx = None;
        self.subscribed.clear();
        self.active.lock().unwrap().clear();
        self.buffer.lock().unwrap().clear();
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let tx = self.cmd_tx.as_ref().ok_or(GatewayError::NotConnected)?;
        if self.dead.load(Ordering::SeqCst) {
            return Err(GatewayError::Read("WebSocket 连接已断开".into()));
        }
        // 订阅差量同步：新增点发 subscribe，移除点发 unsubscribe
        let next: HashSet<String> = point_ids.iter().cloned().collect();
        for p in next.difference(&self.subscribed) {
            let _ = tx.try_send(WsCmd::Subscribe(p.clone()));
        }
        for p in self.subscribed.difference(&next) {
            let _ = tx.try_send(WsCmd::Unsubscribe(p.clone()));
        }
        self.subscribed = next.clone();
        *self.active.lock().unwrap() = next;
        // 排空缓冲中本轮请求点位的最新样本
        let mut buf = self.buffer.lock().unwrap();
        let mut out = Vec::new();
        for id in point_ids {
            if let Some(t) = buf.remove(id) {
                out.push(t);
            }
        }
        Ok(out)
    }

    fn kind(&self) -> &'static str {
        "websocket"
    }
}

/// writer 任务：把订阅/退订指令转成 JSON 帧发给服务端
async fn writer_task(
    mut sink: futures_util::stream::SplitSink<WsStream, Message>,
    mut rx: mpsc::Receiver<WsCmd>,
) {
    while let Some(cmd) = rx.recv().await {
        let frame = match cmd {
            WsCmd::Subscribe(t) => serde_json::json!({ "action": "subscribe", "topic": t }),
            WsCmd::Unsubscribe(t) => serde_json::json!({ "action": "unsubscribe", "topic": t }),
        };
        if sink.send(Message::Text(frame.to_string().into())).await.is_err() {
            break; // 发送失败 = 连接已断，reader 会置位 dead
        }
    }
}

/// reader 任务：解析服务端推送帧，命中活动订阅集的写入缓冲
async fn reader_task(
    mut reader: futures_util::stream::SplitStream<WsStream>,
    buffer: SampleBuffer,
    active: Arc<Mutex<HashSet<String>>>,
    dead: Arc<AtomicBool>,
) {
    while let Some(msg) = reader.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(tel) = parse_frame(&v, None, None) {
                        let act = active.lock().unwrap();
                        if act.contains(&tel.point_id) {
                            buffer.lock().unwrap().insert(tel.point_id.clone(), tel);
                        }
                    }
                    // 无 topic/value 的自定义指令帧（如业务回执）安全忽略
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(_) => {} // Ping/Pong/Binary：Ping 由 tungstenite 自动应答
        }
    }
    warn!("WebSocket 读取任务退出（连接断开）");
    dead.store(true, Ordering::SeqCst);
}
