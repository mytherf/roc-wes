//! 组合根：DeviceConfig → 具体适配器工厂
//!
//! 新增协议的唯一扩展点：在此增加一个 match 分支即可，
//! 引擎、命令层与前端均无需改动。

use gateway_core::{DeviceAdapter, DeviceConfig, GatewayError};

/// 按配置构建适配器，返回 (适配器, 轮询间隔毫秒)
pub fn create_adapter(config: DeviceConfig) -> Result<(Box<dyn DeviceAdapter>, u64), GatewayError> {
    let poll_interval_ms = config.poll_interval_ms();
    // 演示模式（isMock = true）：任意协议统一路由到内置演示引擎，
    // 波形档位取配置中的 profile（缺省正弦）
    if config.is_mock() {
        return Ok((
            Box::new(gateway_demo::DemoAdapter::new(config.demo_profile())),
            poll_interval_ms,
        ));
    }
    let adapter: Box<dyn DeviceAdapter> = match config {
        DeviceConfig::Modbus(cfg) => Box::new(gateway_modbus::ModbusAdapter::new(cfg)),
        // 真实模式 Web 协议：每协议一个适配器 crate，Rust 原生客户端接管，前端不再直连
        DeviceConfig::Websocket(cfg) => Box::new(gateway_websocket::WebSocketAdapter::new(cfg)),
        DeviceConfig::Http(cfg) => Box::new(gateway_http::HttpAdapter::new(cfg)),
        DeviceConfig::Sse(cfg) => Box::new(gateway_sse::SseAdapter::new(cfg)),
        DeviceConfig::Mqtt(cfg) => Box::new(gateway_mqtt::MqttAdapter::new(cfg)),
        DeviceConfig::S7(cfg) => Box::new(gateway_s7::S7Adapter::new(cfg)),
        DeviceConfig::Opc(cfg) => Box::new(gateway_opcua::OpcuaAdapter::new(cfg)),
    };
    Ok((adapter, poll_interval_ms))
}
