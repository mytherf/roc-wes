//! 遥测与状态事件模型（Rust → WebView 事件载荷，字段 camelCase）

use serde::{Deserialize, Serialize};

/// 数据质量（与前端 DataPoint.quality 对齐）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    Good,
    Bad,
    Uncertain,
}

/// 单点遥测
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    /// 数据点 ID（如 `holding:0`）
    pub point_id: String,
    pub value: serde_json::Value,
    /// Unix 毫秒时间戳
    pub timestamp: u64,
    pub quality: Quality,
}

/// 设备连接状态事件（`gateway://status`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEvent {
    pub device_id: String,
    pub connected: bool,
    pub message: String,
}

/// 每个轮询周期推送的遥测批次（`gateway://telemetry`）。
/// 按周期批量推送而非逐点推送，降低 IPC 序列化开销。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryBatch {
    pub device_id: String,
    pub points: Vec<Telemetry>,
}
