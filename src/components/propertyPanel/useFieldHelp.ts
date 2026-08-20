// ========== 字段帮助气泡（单开模式）==========
// 属性面板各标签页的「?」帮助气泡共用逻辑：
// 点击 ? 切换（再点同一个收起，单开），点击气泡外部自动关闭。

import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useFieldHelp() {
  /** 当前打开的气泡 key（null = 全部收起，单开模式） */
  const fieldHelpOpen = ref<string | null>(null)

  /** 切换字段帮助气泡（再点同一个 ? 则收起） */
  function toggleFieldHelp(key: string) {
    fieldHelpOpen.value = fieldHelpOpen.value === key ? null : key
  }

  /** 点击气泡外部时关闭 */
  function onDocumentPointerDown(e: Event) {
    if (!fieldHelpOpen.value) return
    const t = e.target
    if (!(t instanceof Element && t.closest('.field-help-wrap'))) {
      fieldHelpOpen.value = null
    }
  }

  onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

  return { fieldHelpOpen, toggleFieldHelp }
}
