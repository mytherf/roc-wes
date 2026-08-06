//! Tauri IPC 命令层（前端 invoke 入口）
//!
//! 命令语义对齐旧 WS 网关协议，但不再经过任何本地端口：
//! - gateway_connect     ≈ WS open + {action:'configure'}
//! - gateway_subscribe   ≈ {action:'subscribe'}
//! - gateway_unsubscribe ≈ {action:'unsubscribe'}
//! - gateway_disconnect  ≈ WS close
//!
//! 参数命名为 camelCase（Tauri 自动映射到 Rust snake_case）。

use crate::factory;
use crate::state::AppState;
use gateway_core::DeviceConfig;
use tauri::State;

/// 创建设备会话。连接为异步过程，结果经 `gateway://status` 事件通知。
#[tauri::command]
pub async fn gateway_connect(
    state: State<'_, AppState>,
    device_id: String,
    config: DeviceConfig,
) -> Result<(), String> {
    let (adapter, poll_interval_ms) = factory::create_adapter(config).map_err(|e| e.to_string())?;
    state
        .engine
        .connect(device_id, adapter, poll_interval_ms)
        .map_err(|e| e.to_string())
}

/// 订阅数据点（如 `holding:0`）
#[tauri::command]
pub async fn gateway_subscribe(
    state: State<'_, AppState>,
    device_id: String,
    point_id: String,
) -> Result<(), String> {
    state
        .engine
        .subscribe(&device_id, point_id)
        .map_err(|e| e.to_string())
}

/// 取消订阅数据点
#[tauri::command]
pub async fn gateway_unsubscribe(
    state: State<'_, AppState>,
    device_id: String,
    point_id: String,
) -> Result<(), String> {
    state
        .engine
        .unsubscribe(&device_id, point_id)
        .map_err(|e| e.to_string())
}

/// 断开并销毁设备会话
#[tauri::command]
pub async fn gateway_disconnect(state: State<'_, AppState>, device_id: String) -> Result<(), String> {
    state
        .engine
        .disconnect(&device_id)
        .await
        .map_err(|e| e.to_string())
}
