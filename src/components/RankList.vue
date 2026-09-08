<script setup lang="ts">
import { computed } from 'vue'
import type { GamePlayer } from '../db/api'

const props = withDefaults(
  defineProps<{
    players: GamePlayer[]
    meId?: string | null
    /** 只顯示前幾名（不含自己時，自己會補在最後） */
    limit?: number
    /** 主持人畫面才開，每列多一個移出玩家的按鈕 */
    kickable?: boolean
  }>(),
  { limit: 0, meId: null, kickable: false },
)

defineEmits<{ kick: [player: GamePlayer] }>()

const ranked = computed(() => props.players.map((p, i) => ({ ...p, rank: i + 1 })))

const shown = computed(() => {
  if (!props.limit || ranked.value.length <= props.limit) return ranked.value
  const top = ranked.value.slice(0, props.limit)
  const me = ranked.value.find((p) => p.user_id === props.meId)
  if (me && !top.some((p) => p.user_id === me.user_id)) return [...top, me]
  return top
})
</script>

<template>
  <ul class="divide-y divide-blossom-200">
    <li
      v-for="p in shown"
      :key="p.user_id"
      class="animate-fade-up flex items-center gap-4 py-3"
      :class="p.user_id === meId ? 'text-blossom-600' : 'text-ink-800'"
    >
      <span
        class="w-7 flex-none text-center font-serif text-lg"
        :class="p.rank <= 3 ? 'text-blossom-500' : 'text-ink-400'"
      >
        {{ p.rank }}
      </span>
      <span class="flex-1 truncate font-medium">
        {{ p.nickname }}
        <span v-if="p.user_id === meId" class="ml-1 text-xs tracking-widest text-blossom-500">
          YOU
        </span>
      </span>
      <span class="flex-none font-serif text-lg tabular-nums text-blossom-600">
        {{ p.score }}
      </span>
      <button
        v-if="kickable"
        type="button"
        class="h-8 w-8 flex-none rounded-full border border-blossom-200 text-ink-400 transition-all duration-300 hover:border-blossom-500 hover:text-blossom-600"
        :title="`移出 ${p.nickname}`"
        @click="$emit('kick', p)"
      >
        ✕
      </button>
    </li>
  </ul>
</template>
