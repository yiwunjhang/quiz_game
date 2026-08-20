<script setup lang="ts">
import { computed } from 'vue'
import type { GamePlayer } from '../db/api'

const props = defineProps<{ players: GamePlayer[]; meId?: string | null }>()

/** 頒獎台順序：第 2 名在左、第 1 名在中、第 3 名在右 */
const podium = computed(() => {
  const [first, second, third] = props.players
  return [
    { p: second, rank: 2, height: 'h-20 sm:h-28' },
    { p: first, rank: 1, height: 'h-28 sm:h-40' },
    { p: third, rank: 3, height: 'h-14 sm:h-20' },
  ].filter((s) => s.p)
})

const rest = computed(() => props.players.slice(3))
</script>

<template>
  <div>
    <div class="flex items-end justify-center gap-4 sm:gap-6">
      <div
        v-for="(slot, i) in podium"
        :key="slot.rank"
        class="animate-fade-up flex w-24 flex-col items-center sm:w-32"
        :style="{ animationDelay: 140 * i + 'ms' }"
      >
        <span
          class="max-w-full truncate text-center text-sm font-medium sm:text-base"
          :class="slot.p.user_id === meId ? 'text-blossom-600' : 'text-ink-800'"
        >
          {{ slot.p.nickname }}
        </span>
        <span class="mt-0.5 font-serif text-lg text-blossom-500">{{ slot.p.score }}</span>
        <div
          class="mt-3 grid w-full place-items-center rounded-t-2xl border border-b-0 border-blossom-200"
          :class="[slot.height, slot.rank === 1 ? 'bg-blossom-100' : 'bg-white']"
        >
          <span class="font-serif text-3xl text-blossom-500 sm:text-4xl">{{ slot.rank }}</span>
        </div>
      </div>
    </div>

    <ul v-if="rest.length" class="mx-auto mt-8 max-w-sm divide-y divide-blossom-200">
      <li
        v-for="(p, i) in rest"
        :key="p.user_id"
        class="flex items-center gap-4 py-2.5"
        :class="p.user_id === meId ? 'text-blossom-600' : 'text-ink-800'"
      >
        <span class="w-7 flex-none text-center font-serif text-ink-400">{{ i + 4 }}</span>
        <span class="flex-1 truncate font-medium">{{ p.nickname }}</span>
        <span class="font-serif tabular-nums text-blossom-600">{{ p.score }}</span>
      </li>
    </ul>
  </div>
</template>
