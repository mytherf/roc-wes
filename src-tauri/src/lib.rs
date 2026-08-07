//! RocWes 桌面端 Tauri 壳：组装引擎、注入事件端、注册 IPC 命令。
//!
//! 壳层保持"薄"：全部业务逻辑位于 gateway-* crate，可脱离 Tauri 单测。

mod commands;
mod factory;
mod state;

use state::{AppState, TauriEventSink};
use std::sync::Arc;
use tauri::Manager;
use tracing_subscriber::EnvFilter;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,gateway_engine=debug,gateway_modbus=debug")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init()) // 文件系统插件：前端工程数据落盘到应用配置目录
        .setup(|app| {
            let sink = Arc::new(TauriEventSink::new(app.handle().clone()));
            let engine = Arc::new(gateway_engine::GatewayEngine::new(sink));
            app.manage(AppState { engine });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gateway_connect,
            commands::gateway_subscribe,
            commands::gateway_unsubscribe,
            commands::gateway_disconnect,
        ])
        .build(tauri::generate_context!())
        .expect("构建 RocWes 桌面应用失败")
        .run(|app_handle, event| {
            // 应用退出前断开全部设备会话，释放 TCP 连接
            if let tauri::RunEvent::Exit = event {
                let engine = app_handle.state::<AppState>().engine.clone();
                tauri::async_runtime::block_on(async move {
                    engine.shutdown().await;
                });
            }
        });
}
