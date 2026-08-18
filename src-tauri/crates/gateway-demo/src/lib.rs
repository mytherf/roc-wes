//! 演示适配器：不连真实设备，按点位 ID 生成平滑模拟曲线
//!
//! 桌面端演示模式的唯一数据源，取代浏览器版 mock/server.ts 的内置模拟网关：
//! 无需任何端口与假服务器，直接实现 [`DeviceAdapter`] 端口。
//!
//! 按 [`DemoProfile`] 生成四种波形（以波形形状命名，与协议无关；
//! 与原 mock/generators.ts 一一对应）：
//! - sine      ：正弦波 + 微噪声（平滑遥测）
//! - randomWalk：随机游走（缓慢漂移的测量值）
//! - sawtooth  ：锯齿斜升（线性上升后归零）
//! - steps     ：离散档位（方波/阶梯）

use async_trait::async_trait;
use gateway_core::{DemoProfile, DeviceAdapter, GatewayError, Quality, Telemetry};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct DemoAdapter {
    connected: bool,
    /// 波形档位（决定模拟曲线特征）
    profile: DemoProfile,
    /// 随机游走状态：点位 → 上一轮值（游走类波形需要历史状态）
    walk_state: HashMap<String, f64>,
}

impl DemoAdapter {
    pub fn new(profile: DemoProfile) -> Self {
        Self {
            connected: false,
            profile,
            walk_state: HashMap::new(),
        }
    }
}

impl Default for DemoAdapter {
    fn default() -> Self {
        Self::new(DemoProfile::default())
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
        Ok(point_ids
            .iter()
            .map(|p| self.simulate_point(p, now_ms))
            .collect())
    }

    fn kind(&self) -> &'static str {
        "demo"
    }
}

impl DemoAdapter {
    /// 按档位为单个点位生成遥测值
    fn simulate_point(&mut self, point_id: &str, now_ms: u64) -> Telemetry {
        let value = match self.profile {
            DemoProfile::Sine => serde_json::json!(sine_value(point_id, now_ms)),
            DemoProfile::RandomWalk => {
                let prev = self.walk_state.get(point_id).copied().unwrap_or(50.0);
                let next = random_walk_step(prev, point_id, now_ms);
                self.walk_state.insert(point_id.to_string(), next);
                serde_json::json!(next)
            }
            DemoProfile::Sawtooth => serde_json::json!(sawtooth_value(point_id, now_ms)),
            DemoProfile::Steps => serde_json::json!(steps_value(point_id, now_ms)),
        };
        Telemetry {
            point_id: point_id.to_string(),
            value,
            timestamp: now_ms,
            quality: Quality::Good,
        }
    }
}

// ===================== 波形生成（移植自 mock/generators.ts） =====================

/// 由字符串派生稳定整数哈希（用于相位/偏移错开，不同点位曲线互不重叠）
fn hash_u64(s: &str) -> u64 {
    let mut h: i64 = 0;
    for b in s.bytes() {
        h = h.wrapping_mul(31).wrapping_add(b as i64);
    }
    h.unsigned_abs()
}

/// 由 (点位, 时间戳) 派生 0~1 的确定性伪噪声（替代随机源，保证可复现）
fn pseudo_noise(point_id: &str, now_ms: u64) -> f64 {
    (hash_u64(&format!("{point_id}:{now_ms}")) % 1000) as f64 / 1000.0
}

/// 保留一位小数
fn round1(n: f64) -> f64 {
    (n * 10.0).round() / 10.0
}

/// 正弦波：主波（约 20~80）+ 微噪声，随时间连续变化
fn sine_value(point_id: &str, now_ms: u64) -> f64 {
    let phase = (hash_u64(point_id) % 628) as f64 / 100.0;
    let noise = (pseudo_noise(point_id, now_ms) - 0.5) * 2.0; // ±1
    round1(50.0 + 30.0 * (now_ms as f64 / 5000.0 + phase).sin() + noise)
}

/// 随机游走：单步在上次值基础上步进 ±6，钳制 0~100
fn random_walk_step(prev: f64, point_id: &str, now_ms: u64) -> f64 {
    let step = (pseudo_noise(point_id, now_ms) - 0.5) * 12.0;
    round1((prev + step).clamp(0.0, 100.0))
}

/// 锯齿斜升：10 秒周期内从 0 线性升至 100 后归零
fn sawtooth_value(point_id: &str, now_ms: u64) -> f64 {
    let period: u64 = 10_000;
    let phase = (hash_u64(point_id) % 628) as f64 / 100.0; // 0~2π
    let offset = (phase / (2.0 * std::f64::consts::PI) * period as f64) as u64;
    round1((((now_ms + offset) % period) as f64 / period as f64) * 100.0)
}

/// 离散档位：在 [0, 25, 50, 75, 100] 间按 3 秒步进切换
const STEP_LEVELS: [f64; 5] = [0.0, 25.0, 50.0, 75.0, 100.0];
fn steps_value(point_id: &str, now_ms: u64) -> f64 {
    let step = now_ms / 3000;
    let idx = ((step + hash_u64(point_id)) % STEP_LEVELS.len() as u64) as usize;
    STEP_LEVELS[idx]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_value_in_range_and_deterministic() {
        for t in (0..100_000u64).step_by(500) {
            let v = sine_value("sensor.temp.001", t);
            assert!((19.0..=81.0).contains(&v), "正弦值越界: {v}");
        }
        assert_eq!(sine_value("p1", 12345), sine_value("p1", 12345));
        // 不同点位相位错开：同时间戳下多点不全相等
        let vals: Vec<f64> = (0..5)
            .map(|i| sine_value(&format!("pt{i}"), 50_000))
            .collect();
        assert!(vals.windows(2).any(|w| w[0] != w[1]));
    }

    #[test]
    fn random_walk_stays_in_range_and_deterministic() {
        let mut prev = 50.0;
        for t in (0..200_000u64).step_by(1000) {
            prev = random_walk_step(prev, "walk.point", t);
            assert!((0.0..=100.0).contains(&prev), "游走值越界: {prev}");
        }
        assert_eq!(random_walk_step(50.0, "p", 999), random_walk_step(50.0, "p", 999));
    }

    #[test]
    fn sawtooth_in_range_and_deterministic() {
        for t in (0..30_000u64).step_by(250) {
            let v = sawtooth_value("saw.point", t);
            assert!((0.0..=100.0).contains(&v), "锯齿值越界: {v}");
        }
        assert_eq!(sawtooth_value("p", 4321), sawtooth_value("p", 4321));
    }

    #[test]
    fn steps_discrete_levels_and_3s_step() {
        let allowed = [0.0, 25.0, 50.0, 75.0, 100.0];
        for t in (0..20_000u64).step_by(500) {
            let v = steps_value("dev.state", t);
            assert!(allowed.contains(&v), "档位值非法: {v}");
        }
        // 同一 3 秒窗口内值不变，跨窗口可能变化
        assert_eq!(steps_value("d", 9000), steps_value("d", 9999));
    }

    #[tokio::test]
    async fn read_requires_connection_and_dispatches_profile() {
        let mut adapter = DemoAdapter::new(DemoProfile::Sawtooth);
        // 未连接时读取应报错
        let err = adapter.read(&["a".to_string()]).await;
        assert!(matches!(err, Err(GatewayError::NotConnected)));

        adapter.connect().await.unwrap();
        let batch = adapter.read(&["a".to_string(), "b".to_string()]).await.unwrap();
        assert_eq!(batch.len(), 2);
        assert!(batch.iter().all(|t| t.quality == Quality::Good));
    }
}
