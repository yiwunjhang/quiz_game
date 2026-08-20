<script setup lang="ts">
import { computed } from 'vue'
import type { GamePlayer } from '../db/api'

const props = withDefaults(
  defineProps<{
    players: GamePlayer[]
    meId?: string | null
    /** 只顯示前幾名（不含自己時，自己會補在最後） */
    limit?: number
  }>(),
  { limit: 0, meId: null },
)

const ranked = computed(() => props.players.map((p, i) => ({ ...p, rank: i + 1 })))

const shown = computed(() => {
  if (!props.limit || ranked.value.length <= props.limit) return ranked.value
  const top = ranked.value.slice(0, props.limit)
  const me = ranked.value.find((p) => p.user_id === props.meId)
  if (me && !top.some((p) => p.user_id === me.user_id)) return [...top, me]
  return top
})

function medal(rank: number): string {
  return ['🥇', '🥈', '🥉'][rank - 1] ?? String(rank)
}
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="p in shown"
      :key="p.user_id"
      class="glass-soft flex items-center gap-3 px-4 py-2.5 animate-pop"
      :class="[
        p.rank <= 3 ? 'ring-1 ring-blush-300/70' : '',
        p.user_id === meId ? 'ring-2 ring-lilac-400/80' : '',
      ]"
    >
      <span class="w-8 flex-none text-center text-lg font-extrabold text-plum-500">
        {{ medal(p.rank) }}
      </span>
      <span class="flex-1 truncate font-bold text-plum-700">
        {{ p.nickname }}
        <span v-if="p.user_id === meId" class="ml-1 text-xs text-lilac-500">(你)</span>
      </span>
      <span class="flex-none text-right">
        <span class="block text-lg font-extrabold tabular-nums text-blush-600">{{ p.score }}</span>
        <span class="block text-[11px] text-plum-400">分</span>
      </span>
    </li>
  </ul>
</template>
