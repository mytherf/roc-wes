//! gateway-core：设备网关领域模型（六边形架构核心层）
//!
//! 只包含配置、遥测、错误与 [`DeviceAdapter`] 端口定义，
//! 不依赖任何 IO / 框架（含 Tauri），可独立单测。

pub mod adapter;
pub mod config;
pub mod error;
pub mod telemetry;

pub use adapter::DeviceAdapter;
pub use config::{
    DemoProfile, DeviceConfig, HttpConfig, ModbusConfig, MqttConfig, OpcConfig,
    S7Config, SseConfig, WebsocketConfig,
};
pub use error::GatewayError;
pub use telemetry::{Quality, StatusEvent, Telemetry, TelemetryBatch};
