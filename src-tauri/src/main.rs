// Windows release 构建隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    roc_wes_desktop_lib::run()
}
