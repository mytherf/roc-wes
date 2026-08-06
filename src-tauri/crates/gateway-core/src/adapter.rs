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

    /// 协议标识（日志 / 状态展示用），如 "modbus" / "demo"。
    fn kind(&self) -> &'static str;
}
