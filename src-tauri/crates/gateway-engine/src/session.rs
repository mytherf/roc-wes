//! 设备会话轮询任务：独占一个 DeviceAdapter，周期性读取订阅点位并分发事件

use crate::EventSink;
use gateway_core::{DeviceAdapter, StatusEvent, TelemetryBatch};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tokio::time::{interval, Duration, MissedTickBehavior};
use tracing::{debug, warn};

/// 轮询间隔下限（毫秒）：防止高频轮询打满设备链路与 CPU
pub const MIN_POLL_INTERVAL_MS: u64 = 200;

/// 连接失败退避：初始 2s，指数翻倍，封顶 30s
const BACKOFF_INITIAL_MS: u64 = 2_000;
const BACKOFF_MAX_MS: u64 = 30_000;

/// 会话控制指令
pub enum SessionCmd {
    Subscribe(String),
    Unsubscribe(String),
    /// 写入点位值：经 resp 回传结果（适配器由会话任务独占，写入必须在本任务内执行）
    Write {
        point_id: String,
        value: serde_json::Value,
        resp: oneshot::Sender<Result<(), String>>,
    },
    Shutdown,
}

/// 会话句柄：指令通道 + 任务句柄
pub struct SessionHandle {
    pub tx: mpsc::Sender<SessionCmd>,
    pub task: JoinHandle<()>,
}

/// 启动会话轮询任务。
///
/// 任务状态机：未连接 → connect()（成功发 status(true)，失败发 status(false) 并退避重试）；
/// 已连接 → 每个 tick 读取全部订阅点位，批量推送遥测；读取失败则断开并回到重连流程。
/// 状态事件仅在连接状态翻转时推送，避免离线期间刷屏。
pub fn spawn_session(
    device_id: String,
    mut adapter: Box<dyn DeviceAdapter>,
    poll_interval_ms: u64,
    sink: Arc<dyn EventSink>,
) -> SessionHandle {
    let (tx, mut rx) = mpsc::channel::<SessionCmd>(64);
    let task = tokio::spawn(async move {
        let mut points: HashSet<String> = HashSet::new();
        let mut ticker = interval(Duration::from_millis(poll_interval_ms.max(MIN_POLL_INTERVAL_MS)));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

        let mut connected = false;
        // 最近一次已向 UI 上报的连接状态（仅在翻转时上报，失败详情写日志）
        let mut reported: Option<bool> = None;
        let mut backoff_ms = BACKOFF_INITIAL_MS;

        loop {
            // ---------- 未连接：尝试建连 ----------
            if !connected {
                match adapter.connect().await {
                    Ok(()) => {
                        connected = true;
                        backoff_ms = BACKOFF_INITIAL_MS;
                        if reported != Some(true) {
                            reported = Some(true);
                            sink.status(StatusEvent {
                                device_id: device_id.clone(),
                                connected: true,
                                message: format!("{} 设备已连接", adapter.kind()),
                            });
                        }
                    }
                    Err(err) => {
                        warn!(device = %device_id, error = %err, backoff_ms, "设备连接失败，稍后重试");
                        if reported != Some(false) {
                            reported = Some(false);
                            sink.status(StatusEvent {
                                device_id: device_id.clone(),
                                connected: false,
                                message: err.to_string(),
                            });
                        }
                        // 退避等待期间仍响应控制指令（订阅 / 退出；写入直接报未连接）
                        tokio::select! {
                            Some(cmd) = rx.recv() => match cmd {
                                SessionCmd::Subscribe(p) => { points.insert(p); }
                                SessionCmd::Unsubscribe(p) => { points.remove(&p); }
                                SessionCmd::Write { resp, .. } => {
                                    let _ = resp.send(Err("设备未连接，无法写入".into()));
                                }
                                SessionCmd::Shutdown => break,
                            },
                            _ = tokio::time::sleep(Duration::from_millis(backoff_ms)) => {
                                backoff_ms = (backoff_ms * 2).min(BACKOFF_MAX_MS);
                            }
                        }
                        continue;
                    }
                }
            }

            // ---------- 已连接：控制指令 / 周期轮询 ----------
            tokio::select! {
                Some(cmd) = rx.recv() => match cmd {
                    SessionCmd::Subscribe(p) => {
                        debug!(device = %device_id, point = %p, "订阅点位");
                        points.insert(p);
                    }
                    SessionCmd::Unsubscribe(p) => {
                        points.remove(&p);
                    }
                    SessionCmd::Write { point_id, value, resp } => {
                        // 写入失败仅回报错误，不触发重连（与轮询读失败语义区分）
                        let result = adapter
                            .write(&point_id, value)
                            .await
                            .map_err(|e| e.to_string());
                        if result.is_ok() {
                            debug!(device = %device_id, point = %point_id, "点位写入成功");
                        } else {
                            warn!(device = %device_id, point = %point_id, error = ?result, "点位写入失败");
                        }
                        let _ = resp.send(result);
                    }
                    SessionCmd::Shutdown => break,
                },
                _ = ticker.tick() => {
                    if points.is_empty() {
                        continue;
                    }
                    let ids: Vec<String> = points.iter().cloned().collect();
                    match adapter.read(&ids).await {
                        Ok(samples) => {
                            if !samples.is_empty() {
                                sink.telemetry(TelemetryBatch {
                                    device_id: device_id.clone(),
                                    points: samples,
                                });
                            }
                        }
                        Err(err) => {
                            warn!(device = %device_id, error = %err, "轮询读取失败，进入重连");
                            connected = false;
                            let _ = adapter.disconnect().await;
                            if reported != Some(false) {
                                reported = Some(false);
                                sink.status(StatusEvent {
                                    device_id: device_id.clone(),
                                    connected: false,
                                    message: err.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }

        let _ = adapter.disconnect().await;
        sink.status(StatusEvent {
            device_id: device_id.clone(),
            connected: false,
            message: "会话已停止".into(),
        });
        debug!(device = %device_id, "会话任务已退出");
    });
    SessionHandle { tx, task }
}
