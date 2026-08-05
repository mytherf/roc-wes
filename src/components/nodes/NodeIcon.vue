<template>
  <img
    v-if="isImage"
    class="node-icon-img"
    :src="icon"
    :width="size"
    :height="size"
    :alt="alt"
    draggable="false"
  />
  <span v-else class="node-icon-emoji" :style="{ fontSize: size + 'px' }" :aria-label="alt">{{ icon }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isImageIcon } from './nodeIcons'

/**
 * NodeIcon - 统一图标渲染组件
 *
 * 节点图标可能是 emoji 字符（预设/默认图标），也可能是 data: URL（用户上传的图片）。
 * 此组件屏蔽渲染差异：图片走 <img>（固定宽高保持比例裁切由 object-fit 处理），
 * emoji 走文本（font-size 控制视觉大小）。
 */
const props = withDefaults(defineProps<{
  /** 图标内容：emoji 字符或 data: URL */
  icon: string
  /** 显示尺寸（px） */
  size?: number
  /** 无障碍描述 */
  alt?: string
}>(), {
  size: 20,
  alt: '节点图标',
})

const isImage = computed(() => isImageIcon(props.icon))
</script>

<style scoped>
.node-icon-img {
  object-fit: contain;
  flex-shrink: 0;
  line-height: 1;
  vertical-align: middle;
  border-radius: 3px;
}
.node-icon-emoji {
  line-height: 1;
  flex-shrink: 0;
}
</style>
