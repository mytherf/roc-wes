// ========== 文件持久化工具（Tauri FS 落盘）==========
// 桌面版把所有工程数据（画布 / 数据源 / 路线 / 主题 / 运行预览快照）
// 保存为「应用配置目录」下的 JSON 文件：
//   - 历史上曾用浏览器 localStorage，但容量仅约 5MB（自定义图标 dataURL 极易撑爆），
//     且 WebView2 用户数据目录被清理后数据全丢，已全量替换为文件落盘；
//   - 运行预览快照也曾走 sessionStorage，但按窗口隔离导致新窗口读不到，
//     已改为 run-preview.json 文件交接。
//
// 存储位置：$APPCONFIG/<fileName>
//   Windows 下即 %APPDATA%\<应用identifier>\，由 Tauri 管理。
//
// 写入策略：先写临时文件（.tmp）再 rename 原子替换，
//   避免写一半崩溃导致数据文件损坏。
//
// 注意：项目为纯桌面版，必须经 npx tauri dev 启动才有持久化能力；
// 非 Tauri 环境（如直接访问 vite dev server）读写均直接失败并打日志。

/**
 * 读取 JSON 文件
 * @param fileName 文件名（如 editor.json）
 * @returns 解析后的数据；文件不存在或解析失败返回 null（首次运行属正常情况）
 */
export async function readJsonFile<T = any>(fileName: string): Promise<T | null> {
  try {
    // 动态导入：非 Tauri 环境加载失败会被 catch 捕获并打日志
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const { appConfigDir } = await import('@tauri-apps/api/path')
    // 拼接绝对路径：$APPCONFIG/<fileName>（权限见 capabilities/default.json）
    const dir = await appConfigDir()
    const raw = await readTextFile(dir + fileName)
    return JSON.parse(raw) as T
  } catch (e) {
    console.warn(`[fileStorage] 读取 ${fileName} 失败（首次运行无此文件属正常）:`, e)
    return null
  }
}

/**
 * 将数据写为 JSON 文件（临时文件 + rename 原子替换）
 * @param fileName 文件名（如 editor.json）
 * @param data 任意可 JSON 序列化的数据
 * @returns 是否写入成功
 */
export async function writeJsonFile(fileName: string, data: any): Promise<boolean> {
  const json = JSON.stringify(data, null, 2)
  try {
    const { writeTextFile, rename } = await import('@tauri-apps/plugin-fs')
    const { appConfigDir } = await import('@tauri-apps/api/path')
    const dir = await appConfigDir()
    const tmpPath = dir + `${fileName}.tmp`
    const finalPath = dir + fileName
    // 1. 先写临时文件 2. 再原子重命名覆盖目标文件
    // （rename 不支持 baseDir 参数，故全程使用绝对路径）
    await writeTextFile(tmpPath, json)
    await rename(tmpPath, finalPath)
    return true
  } catch (e) {
    console.error(`[fileStorage] 写入 ${fileName} 失败:`, e)
    return false
  }
}
