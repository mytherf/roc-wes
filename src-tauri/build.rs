// ═══════════════════════════════════════════════════════════════
// build.rs - Cargo 构建脚本
//
// 作用：在编译前调用 tauri_build::build()，由 Tauri 自动：
//   1. 读取 tauri.conf.json 配置
//   2. 校验/嵌入应用图标
//   3. 生成平台权限能力（capabilities）代码
//   4. 生成应用上下文（tauri::generate_context! 需要它）
// 一般无需改动；改动了 tauri.conf.json 后重新编译会自动生效。
// ═══════════════════════════════════════════════════════════════
fn main() {
    tauri_build::build()
}
