// ========== 主题 Store（全局皮肤管理）==========
// 职责：
// 1. 记录当前使用的主题名称
// 2. 把主题应用到页面根元素（<html> 上的 data-theme 属性，CSS 据此切换配色）
// 3. 记住用户选择（文件落盘：应用配置目录的 theme.json，刷新后不丢失）

import { defineStore } from 'pinia' // Pinia 的 store 定义函数
import { ref, watch } from 'vue' // ref 创建响应式数据；watch 监听数据变化
import { readJsonFile, writeJsonFile } from '@/platform/fileStorage' // 文件持久化工具（Tauri FS 落盘）

// 主题名称的可选值（'industrial' 暗色工业 / 'light' 亮色现代 / 'ocean' 深蓝科技 / 'isa101' ISA-101 高绩效 HMI）
export type ThemeName = 'industrial' | 'light' | 'ocean' | 'isa101'

// 每个主题的展示元信息（用于下拉菜单/切换按钮的展示）
export interface ThemeMeta {
  key: ThemeName // 主题唯一标识，与 data-theme 属性值一致
  label: string // 显示名称
  icon: string // 图标（emoji）
  description: string // 一句话描述
}

// 内置主题列表（如果以后要加新主题，在这里追加一项即可）
export const THEMES: ThemeMeta[] = [
  { key: 'isa101', label: 'ISA-101 HMI', icon: '📟', description: '中性灰底 + 语义色，符合 ANSI/ISA-101.01-2015 高绩效 HMI' },
  { key: 'industrial', label: '暗色工业', icon: '🏭', description: '深色侧边栏 + 亮色工作区，沉稳专业' },
  { key: 'light', label: '亮色现代', icon: '☀️', description: '全亮色设计，清爽通透' },
  { key: 'ocean', label: '深蓝科技', icon: '🌊', description: '深蓝底色 + 青蓝高亮，科技感强' },
]

// 主题保存的文件名（应用配置目录下）
const STORAGE_FILE = 'theme.json'

// 定义主题 store（名为 'theme'，全局唯一）
export const useThemeStore = defineStore('theme', () => {
  // 当前主题名称；先用默认主题渲染，稍后异步从文件恢复用户选择
  // （文件读取是异步的，若上次选的不是默认主题，启动时会有极短暂的主题切换）
  const current = ref<ThemeName>('isa101')

  // 异步从文件读取上次保存的主题；
  // 若没有保存过或保存的值非法，则保持默认主题 'isa101'
  readJsonFile<{ theme: ThemeName }>(STORAGE_FILE).then(parsed => {
    const saved = parsed?.theme
    // 校验：只有保存的值确实是 THEMES 中存在的 key 才采用，防止脏数据
    if (saved && THEMES.some((t) => t.key === saved) && saved !== current.value) {
      applyTheme(saved)
    }
  })

  // 切换主题：更新响应式状态 + 写 <html data-theme> 属性 + 持久化到文件
  function applyTheme(name: ThemeName) {
    current.value = name
    // 把主题名写到 <html> 标签的 data-theme 属性上，
    // 全局 CSS 通过 [data-theme='xxx'] 选择器控制各区域颜色
    document.documentElement.setAttribute('data-theme', name)
    // 异步保存到文件（不阻塞界面切换）
    void writeJsonFile(STORAGE_FILE, { theme: name })
  }

  // 初始化时立即应用当前主题（保证页面一打开配色就正确）
  applyTheme(current.value)

  // 监听主题变化：如果其他地方直接修改了 current，也要同步 DOM 属性
  watch(current, (val) => {
    document.documentElement.setAttribute('data-theme', val)
  })

  // 对外暴露：当前主题 + 切换函数
  return { current, applyTheme }
})
