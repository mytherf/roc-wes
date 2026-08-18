//! 设备连接配置（前端经 IPC 下发，字段为 camelCase）

use serde::{Deserialize, Serialize};

fn default_modbus_port() -> u16 {
    502
}
fn default_s7_port() -> u16 {
    102
}
fn default_unit_id() -> u8 {
    1
}
fn default_s7_slot() -> u8 {
    2
}
fn default_poll_interval_ms() -> u64 {
    1000
}
fn default_http_poll_interval_ms() -> u64 {
    2000
}

/// 设备配置判别联合：
/// `{ protocol: 'modbus' | 's7' | 'opc' | 'websocket' | 'http' | 'sse' | 'mqtt', ... }`
///
/// 演示模式不是独立协议：`protocol` 保持数据源原协议类型，
/// 以 `isMock = true` 标识，由工厂统一路由到 DemoAdapter（波形由 profile 决定）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "protocol", rename_all = "camelCase")]
pub enum DeviceConfig {
    Modbus(ModbusConfig),
    S7(S7Config),
    Opc(OpcConfig),
    /// WebSocket 推送服务（Rust 作为 WS 客户端订阅；isMock 时由 DemoAdapter 生成正弦波形）
    Websocket(WebsocketConfig),
    /// HTTP 轮询服务（按点位 GET 查询；isMock 时由 DemoAdapter 生成随机游走波形）
    Http(HttpConfig),
    /// SSE 推送流（按点位建立长连接；isMock 时由 DemoAdapter 生成锯齿波形）
    Sse(SseConfig),
    /// MQTT broker（点ID 作为主题过滤器订阅；isMock 时由 DemoAdapter 生成离散档位波形）
    Mqtt(MqttConfig),
}

/// WebSocket 服务参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsocketConfig {
    /// 服务地址（ws:// 或 wss://；演示模式下可为空）
    pub url: String,
    /// 上报间隔毫秒（缓冲的最新值按此周期批量上报，默认 1000）
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// HTTP 轮询服务参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpConfig {
    /// 服务地址（按点位拼接 `${url}?pointId=xxx` 发起 GET；演示模式下可为空）
    pub url: String,
    /// 轮询间隔毫秒（默认 2000，与旧前端 HttpPollingService 一致）
    #[serde(default = "default_http_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// SSE 服务参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SseConfig {
    /// 服务地址（按点位拼接 `${url}?pointId=xxx` 建立 SSE 长连接；演示模式下可为空）
    pub url: String,
    /// 上报间隔毫秒（缓冲的最新值按此周期批量上报，默认 1000）
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// MQTT broker 参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttConfig {
    /// broker 地址（ws:// WebSocket 或 mqtt:// 原生 TCP；演示模式下可为空）
    pub url: String,
    /// 上报间隔毫秒（缓冲的最新值按此周期批量上报，默认 1000）
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// Modbus TCP 设备参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModbusConfig {
    /// 设备主机地址（IP / 域名）
    pub host: String,
    /// Modbus TCP 端口（默认 502）
    #[serde(default = "default_modbus_port")]
    pub port: u16,
    /// 从站地址（默认 1）
    #[serde(default = "default_unit_id")]
    pub unit_id: u8,
    /// 轮询间隔毫秒（默认 1000，引擎侧下限 200）
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// 西门子 S7 设备参数（适配器实现待 S7 spike）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S7Config {
    pub host: String,
    #[serde(default = "default_s7_port")]
    pub port: u16,
    /// 机架号（默认 0）
    #[serde(default)]
    pub rack: u8,
    /// 槽号（默认 2，与数据源对话框一致；S7-1200/1500 场景可配 1）
    #[serde(default = "default_s7_slot")]
    pub slot: u8,
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// OPC UA 设备参数（适配器实现待引入 opcua crate）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpcConfig {
    /// 端点 URL，如 opc.tcp://127.0.0.1:4840（演示模式下可为空）
    pub endpoint: String,
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
    /// 是否演示模式（不连真实设备，由 DemoAdapter 生成波形）
    #[serde(default)]
    pub is_mock: bool,
    /// 演示波形档位（仅 is_mock 时生效，缺省正弦）
    #[serde(default)]
    pub profile: DemoProfile,
}

/// 演示波形档位：按协议生成不同特征的模拟曲线
/// （与原 mock/generators.ts 的四种波形一一对应）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DemoProfile {
    /// 正弦波 + 微噪声（WebSocket 遥测流特征）
    #[default]
    Websocket,
    /// 随机游走（HTTP 轮询测量值特征）
    Http,
    /// 锯齿斜升（SSE 服务端推送流特征）
    Sse,
    /// 离散档位（MQTT 设备档位特征）
    Mqtt,
}

impl DeviceConfig {
    pub fn poll_interval_ms(&self) -> u64 {
        match self {
            DeviceConfig::Modbus(c) => c.poll_interval_ms,
            DeviceConfig::S7(c) => c.poll_interval_ms,
            DeviceConfig::Opc(c) => c.poll_interval_ms,
            DeviceConfig::Websocket(c) => c.poll_interval_ms,
            DeviceConfig::Http(c) => c.poll_interval_ms,
            DeviceConfig::Sse(c) => c.poll_interval_ms,
            DeviceConfig::Mqtt(c) => c.poll_interval_ms,
        }
    }

    /// 是否演示模式（isMock = true 时工厂统一路由到 DemoAdapter）
    pub fn is_mock(&self) -> bool {
        match self {
            DeviceConfig::Modbus(c) => c.is_mock,
            DeviceConfig::S7(c) => c.is_mock,
            DeviceConfig::Opc(c) => c.is_mock,
            DeviceConfig::Websocket(c) => c.is_mock,
            DeviceConfig::Http(c) => c.is_mock,
            DeviceConfig::Sse(c) => c.is_mock,
            DeviceConfig::Mqtt(c) => c.is_mock,
        }
    }

    /// 演示波形档位（仅演示模式有意义）
    pub fn demo_profile(&self) -> DemoProfile {
        match self {
            DeviceConfig::Modbus(c) => c.profile,
            DeviceConfig::S7(c) => c.profile,
            DeviceConfig::Opc(c) => c.profile,
            DeviceConfig::Websocket(c) => c.profile,
            DeviceConfig::Http(c) => c.profile,
            DeviceConfig::Sse(c) => c.profile,
            DeviceConfig::Mqtt(c) => c.profile,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 新 JSON 形态：protocol 判别 + isMock 标识演示模式（无独立 demo 协议）
    #[test]
    fn parses_mock_and_real_configs() {
        let mock: DeviceConfig = serde_json::from_value(serde_json::json!({
            "protocol": "websocket", "isMock": true, "profile": "sse", "url": ""
        }))
        .unwrap();
        assert!(mock.is_mock());
        assert_eq!(mock.demo_profile(), DemoProfile::Sse);
        assert_eq!(mock.poll_interval_ms(), 1000); // 缺省默认值

        let real: DeviceConfig = serde_json::from_value(serde_json::json!({
            "protocol": "modbus", "host": "127.0.0.1"
        }))
        .unwrap();
        assert!(!real.is_mock());
        assert_eq!(real.demo_profile(), DemoProfile::Websocket); // 缺省档位
    }
}
