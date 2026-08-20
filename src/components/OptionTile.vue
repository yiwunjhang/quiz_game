<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    index: number
    text: string
    disabled?: boolean
    /** 我選的就是這個 */
    picked?: boolean
    /** 公布答案後：這是正確答案 */
    isCorrect?: boolean
    /** 公布答案後才會標示對錯 */
    revealed?: boolean
    /** 公布答案後顯示有幾人選這個 */
    count?: number | null
    /** 大版面（主持人投影用） */
    large?: boolean
  }>(),
  { count: null },
)

const SHAPES = ['▲', '◆', '●', '■', '✚', '★']

const shape = computed(() => SHAPES[props.index % SHAPES.length])

const classes = computed(() => {
  const list = [`opt-${props.index % 6}`]
  if (props.revealed) {
    if (props.isCorrect) list.push('opt-correct')
    else if (props.picked) list.push('opt-wrong')
    else list.push('opt-dim')
  } else if (props.picked) {
    list.push('opt-picked')
  }
  if (props.large) list.push('text-lg py-5 sm:text-xl')
  return list
})
</script>

<template>
  <button class="opt" :class="classes" :disabled="disabled" type="button">
    <span class="opt-shape">{{ shape }}</span>
    <span class="flex-1 break-words">{{ text }}</span>

    <span
      v-if="count != null"
      class="flex-none rounded-full border border-blossom-200 bg-blossom-50 px-3 py-1 text-xs font-medium tracking-widest text-ink-600"
    >
      {{ count }} 人
    </span>
    <span
      v-else-if="revealed && isCorrect"
      class="flex-none text-sm font-medium tracking-widest text-sage-600"
    >
      正解
    </span>
    <span
      v-else-if="picked && !revealed"
      class="flex-none text-sm font-medium tracking-widest text-blossom-600"
    >
      已選
    </span>
  </button>
</template>
