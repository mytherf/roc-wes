//! 设备适配器端口（六边形架构"驱动适配器"抽象）

use crate::{GatewayError, Telemetry};
use async_trait::async_trait;

/// 设备适配器：单个设备连接的抽象端口。
///
/// 每个适配器实例由一个会话轮询任务独占（仅需 Send，无需 Sync）。
/// 新协议只需新增实现并在组合根（Tauri 壳 factory）注册分支，
/// 引擎与前端均无需改动。
#[async_trait]
pub trait DeviceAdapter: Send {
    /// 建立设备连接。由会话任务调用；失败后按指数退避自动重试。
    async fn connect(&mut self) -> Result<(), GatewayError>;

    /// 释放设备连接（读取失败重连前、会话退出时均会调用）。
    async fn disconnect(&mut self) -> Result<(), GatewayError>;

    /// 读取一轮订阅点位，返回完整遥测（适配器负责时间戳与质量标记）。
    async fn read(&mut self, point_ids: &[String]) -> Result<Vec<Telemetry>, GatewayError>;

    /// 向设备写入单个点位值（如 S7 DB 标量/位、Modbus 保持寄存器/线圈）。
    /// 缺省返回 Unsupported：不支持写的协议（HTTP/SSE/WS/MQTT/OPC UA 等）无需实现。
    /// 写入失败不应触发会话重连（与读失败语义区分）。
    async fn write(&mut self, point_id: &str, _value: serde_json::Value) -> Result<(), GatewayError> {
        Err(GatewayError::Unsupported(format!(
            "{} 协议暂不支持写入点位 {point_id}",
            self.kind()
        )))
    }

    /// 协议标识（日志 / 状态展示用），如 "modbus" / "demo"。
    fn kind(&self) -> &'static str;
}
