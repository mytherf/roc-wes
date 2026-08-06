//! 演示适配器：不连真实设备，按点位 ID 生成平滑模拟曲线
//!
//! 桌面端演示模式的唯一数据源，取代浏览器版 mock/server.ts 的内置模拟网关：
//! 无需任何端口与假服务器，直接实现 [`DeviceAdapter`] 端口。

use async_trait::async_trait;
use gateway_core::{DeviceAdapter, GatewayError, Quality, Telemetry};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct DemoAdapter {
    connected: bool,
}

impl DemoAdapter {
    pub fn new() -> Self {
        Self { connected: false }
    }
}

impl Default for DemoAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl DeviceAdapter for DemoAdapter {
    async fn connect(&mut self) -> Result<(), GatewayError> {
        self.connected = true;
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<(), GatewayError> {
        self.connected = false;
        Ok(())
    }

    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError> {
        if !self.connected {
            return Err(GatewayError::NotConnected);
        }
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Ok(point_ids.iter().map(|p| simulate_point(p, now_ms)).collect())
    }

    fn kind(&self) -> &'static str {
        "demo"
    }
}

/// 由点位 ID 派生确定性波形：基线 + 正弦主波 + 小幅抖动。
/// 不同点位拥有不同基线 / 周期 / 相位，视觉上接近真实传感数据。
fn simulate_point(point_id: &str, now_ms: u64) -> Telemetry {
    let mut hasher = DefaultHasher::new();
    point_id.hash(&mut hasher);
    let seed = hasher.finish();

    let base = (seed % 90) as f64 + 5.0;
    let period_ms = 8_000.0 + (seed % 12_000) as f64;
    let phase = ((seed >> 8) % 6_283) as f64 / 1_000.0;
    let wave = (2.0 * std::f64::consts::PI * now_ms as f64 / period_ms + phase).sin();
    let jitter = (((seed >> 16) % 1_000) as f64 / 1_000.0 - 0.5) * (now_ms as f64 / 997.0).sin();
    let value = ((base + 8.0 * wave + jitter) * 100.0).round() / 100.0;

    Telemetry {
        point_id: point_id.to_string(),
        value: serde_json::json!(value),
        timestamp: now_ms,
        quality: Quality::Good,
    }
}
