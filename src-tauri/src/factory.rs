//! 组合根：DeviceConfig → 具体适配器工厂
//!
//! 新增协议的唯一扩展点：在此增加一个 match 分支即可，
//! 引擎、命令层与前端均无需改动。

use gateway_core::{DeviceAdapter, DeviceConfig, GatewayError};

/// 按配置构建适配器，返回 (适配器, 轮询间隔毫秒)
pub fn create_adapter(config: DeviceConfig) -> Result<(Box<dyn DeviceAdapter>, u64), GatewayError> {
    let poll_interval_ms = config.poll_interval_ms();
    let adapter: Box<dyn DeviceAdapter> = match config {
        DeviceConfig::Modbus(cfg) => Box::new(gateway_modbus::ModbusAdapter::new(cfg)),
        DeviceConfig::Demo(cfg) => Box::new(gateway_demo::DemoAdapter::new(cfg.profile)),
        // 真实模式 Web 协议：Rust 原生客户端接管，前端不再直连
        DeviceConfig::Websocket(cfg) => Box::new(gateway_web::WebSocketAdapter::new(cfg)),
        DeviceConfig::Http(cfg) => Box::new(gateway_web::HttpAdapter::new(cfg)),
        DeviceConfig::Sse(cfg) => Box::new(gateway_web::SseAdapter::new(cfg)),
        DeviceConfig::Mqtt(cfg) => Box::new(gateway_web::MqttAdapter::new(cfg)),
        DeviceConfig::S7(_) => {
            return Err(GatewayError::Unsupported(
                "S7 适配器待 spike（snap7 绑定 / 自研 S7comm），见 docs/tauri-迁移方案.md".into(),
            ))
        }
        DeviceConfig::Opc(_) => {
            return Err(GatewayError::Unsupported(
                "OPC UA 适配器待引入 opcua crate".into(),
            ))
        }
    };
    Ok((adapter, poll_interval_ms))
}
