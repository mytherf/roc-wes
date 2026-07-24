import { ref, onBeforeUnmount, type Ref } from 'vue'

/**
 * useNodeData - X6 节点数据初始化与同步 composable
 *
 * 消除所有节点组件中重复的 getData() 初始化 + change:data 监听模式。
 *
 * @param node - X6 节点实例（来自 props.node）
 * @param defaults - 字段默认值 schema，如 { name: '输送线-01', status: 'idle', speed: 0 }
 * @returns 响应式数据对象，字段与 defaults 一致
 *
 * @example
 * const { name, status, speed } = useNodeData(props.node, {
 *   name: '输送线-01',
 *   status: 'idle',
 *   speed: 0,
 * })
 */
export function useNodeData<T extends Record<string, any>>(
  node: any,
  defaults: T
): { [K in keyof T]: Ref<T[K]> } {
  const initialData = node?.getData() || {}

  // 为每个字段创建响应式 ref，初始值从节点数据或默认值取
  const refs = {} as { [K in keyof T]: Ref<T[K]> }
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    refs[key] = ref(initialData[key] ?? defaults[key]) as Ref<T[keyof T]>
  }

  // 监听 X6 节点数据变化，增量同步到响应式 ref
  const handler = ({ current }: { current: any }) => {
    const newData = current?.getData?.() || current || node?.getData()
    if (!newData) return
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      if (newData[key] !== undefined) {
        ;(refs[key] as Ref<any>).value = newData[key]
      }
    }
  }

  node?.on('change:data', handler)

  onBeforeUnmount(() => {
    node?.off('change:data', handler)
  })

  return refs
}
