//! MQTT 适配器：Rust 连接 broker，点ID 作为主题过滤器订阅
//!
//! 语义与旧前端 MqttService 一致：
//! - broker 地址沿用现有语义（ws:// MQTT-over-WebSocket；rumqttc 亦支持 mqtt:// 原生 TCP）；
//! - 点ID 即主题过滤器（支持 `+`/`#` 通配符）；
//! - 发布帧解析 JSON：值取 `value|data`，两者皆无时取整个 JSON（兼容裸值发布）；
//! - 遥测 point_id 统一记为订阅过滤器（与前端订阅语义一致）。
//!
//! 实现模式：eventloop 后台任务接收发布并按命中过滤器写入缓冲，
//! read() 每 tick 同步过滤器差量（subscribe/unsubscribe）并排空缓冲。

use crate::common::{new_buffer, parse_frame, topic_matches, SampleBuffer};
use async_trait::async_trait;
use gateway_core::{DeviceAdapter, GatewayError, MqttConfig, Telemetry};
use rumqttc::{AsyncClient, Event, EventLoop, MqttOptions, Packet, QoS};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::JoinHandle;
use tracing::{debug, warn};

pub struct MqttAdapter {
    url: String,
    /// 发布帧缓冲（按订阅过滤器保留最新未读样本）
    buffer: SampleBuffer,
    /// 与 eventloop 任务共享的活动过滤器集
    filters: Arc<Mutex<HashSet<String>>>,
    /// 已向 broker 发送 subscribe 的过滤器集（与下一轮 point_ids 做差量同步）
    subscribed: HashSet<String>,
    client: Option<AsyncClient>,
    task: Option<JoinHandle<()>>,
    /// eventloop 退出时置位 → 下次 read 报错触发引擎重连
    dead: Arc<AtomicBool>,
}

impl MqttAdapter {
    pub fn new(config: MqttConfig) -> Self {
        Self {
            url: config.url,
            buffer: new_buffer(),
            filters: Arc::new(Mutex::new(HashSet::new())),
            subscribed: HashSet::new(),
            client: None,
            task: None,
            dead: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait]
impl DeviceAdapter for MqttAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        let mut opts = MqttOptions::parse_url(&self.url)
            .map_err(|e| GatewayError::Connect(format!("MQTT 地址解析失败: {e}")))?;
        // 唯一 client_id（部分 broker 对重复 client_id 会互踢下线）
        let client_id = format!(
            "roc-wes-{}-{}",
            std::process::id(),
            crate::common::now_ms()
        );
        opts.set_client_id(client_id);
        opts.set_keep_alive(Duration::from_secs(30));
        // cap：内部请求通道容量，足够容纳订阅/退订指令
        let (client, eventloop) = AsyncClient::new(opts, 64);
        self.dead.store(false, Ordering::SeqCst);
        self.task = Some(tokio::spawn(mqtt_eventloop(
            eventloop,
            self.buffer.clone(),
            self.filters.clone(),
            self.dead.clone(),
        )));
        self.client = Some(client);
        debug!(url = %self.url, "MQTT 客户端已启动");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        if let Some(t) = self.task.take() {
            t.abort();
        }
        self.client = None;
        self.subscribed.clear();
        self.filters.lock().unwrap().clear();
        self.buffer.lock().unwrap().clear();
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        let client = self.client.as_ref().ok_or(GatewayError::NotConnected)?;
        if self.dead.load(Ordering::SeqCst) {
            return Err(GatewayError::Read("MQTT 连接已断开".into()));
        }
        // 过滤器差量同步：新增 subscribe，移除 unsubscribe
        let next: HashSet<String> = point_ids.iter().cloned().collect();
        for f in next.difference(&self.subscribed) {
            client
                .subscribe(f, QoS::AtLeastOnce)
                .await
                .map_err(|e| GatewayError::Read(format!("MQTT 订阅失败 {f}: {e}")))?;
        }
        for f in self.subscribed.difference(&next) {
            client
                .unsubscribe(f)
                .await
                .map_err(|e| GatewayError::Read(format!("MQTT 退订失败 {f}: {e}")))?;
        }
        self.subscribed = next.clone();
        *self.filters.lock().unwrap() = next;
        // 排空缓冲中本轮请求过滤器的最新样本
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
        "mqtt"
    }
}

/// eventloop 任务：驱动 MQTT 收发，发布帧按命中的过滤器写入缓冲
async fn mqtt_eventloop(
    mut eventloop: EventLoop,
    buffer: SampleBuffer,
    filters: Arc<Mutex<HashSet<String>>>,
    dead: Arc<AtomicBool>,
) {
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Packet::Publish(p))) => {
                let payload = String::from_utf8_lossy(&p.payload);
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&payload) {
                    let fs = filters.lock().unwrap();
                    for f in fs.iter() {
                        if topic_matches(f, &p.topic) {
                            // point_id 用订阅过滤器；无 value/data 字段时取整个 JSON
                            if let Some(mut t) = parse_frame(&v, Some(f), Some(&v)) {
                                t.point_id = f.clone();
                                buffer.lock().unwrap().insert(f.clone(), t);
                            }
                        }
                    }
                }
                // 非 JSON 载荷忽略（与旧前端行为一致）
            }
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                debug!("MQTT broker 已确认连接");
            }
            Ok(_) => {}
            Err(e) => {
                warn!(error = %e, "MQTT 事件循环退出（连接断开）");
                break;
            }
        }
    }
    dead.store(true, Ordering::SeqCst);
}
