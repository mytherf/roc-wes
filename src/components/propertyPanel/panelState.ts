// ========== 属性面板级共享状态（provide/inject 契约）==========
// 面板壳（PropertyPanel）与标签页子组件间除绑定模型（NODE_BINDING_KEY）外，
// 还需共享「当前激活标签页」：事件标签页切换选中节点时经 useNodeEvents
// 把面板重置回「基础」页。
//
// 注意：不能以 prop 直接传 ref——Vue 会对顶层 ref 类型的 prop 自动解包，
// 子组件收到的是字符串而非可写 ref，故经 provide/inject 传递。

import type { InjectionKey, Ref } from 'vue'

/** 面板级共享状态（activeTab 为可写引用） */
export interface PanelState {
    activeTab: Ref<string>
}

/** provide/inject 键：PropertyPanel provide，事件标签页 inject */
export const PANEL_STATE_KEY: InjectionKey<PanelState> = Symbol('panel-state')
