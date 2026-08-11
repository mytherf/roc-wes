// 隐藏控制台窗口：dev 与 release 均不弹出黑色 cmd 窗口。
// 代价：直接双击 exe 时看不到 tracing 日志（终端里跑 `npx tauri dev`
// 时日志仍会输出到该终端）；换来的是干净的启动体验
#![windows_subsystem = "windows"]

fn main() {
    roc_wes_desktop_lib::run()
}
