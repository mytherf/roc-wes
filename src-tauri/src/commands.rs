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
use tauri::{Manager, State};

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

/// 导出工程文件：把工程 JSON 内容写入目标路径，返回实际保存的绝对路径。
///
/// 路径选择：前端先用原生「另存为」对话框（tauri-plugin-dialog）让用户选择
/// 保存位置，把完整路径通过 target_path 传入；未传时降级写入
/// 用户文档目录下的 RocWesExports 子目录。
///
/// 为什么不用浏览器式 Blob 下载：Tauri 的 WebView2 壳不处理下载事件，
/// `a.download` 点击会静默失效，故由 Rust 直接落盘。
/// 自定义命令不受 fs capability scope 限制，可写应用配置目录之外的任意位置。
#[tauri::command]
pub fn export_project_file(
    app: tauri::AppHandle,
    default_name: String,
    content: String,
    target_path: Option<String>,
) -> Result<String, String> {
    // 用户在对话框中选了保存路径：直接写入该路径（覆盖同名文件，
    // 系统另存为对话框已自带覆盖确认）；若未自动加 .json 后缀则补上
    if let Some(tp) = target_path.filter(|s| !s.trim().is_empty()) {
        let mut path = std::path::PathBuf::from(tp);
        if path.extension().is_none() {
            path.set_extension("json");
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录 {:?} 失败: {e}", parent))?;
        }
        std::fs::write(&path, content).map_err(|e| format!("写入文件 {:?} 失败: {e}", path))?;
        return Ok(path.to_string_lossy().to_string());
    }

    // 降级：写入 <文档>/RocWesExports 目录
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let dir = docs.join("RocWesExports");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建导出目录 {:?} 失败: {e}", dir))?;
    let mut path = dir.join(&default_name);
    // 同名文件已存在时，在文件名（扩展名之前）追加 2/3/… 序号避免覆盖
    if path.exists() {
        let p = std::path::Path::new(&default_name);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("export");
        let ext = p.extension().and_then(|s| s.to_str());
        let mut n = 2usize;
        loop {
            let name = match ext {
                Some(e) => format!("{stem} {n}.{e}"),
                None => format!("{stem} {n}"),
            };
            path = dir.join(name);
            if !path.exists() {
                break;
            }
            n += 1;
        }
    }
    std::fs::write(&path, content).map_err(|e| format!("写入文件 {:?} 失败: {e}", path))?;
    Ok(path.to_string_lossy().to_string())
}

/// 读取任意路径的文本文件内容（UTF-8）。
///
/// 用于「导入点位」：前端先用原生「打开文件」对话框（tauri-plugin-dialog）
/// 让用户选择文件，再把完整路径传入。自定义命令不受 fs capability scope
/// 限制，可读取应用配置目录之外的任意位置（与 export_project_file 对称）。
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件 {:?} 失败: {e}", path))
}
