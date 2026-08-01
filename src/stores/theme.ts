import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeName = 'industrial' | 'light' | 'ocean'

export interface ThemeMeta {
  key: ThemeName
  label: string
  icon: string
  description: string
}

export const THEMES: ThemeMeta[] = [
  { key: 'industrial', label: '暗色工业', icon: '🏭', description: '深色侧边栏 + 亮色工作区，沉稳专业' },
  { key: 'light', label: '亮色现代', icon: '☀️', description: '全亮色设计，清爽通透' },
  { key: 'ocean', label: '深蓝科技', icon: '🌊', description: '深蓝底色 + 青蓝高亮，科技感强' },
]

const STORAGE_KEY = 'roc-wes-theme'

export const useThemeStore = defineStore('theme', () => {
  const current = ref<ThemeName>(loadTheme())

  function loadTheme(): ThemeName {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && THEMES.some((t) => t.key === saved)) {
        return saved as ThemeName
      }
    } catch { /* ignore */ }
    return 'industrial'
  }

  function applyTheme(name: ThemeName) {
    current.value = name
    document.documentElement.setAttribute('data-theme', name)
    try {
      localStorage.setItem(STORAGE_KEY, name)
    } catch { /* ignore */ }
  }

  // 初始化时立即应用
  applyTheme(current.value)

  watch(current, (val) => {
    document.documentElement.setAttribute('data-theme', val)
  })

  return { current, applyTheme }
})
