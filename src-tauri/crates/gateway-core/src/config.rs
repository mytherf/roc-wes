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
    1
}
fn default_poll_interval_ms() -> u64 {
    1000
}

/// 设备配置判别联合：`{ kind: 'modbus' | 's7' | 'opc' | 'demo', ... }`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeviceConfig {
    Modbus(ModbusConfig),
    S7(S7Config),
    Opc(OpcConfig),
    Demo(DemoConfig),
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
    /// 槽号（S7-1200/1500 通常为 1）
    #[serde(default = "default_s7_slot")]
    pub slot: u8,
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
}

/// OPC UA 设备参数（适配器实现待引入 opcua crate）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpcConfig {
    /// 端点 URL，如 opc.tcp://127.0.0.1:4840
    pub endpoint: String,
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
}

/// 演示模式：不连真实设备，由 DemoAdapter 生成模拟曲线
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoConfig {
    #[serde(default = "default_poll_interval_ms")]
    pub poll_interval_ms: u64,
}

impl DeviceConfig {
    pub fn poll_interval_ms(&self) -> u64 {
        match self {
            DeviceConfig::Modbus(c) => c.poll_interval_ms,
            DeviceConfig::S7(c) => c.poll_interval_ms,
            DeviceConfig::Opc(c) => c.poll_interval_ms,
            DeviceConfig::Demo(c) => c.poll_interval_ms,
        }
    }
}
