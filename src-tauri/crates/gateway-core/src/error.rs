//! 网关错误类型

use thiserror::Error;

#[derive(Debug, Error)]
pub enum GatewayError {
    #[error("协议适配器尚未实现：{0}")]
    Unsupported(String),
    #[error("设备会话已存在：{0}")]
    AlreadyExists(String),
    #[error("设备会话不存在：{0}")]
    NoSuchSession(String),
    #[error("设备未连接")]
    NotConnected,
    #[error("非法点位 ID：{0}")]
    InvalidPoint(String),
    #[error("连接失败：{0}")]
    Connect(String),
    #[error("读取失败：{0}")]
    Read(String),
    #[error("写入失败：{0}")]
    Write(String),
    #[error("{0}")]
    Other(String),
}
