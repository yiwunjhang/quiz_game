<script setup lang="ts">
import { computed } from 'vue'
import type { GamePlayer } from '../db/api'

const props = defineProps<{ players: GamePlayer[]; meId?: string | null }>()

/** 頒獎台順序：第 2 名在左、第 1 名在中、第 3 名在右 */
const podium = computed(() => {
  const [first, second, third] = props.players
  return [
    { p: second, rank: 2, height: 'h-24 sm:h-32', medal: '🥈' },
    { p: first, rank: 1, height: 'h-32 sm:h-44', medal: '🥇' },
    { p: third, rank: 3, height: 'h-16 sm:h-24', medal: '🥉' },
  ].filter((s) => s.p)
})

const rest = computed(() => props.players.slice(3))
</script>

<template>
  <div>
    <div class="flex items-end justify-center gap-3 sm:gap-5">
      <div
        v-for="(slot, i) in podium"
        :key="slot.rank"
        class="flex w-24 flex-col items-center sm:w-32 animate-pop"
        :style="{ animationDelay: 120 * i + 'ms' }"
      >
        <span class="text-3xl sm:text-4xl animate-bob">{{ slot.medal }}</span>
        <span
          class="mt-1 max-w-full truncate text-center text-sm font-extrabold text-plum-700 sm:text-base"
          :class="slot.p.user_id === meId ? 'text-lilac-500' : ''"
        >
          {{ slot.p.nickname }}
        </span>
        <span class="text-xs font-bold text-blush-600">{{ slot.p.score }} 分</span>
        <div
          class="glass mt-2 w-full rounded-t-2xl rounded-b-none border-b-0 grid place-items-center"
          :class="slot.height"
        >
          <span class="text-2xl font-black text-plum-400/70 sm:text-3xl">{{ slot.rank }}</span>
        </div>
      </div>
    </div>

    <ul v-if="rest.length" class="mt-6 space-y-2">
      <li
        v-for="(p, i) in rest"
        :key="p.user_id"
        class="glass-soft flex items-center gap-3 px-4 py-2"
        :class="p.user_id === meId ? 'ring-2 ring-lilac-400/80' : ''"
      >
        <span class="w-7 flex-none text-center font-bold text-plum-400">{{ i + 4 }}</span>
        <span class="flex-1 truncate font-semibold text-plum-700">{{ p.nickname }}</span>
        <span class="font-extrabold tabular-nums text-blush-600">{{ p.score }}</span>
      </li>
    </ul>
  </div>
</template>
