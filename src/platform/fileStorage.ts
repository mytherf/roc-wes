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
// 路径拼接必须用 @tauri-apps/api/path 的 join()：
//   appConfigDir() 返回值不保证带末尾分隔符，直接字符串拼接会得到
//   类似 ...\com.rocwes.desktopeditor.json 的错误路径（落在 scope 之外，
//   被 ACL 拒绝：forbidden path）。
//
// 写入策略：先写临时文件（.tmp）再 rename 原子替换，
//   避免写一半崩溃导致数据文件损坏。
//
// 注意：项目为纯桌面版，必须经 npx tauri dev 启动才有持久化能力；
// 非 Tauri 环境（如直接访问 vite dev server）读写均直接失败并打日志。

/** 最近一次读/写失败的原因（供界面提示展示，成功时清空） */
let lastFileError = ''

/** 获取最近一次文件读写失败的原因描述 */
export function getLastFileError(): string {
  return lastFileError
}

/** 提取错误信息（Error 取 message，其余转字符串） */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 当前是否运行在 Tauri 桌面壳内（非 Tauri 环境无 IPC，持久化不可用） */
function inTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

/**
 * 读取 JSON 文件
 * @param fileName 文件名（如 editor.json）
 * @returns 解析后的数据；文件不存在或解析失败返回 null（首次运行属正常情况）
 */
export async function readJsonFile<T = any>(fileName: string): Promise<T | null> {
  try {
    // 动态导入：非 Tauri 环境加载失败会被 catch 捕获并打日志
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const { appConfigDir, join } = await import('@tauri-apps/api/path')
    // 用 join 拼接绝对路径：$APPCONFIG/<fileName>（权限见 capabilities/default.json）
    // appConfigDir() 不保证末尾分隔符，字符串直拼会产生越界路径被 ACL 拒绝
    const filePath = await join(await appConfigDir(), fileName)
    const raw = await readTextFile(filePath)
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
 * @returns 是否写入成功（失败原因可通过 getLastFileError() 获取）
 */
export async function writeJsonFile(fileName: string, data: any): Promise<boolean> {
  // 非 Tauri 环境（如直接浏览器访问 vite dev server）无持久化能力，直接给出明确原因
  if (!inTauri()) {
    lastFileError = '当前不在 Tauri 桌面环境中运行，无法写盘（请用 npx tauri dev 启动）'
    console.error(`[fileStorage] 写入 ${fileName} 失败: ${lastFileError}`)
    return false
  }

  // 序列化也纳入错误处理：循环引用等不可序列化数据会在此报错
  let json: string
  try {
    json = JSON.stringify(data, null, 2)
  } catch (e) {
    lastFileError = `数据序列化失败: ${errMsg(e)}`
    console.error(`[fileStorage] 写入 ${fileName} 失败（序列化）:`, e)
    return false
  }

  try {
    const { writeTextFile, rename } = await import('@tauri-apps/plugin-fs')
    const { appConfigDir, join } = await import('@tauri-apps/api/path')
    const dir = await appConfigDir()
    // 用 join 拼接：appConfigDir() 不保证末尾分隔符，直拼会得到越界路径被 ACL 拒绝
    const tmpPath = await join(dir, `${fileName}.tmp`)
    const finalPath = await join(dir, fileName)
    // 1. 先写临时文件 2. 再原子重命名覆盖目标文件
    // （rename 不支持 baseDir 参数，故全程使用绝对路径）
    await writeTextFile(tmpPath, json)
    try {
      await rename(tmpPath, finalPath)
    } catch (renameErr) {
      // rename 失败（如目标被占用/权限差异）时降级为直接覆盖写入，尽力保证数据不丢
      console.warn(`[fileStorage] rename 失败，降级为直接写入 ${fileName}:`, renameErr)
      await writeTextFile(finalPath, json)
    }
    lastFileError = ''
    return true
  } catch (e) {
    lastFileError = errMsg(e)
    console.error(`[fileStorage] 写入 ${fileName} 失败:`, e)
    return false
  }
}
