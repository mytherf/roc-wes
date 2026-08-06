//! Tauri 应用状态与事件输出端实现

use gateway_core::{StatusEvent, TelemetryBatch};
use gateway_engine::{EventSink, GatewayEngine};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// 全局状态：网关引擎（经 tauri::Manager::manage 注入）
pub struct AppState {
    pub engine: Arc<GatewayEngine>,
}

/// 前端事件名（与 @tauri-apps/api/event 的 listen 对应）
pub const STATUS_EVENT: &str = "gateway://status";
pub const TELEMETRY_EVENT: &str = "gateway://telemetry";

/// 事件输出端实现：把引擎事件经 Tauri 事件流转发给 WebView。
/// 引擎对 Tauri 零感知（六边形架构"被驱动适配器"）。
pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriEventSink {
    fn status(&self, event: StatusEvent) {
        if let Err(err) = self.app.emit(STATUS_EVENT, &event) {
            tracing::warn!(error = %err, "状态事件发射失败");
        }
    }

    fn telemetry(&self, batch: TelemetryBatch) {
        if let Err(err) = self.app.emit(TELEMETRY_EVENT, &batch) {
            tracing::warn!(error = %err, "遥测事件发射失败");
        }
    }
}
