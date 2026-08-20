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
    else if (props.picked) list.push('opt-wrong', 'opt-dim')
    else list.push('opt-dim')
  } else if (props.picked) {
    list.push('opt-correct')
  }
  if (props.large) list.push('text-lg sm:text-xl py-5')
  return list
})
</script>

<template>
  <button class="opt" :class="classes" :disabled="disabled" type="button">
    <span class="opt-shape">{{ shape }}</span>
    <span class="flex-1 break-words">{{ text }}</span>

    <span
      v-if="count != null"
      class="flex-none rounded-full bg-white/70 px-3 py-1 text-sm font-bold text-plum-600"
    >
      {{ count }} 人
    </span>
    <span v-else-if="revealed && isCorrect" class="flex-none text-xl">✅</span>
    <span v-else-if="picked && !revealed" class="flex-none text-xl">✓</span>
  </button>
</template>
