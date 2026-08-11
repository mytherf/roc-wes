//! RocWes 桌面端 Tauri 壳：组装引擎、注入事件端、注册 IPC 命令。
//!
//! 壳层保持"薄"：全部业务逻辑位于 gateway-* crate，可脱离 Tauri 单测。

mod commands;
mod factory;
mod state;

use state::{AppState, TauriEventSink};
use std::sync::Arc;
use tauri::{Listener, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tracing_subscriber::EnvFilter;

/// 关闭启动画面（splash）并显示/聚焦主窗口。
/// 操作幂等：正常就绪事件与兜底超时都可能调用，重复执行无副作用。
fn switch_splash_to_main(handle: &tauri::AppHandle) {
    if let Some(main) = handle.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    if let Some(splash) = handle.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,gateway_engine=debug,gateway_modbus=debug")),
        )
        .init();

    tauri::Builder::default()
        // 单实例插件（必须最先注册）：已有实例运行时再次启动不会闪崩，
        // 新实例立即退出，并触发已有实例的回调——显示/聚焦主窗口 + 友好提示
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 把用户当前能看到的窗口带到前台：启动中聚焦 splash，已就绪聚焦主窗口
            //（隐藏启动模式下主窗口可能尚未显示，先 show 再 focus）
            if let Some(win) = app
                .get_webview_window("splashscreen")
                .or_else(|| app.get_webview_window("main"))
            {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            // 原生信息对话框：告知用户程序已在运行，避免以为启动失败
            app.dialog()
                .message("RocWes 已在运行，已为您切换到现有窗口。")
                .title("RocWes")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init()) // 文件系统插件：前端工程数据落盘到应用配置目录
        .plugin(tauri_plugin_dialog::init()) // 原生对话框插件：导出工程时的「另存为」目录选择
        .setup(|app| {
            // 确保应用配置目录存在：plugin-fs 写文件不会自动创建父目录，
            // 首次启动时 $APPCONFIG（Windows 为 %APPDATA%\<identifier>）不存在，
            // 会导致前端全部落盘写入失败（保存失败）
            match app.path().app_config_dir() {
                Ok(config_dir) => {
                    if let Err(e) = std::fs::create_dir_all(&config_dir) {
                        tracing::warn!("创建应用配置目录失败 {:?}: {e}", config_dir);
                    }
                }
                Err(e) => tracing::warn!("解析应用配置目录失败: {e}"),
            }

            let sink = Arc::new(TauriEventSink::new(app.handle().clone()));
            let engine = Arc::new(gateway_engine::GatewayEngine::new(sink));
            app.manage(AppState { engine });

            // ========== Rust 侧启动画面（splash）→ 主窗口切换 ==========
            // splash 窗口是纯静态 HTML/CSS（零 JS），进程启动即瞬间渲染；
            // 前端主界面就绪后 emit "app-ready"，由这里关闭 splash 并显示主窗口。
            let handle = app.handle().clone();
            handle.clone().listen_any("app-ready", move |_event| {
                switch_splash_to_main(&handle);
            });

            // 兜底保护：若前端异常导致 app-ready 永远不发出（如 JS 崩溃），
            // 15 秒后强制切换，避免用户永远停在 splash 画面无法进入应用
            let fallback = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(15));
                if fallback.get_webview_window("splashscreen").is_some() {
                    tracing::warn!("未收到 app-ready 事件（前端可能卡在加载），强制切换到主窗口");
                    switch_splash_to_main(&fallback);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gateway_connect,
            commands::gateway_subscribe,
            commands::gateway_unsubscribe,
            commands::gateway_disconnect,
            commands::export_project_file,
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
