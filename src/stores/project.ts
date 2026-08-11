// ========== 工程 Store（多工程管理）==========
// 引入「工程（Project）」概念：画布、数据源、路线按工程完全隔离，
// 主题与运行预览交接文件保持全局。
//
// 存储布局（$APPCONFIG 下）：
//   projects.json                          索引：{ currentId, projects: [...] }
//   projects/<projectId>/editor.json       画布
//   projects/<projectId>/datasources.json  数据源
//   projects/<projectId>/routes.json       路线
//
// 职责：
//   1. 索引的读写（projects.json）与当前工程指针 currentId
//   2. 首次启动迁移：旧的全局 editor.json / datasources.json / routes.json
//      自动搬入「默认工程」目录并删除旧文件
//   3. 工程 CRUD：新建 / 重命名 / 复制 / 删除（含最后一个工程的保护）
//   4. 切换编排：先保存当前工程 → 更新索引 → 触发 editor/dataSource/route 三个 store 重载
//   5. ready 门控：其他 store 初始化时 await ready，保证加载路径中的 currentId 已就绪

import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { readJsonFile, writeJsonFile, existsFile, removePath } from '@/platform/fileStorage'
import { useEditorStore } from './editor'
import { useDataSourceStore } from './dataSource'
import { useRouteStore } from './route'

/** 工程元信息（存于索引 projects.json） */
export interface ProjectMeta {
  id: string
  name: string
  /** 创建时间戳（ms） */
  createdAt: number
  /** 最近保存时间戳（ms） */
  updatedAt: number
}

/** 索引文件结构 */
interface ProjectIndex {
  currentId: string
  projects: ProjectMeta[]
}

/** 索引文件名 */
const INDEX_FILE = 'projects.json'
/** 迁移需要搬运的旧全局文件（也是每个工程目录下的三件套） */
export const PROJECT_FILES = ['editor.json', 'datasources.json', 'routes.json']

export const useProjectStore = defineStore('project', () => {
  // ---------- 状态 ----------
  /** 全部工程元信息列表 */
  const projects = ref<ProjectMeta[]>([])
  /** 当前打开的工程 id */
  const currentId = ref<string | null>(null)
  /** 是否正在切换工程（防止并发切换/重载期间再次触发切换） */
  let switching = false

  // ready 门控：init 完成后 resolve，其他 store 的初始化加载 await 它，
  // 保证读取 projectPath() 时 currentId 已确定
  let resolveReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => { resolveReady = resolve })

  // ---------- 基础工具 ----------
  /** 生成工程唯一 id（时间戳 + 随机串） */
  function genId(): string {
    return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** 拼接当前工程内文件的相对路径：projects/<currentId>/<fileName> */
  function projectPath(fileName: string): string {
    return `projects/${currentId.value}/${fileName}`
  }

  /** 当前工程元信息（不存在返回 null） */
  const currentProject = computed<ProjectMeta | null>(
    () => projects.value.find(p => p.id === currentId.value) ?? null
  )

  /** 索引落盘 */
  async function saveIndex(): Promise<void> {
    await writeJsonFile(INDEX_FILE, { currentId: currentId.value, projects: toRaw(projects.value) })
  }

  /** 刷新当前工程的「最近保存时间」（工程内容保存成功后调用） */
  function touchCurrent(): void {
    const p = projects.value.find(x => x.id === currentId.value)
    if (!p) return
    p.updatedAt = Date.now()
    void saveIndex()
  }

  // ---------- 初始化与迁移 ----------
  /**
   * 初始化：读索引；索引不存在（首次运行）则迁移旧数据或创建默认工程。
   * store 创建时自动触发一次，完成后 resolve ready。
   */
  async function init(): Promise<void> {
    try {
      const index = await readJsonFile<ProjectIndex>(INDEX_FILE)
      if (index && Array.isArray(index.projects) && index.projects.length > 0) {
        projects.value = index.projects
        // currentId 失效（如手工改过文件）时回退到第一个工程
        currentId.value = index.projects.some(p => p.id === index.currentId)
          ? index.currentId
          : index.projects[0].id
      } else {
        await migrateOrCreateDefault()
      }
    } catch (e) {
      console.error('[ProjectStore] 初始化失败:', e)
      // 兜底：索引读不出来也要保证有一个可用工程
      if (projects.value.length === 0) await migrateOrCreateDefault()
    } finally {
      resolveReady()
    }
  }

  /**
   * 首次运行：把旧的全局三件套文件（若存在）搬入新建的「默认工程」目录，
   * 删除旧文件后写入索引；没有任何旧数据时也创建空的默认工程。
   */
  async function migrateOrCreateDefault(): Promise<void> {
    const meta: ProjectMeta = { id: genId(), name: '默认工程', createdAt: Date.now(), updatedAt: Date.now() }
    let migrated = false
    for (const f of PROJECT_FILES) {
      if (await existsFile(f)) {
        const data = await readJsonFile(f)
        if (data !== null) await writeJsonFile(`projects/${meta.id}/${f}`, data)
        await removePath(f)
        migrated = true
      }
    }
    projects.value = [meta]
    currentId.value = meta.id
    await saveIndex()
    console.log(migrated ? '[ProjectStore] 旧数据已迁移至「默认工程」' : '[ProjectStore] 已创建默认工程')
  }

  // ---------- 工程 CRUD ----------
  /** 新建工程并切换过去（切换前会先保存当前工程） */
  async function createProject(name: string): Promise<ProjectMeta> {
    const meta: ProjectMeta = {
      id: genId(),
      name: (name || '').trim() || '未命名工程',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    projects.value.push(meta)
    await saveIndex()
    await switchProject(meta.id)
    return meta
  }

  /** 重命名工程 */
  async function renameProject(id: string, name: string): Promise<void> {
    const p = projects.value.find(x => x.id === id)
    if (!p) return
    p.name = (name || '').trim() || p.name
    await saveIndex()
  }

  /** 复制工程（拷贝三件套文件，不切换） */
  async function duplicateProject(id: string): Promise<ProjectMeta | null> {
    const src = projects.value.find(x => x.id === id)
    if (!src) return null
    const meta: ProjectMeta = {
      id: genId(),
      name: `${src.name} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    for (const f of PROJECT_FILES) {
      const data = await readJsonFile(`projects/${src.id}/${f}`)
      if (data !== null) await writeJsonFile(`projects/${meta.id}/${f}`, data)
    }
    projects.value.push(meta)
    await saveIndex()
    return meta
  }

  /**
   * 删除工程（递归删除其目录）
   * 保护规则：删最后一个工程时先自动新建「未命名工程」；
   * 删的是当前工程时先切换到其他工程。
   */
  async function deleteProject(id: string): Promise<boolean> {
    if (!projects.value.some(x => x.id === id)) return false
    // 禁止删光：只剩一个时先建一个空工程兜底（createProject 会切换过去）
    if (projects.value.length <= 1) {
      await createProject('未命名工程')
    }
    // 删当前工程：先切走（切换时会保存并释放当前工程数据）
    if (currentId.value === id) {
      const next = projects.value.find(p => p.id !== id)
      if (next) await switchProject(next.id)
    }
    const ok = await removePath(`projects/${id}`, true)
    projects.value = projects.value.filter(p => p.id !== id)
    await saveIndex()
    return ok
  }

  // ---------- 切换编排 ----------
  /**
   * 切换工程：
   *   1. 保存当前工程（画布 + 数据源 + 路线）防止丢改动
   *   2. 更新 currentId 与索引
   *   3. 重载三个业务 store 的数据
   * @param id 目标工程 id
   * @param remoteRoutesJson 跨窗口同步场景下携带的路线 JSON（避免读到对端尚未写完的文件）
   */
  async function switchProject(id: string, remoteRoutesJson?: string): Promise<void> {
    if (switching || id === currentId.value) return
    if (!projects.value.some(p => p.id === id)) return
    switching = true
    try {
      const editorStore = useEditorStore()
      const dsStore = useDataSourceStore()
      const routeStore = useRouteStore()

      // 1. 保存当前工程（此时 currentId 还是旧工程）
      await editorStore.saveToStorage()
      dsStore.saveNow()
      routeStore.saveNow()

      // 2. 切换指针并落盘索引
      currentId.value = id
      touchCurrent()

      // 3. 重载各 store（画布重载会触发 X6Canvas watcher 重建画面）
      await editorStore.reloadForProject()
      await dsStore.reloadForProject()
      await routeStore.reloadForProject(remoteRoutesJson)
    } finally {
      switching = false
    }
  }

  // ---------- 工程文件导入导出 ----------
  /** 工程文件格式标识（导出 payload 的 format 字段） */
  const PROJECT_FILE_FORMAT = 'rocwes-project'

  /** 生成不与现有工程重名的名称（重名时追加 2/3/… 序号） */
  function uniqueName(base: string): string {
    const names = new Set(projects.value.map(p => p.name))
    if (!names.has(base)) return base
    let n = 2
    while (names.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }

  /**
   * 导出指定工程为单个 JSON 对象（工程文件）：
   * 画布 + 数据源 + 路线三件套全量打包，用于跨机器迁移/备份/分享。
   * 直接读取该工程目录下的三件套文件；若导出的是当前工程，
   * 先保存一次保证落盘数据是最新的。
   */
  async function exportProject(id: string): Promise<Record<string, any> | null> {
    const meta = projects.value.find(p => p.id === id)
    if (!meta) return null
    if (id === currentId.value) {
      // 当前工程：先保存，确保内存改动落盘后再读取导出
      await useEditorStore().saveToStorage()
      useDataSourceStore().saveNow()
      useRouteStore().saveNow()
    }
    const editor = await readJsonFile(`projects/${id}/editor.json`)
    const dsFile = await readJsonFile<{ dataSources: any[] }>(`projects/${id}/datasources.json`)
    const routes = await readJsonFile<any[]>(`projects/${id}/routes.json`)
    return {
      format: PROJECT_FILE_FORMAT,
      version: 1,
      name: meta.name,
      exportedAt: Date.now(),
      editor: editor ?? { graphData: { nodes: [], edges: [] } },
      dataSources: dsFile && Array.isArray(dsFile.dataSources) ? dsFile.dataSources : [],
      routes: Array.isArray(routes) ? routes : [],
    }
  }

  /**
   * 导入工程文件：新建一个工程并写入三件套，然后切换到新工程。
   * 兼容两种格式：
   *   - 工程文件（format: 'rocwes-project'）：含 editor/dataSources/routes
   *   - 旧版画布导出（{ nodes, edges, routes? }）：仅作为画布导入
   * @returns 导入成功的工程元信息；格式无效返回 null
   */
  async function importProjectFile(payload: any): Promise<ProjectMeta | null> {
    if (!payload || typeof payload !== 'object') return null
    const isProjectFile = payload.format === PROJECT_FILE_FORMAT
    const isLegacyCanvas = Array.isArray(payload.nodes) && Array.isArray(payload.edges)
    if (!isProjectFile && !isLegacyCanvas) return null

    const baseName =
      typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : '导入工程'
    const meta: ProjectMeta = {
      id: genId(),
      name: uniqueName(baseName),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // 画布（editor.json 格式：{ graphData, selectedId?, displayMode? }）
    const editorData = isProjectFile
      ? payload.editor ?? { graphData: { nodes: [], edges: [] } }
      : { graphData: { nodes: payload.nodes, edges: payload.edges } }
    await writeJsonFile(`projects/${meta.id}/editor.json`, editorData)

    // 数据源（datasources.json 格式：{ dataSources: [...] }）
    if (Array.isArray(payload.dataSources) && payload.dataSources.length > 0) {
      await writeJsonFile(`projects/${meta.id}/datasources.json`, { dataSources: payload.dataSources })
    }

    // 路线（routes.json 格式：纯数组）
    if (Array.isArray(payload.routes) && payload.routes.length > 0) {
      await writeJsonFile(`projects/${meta.id}/routes.json`, payload.routes)
    }

    projects.value.push(meta)
    await saveIndex()
    await switchProject(meta.id)
    return meta
  }

  // store 创建即开始初始化
  void init()

  return {
    projects,
    currentId,
    currentProject,
    ready,
    projectPath,
    touchCurrent,
    createProject,
    renameProject,
    duplicateProject,
    deleteProject,
    switchProject,
    exportProject,
    importProjectFile,
  }
})
