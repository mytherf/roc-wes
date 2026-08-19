//! gateway-engine：设备会话编排层
//!
//! 职责：会话生命周期（创建/订阅/断开）、周期轮询、连接失败指数退避重连、
//! 通过 [`EventSink`] 端口向外分发状态与遥测事件。
//!
//! 不依赖 Tauri——Tauri 壳注入 `EventSink` 实现（AppHandle.emit），
//! 其他宿主（单元测试、CLI 诊断工具）可注入自己的实现。

pub mod session;

use gateway_core::{DeviceAdapter, GatewayError, StatusEvent, TelemetryBatch};
use session::{spawn_session, SessionCmd, SessionHandle};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};
use tracing::info;

/// 写入等待会话任务回报的超时（会话被轮询占用时写入需排队）
const WRITE_TIMEOUT: Duration = Duration::from_secs(3);

/// 事件输出端口（六边形架构"被驱动适配器"）。
/// Tauri 壳提供基于 AppHandle.emit 的实现；单测可注入内存实现。
pub trait EventSink: Send + Sync {
    fn status(&self, event: StatusEvent);
    fn telemetry(&self, batch: TelemetryBatch);
}

/// 网关引擎：管理全部设备会话。
///
/// 内部状态用 std::sync::Mutex 保护——仅 HashMap 增删查，临界区极短
/// 且不跨 await，无需 tokio::sync::Mutex。
pub struct GatewayEngine {
    sessions: Mutex<HashMap<String, SessionHandle>>,
    sink: Arc<dyn EventSink>,
}

impl GatewayEngine {
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            sink,
        }
    }

    /// 创建设备会话并启动轮询任务。
    ///
    /// 连接是异步的：任务先尝试 connect，结果经 status 事件通知；
    /// 失败按指数退避自动重试（对齐旧 Node 网关的自动重连行为）。
    pub fn connect(
        &self,
        device_id: String,
        adapter: Box<dyn DeviceAdapter>,
        poll_interval_ms: u64,
    ) -> Result<(), GatewayError> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.contains_key(&device_id) {
            return Err(GatewayError::AlreadyExists(device_id));
        }
        let kind = adapter.kind();
        let handle = spawn_session(device_id.clone(), adapter, poll_interval_ms, self.sink.clone());
        sessions.insert(device_id.clone(), handle);
        info!(device = %device_id, kind, "设备会话已创建");
        Ok(())
    }

    /// 订阅数据点（加入该会话的轮询集合）
    pub fn subscribe(&self, device_id: &str, point_id: String) -> Result<(), GatewayError> {
        self.send(device_id, SessionCmd::Subscribe(point_id))
    }

    /// 取消订阅数据点
    pub fn unsubscribe(&self, device_id: &str, point_id: String) -> Result<(), GatewayError> {
        self.send(device_id, SessionCmd::Unsubscribe(point_id))
    }

    /// 向设备写入单个点位值：指令经会话通道下发，等待会话任务回报结果（带超时）。
    /// 适配器由会话轮询任务独占，写入与轮询读在同一任务内串行执行，无需额外锁。
    pub async fn write(
        &self,
        device_id: &str,
        point_id: String,
        value: serde_json::Value,
    ) -> Result<(), GatewayError> {
        let tx = self
            .sessions
            .lock()
            .unwrap()
            .get(device_id)
            .map(|h| h.tx.clone())
            .ok_or_else(|| GatewayError::NoSuchSession(device_id.to_string()))?;
        let (resp_tx, resp_rx) = oneshot::channel();
        tx.send(SessionCmd::Write {
            point_id,
            value,
            resp: resp_tx,
        })
        .await
        .map_err(|e| GatewayError::Write(format!("会话指令发送失败: {e}")))?;
        match timeout(WRITE_TIMEOUT, resp_rx).await {
            Ok(Ok(result)) => result.map_err(GatewayError::Write),
            Ok(Err(_)) => Err(GatewayError::Write("会话任务已退出".into())),
            Err(_) => Err(GatewayError::Write("写入等待超时".into())),
        }
    }

    fn send(&self, device_id: &str, cmd: SessionCmd) -> Result<(), GatewayError> {
        let sessions = self.sessions.lock().unwrap();
        let handle = sessions
            .get(device_id)
            .ok_or_else(|| GatewayError::NoSuchSession(device_id.to_string()))?;
        handle
            .tx
            .try_send(cmd)
            .map_err(|e| GatewayError::Other(format!("会话指令发送失败: {e}")))
    }

    /// 断开并移除设备会话（等待轮询任务退出）
    pub async fn disconnect(&self, device_id: &str) -> Result<(), GatewayError> {
        let handle = self
            .sessions
            .lock()
            .unwrap()
            .remove(device_id)
            .ok_or_else(|| GatewayError::NoSuchSession(device_id.to_string()))?;
        let _ = handle.tx.send(SessionCmd::Shutdown).await;
        let _ = handle.task.await;
        info!(device = %device_id, "设备会话已断开");
        Ok(())
    }

    /// 断开全部会话（应用退出时调用）
    pub async fn shutdown(&self) {
        let ids: Vec<String> = self.sessions.lock().unwrap().keys().cloned().collect();
        for id in ids {
            if let Err(e) = self.disconnect(&id).await {
                tracing::warn!(device = %id, error = %e, "会话关闭失败");
            }
        }
    }
}
