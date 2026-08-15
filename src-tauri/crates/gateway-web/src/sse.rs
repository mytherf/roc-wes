//! SSE 适配器：按点位维持 Server-Sent Events 长连接
//!
//! 语义与旧前端 SseService 一致：每个点单独建立
//! `GET ${url}?pointId=xxx` 的 SSE 流，服务端推送 `data: {JSON}` 帧。
//! 订阅变化时增删对应的读取任务；任一流的连接中断会置位 dead，
//! 由引擎重连后统一重建全部流。

use crate::common::{append_query, new_buffer, parse_frame, SampleBuffer};
use async_trait::async_trait;
use futures_util::StreamExt;
use gateway_core::{DeviceAdapter, GatewayError, SseConfig, Telemetry};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;
use tracing::{debug, warn};

pub struct SseAdapter {
    url: String,
    /// HTTP 客户端（长连接不设整体超时，仅限制建连时间）
    client: Option<reqwest::Client>,
    /// 推送帧缓冲（按点位保留最新未读样本）
    buffer: SampleBuffer,
    /// 每点位一个读取任务
    tasks: HashMap<String, JoinHandle<()>>,
    /// 任一 SSE 流断开时置位 → 下次 read 报错触发引擎重连
    dead: Arc<AtomicBool>,
}

impl SseAdapter {
    pub fn new(config: SseConfig) -> Self {
        Self {
            url: config.url,
            client: None,
            buffer: new_buffer(),
            tasks: HashMap::new(),
            dead: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait]
impl DeviceAdapter for SseAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| GatewayError::Connect(e.to_string()))?;
        self.client = Some(client);
        self.dead.store(false, Ordering::SeqCst);
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        for (_, t) in self.tasks.drain() {
            t.abort();
        }
        self.client = None;
        self.buffer.lock().unwrap().clear();
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let client = self.client.clone().ok_or(GatewayError::NotConnected)?;
        if self.dead.load(Ordering::SeqCst) {
            return Err(GatewayError::Read("SSE 连接已断开".into()));
        }
        // 订阅差量同步：新增点位 spawn 读取任务，移除点位 abort 对应任务
        let next: HashSet<String> = point_ids.iter().cloned().collect();
        for p in self.tasks.keys().cloned().collect::<Vec<_>>() {
            if !next.contains(&p) {
                if let Some(t) = self.tasks.remove(&p) {
                    t.abort();
                }
            }
        }
        for p in &next {
            if !self.tasks.contains_key(p) {
                self.tasks.insert(
                    p.clone(),
                    tokio::spawn(sse_point_task(
                        client.clone(),
                        self.url.clone(),
                        p.clone(),
                        self.buffer.clone(),
                        self.dead.clone(),
                    )),
                );
            }
        }
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
        "sse"
    }
}

/// 单个点位的 SSE 读取任务：请求 → 按行解析 `data:` 帧 → 写入缓冲
async fn sse_point_task(
    client: reqwest::Client,
    base_url: String,
    point: String,
    buffer: SampleBuffer,
    dead: Arc<AtomicBool>,
) {
    let encoded = utf8_percent_encode(&point, NON_ALPHANUMERIC);
    let url = append_query(&base_url, &format!("pointId={encoded}"));
    let resp = match client
        .get(url)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            warn!(point = %point, status = %r.status(), "SSE 连接被拒绝");
            dead.store(true, Ordering::SeqCst);
            return;
        }
        Err(e) => {
            warn!(point = %point, error = %e, "SSE 连接失败");
            dead.store(true, Ordering::SeqCst);
            return;
        }
    };
    debug!(point = %point, "SSE 流已建立");

    let mut stream = resp.bytes_stream();
    let mut pending: Vec<u8> = Vec::new(); // 跨块残留的不完整行
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                warn!(point = %point, error = %e, "SSE 流读取失败");
                break;
            }
        };
        pending.extend_from_slice(&chunk);
        // 按换行切出完整行逐条处理（SSE 帧以空行分隔，数据取 data: 前缀行）
        while let Some(pos) = pending.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = pending.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if let Some(payload) = line.strip_prefix("data:") {
                let payload = payload.trim();
                if payload.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) {
                    if let Some(t) = parse_frame(&v, Some(&point), None) {
                        buffer.lock().unwrap().insert(point.clone(), t);
                    }
                }
                // 心跳等非 JSON 帧忽略
            }
        }
    }
    dead.store(true, Ordering::SeqCst);
}
