<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import IconCrown from './IconCrown.vue'
import type { GlobalRankRow } from '../db/api'

const props = defineProps<{ rows: GlobalRankRow[]; meId?: string | null }>()

/** 長條由 0 往上長，掛載後才切換到實際高度 */
const grown = ref(false)

onMounted(() => {
  // 等一次 paint，瀏覽器才會把 0 → 目標高度當成 transition
  requestAnimationFrame(() => requestAnimationFrame(() => (grown.value = true)))
})

const top = computed(() => props.rows.slice(0, 3))

/** 以第一名為基準換算高度；全 0 分時避免除以零 */
const max = computed(() => Math.max(...top.value.map((r) => r.total_score), 1))

/** 頒獎台排序：第二名在左、第一名在中、第三名在右 */
const columns = computed(() =>
  [1, 0, 2]
    .filter((i) => top.value[i])
    .map((i) => {
      const row = top.value[i]
      const ratio = row.total_score / max.value
      return {
        row,
        rank: i + 1,
        // 分數不是 0 就至少留 8px，免得極小的長條看起來像壞掉
        height: `max(calc(var(--podium-max) * ${ratio.toFixed(4)}), ${
          row.total_score > 0 ? '8px' : '0px'
        })`,
        // 由中間的第一名先長，再往兩側
        delay: (i === 0 ? 0 : i === 1 ? 160 : 300) + 'ms',
      }
    }),
)
</script>

<template>
  <figure v-if="top.length" class="card m-0 p-5 sm:p-8">
    <figcaption class="mb-6 border-b border-blossom-200 pb-3">
      <p class="section-subtitle text-left">TOP 3</p>
      <h2 class="font-serif text-lg text-blossom-600">前三名總分</h2>
    </figcaption>

    <div class="podium-chart">
      <div v-for="c in columns" :key="c.row.user_id" class="podium-col" :class="`rank-${c.rank}`">
        <IconCrown v-if="c.rank === 1" class="podium-crown" />

        <span
          class="w-full truncate text-sm font-medium"
          :class="c.row.user_id === meId ? 'text-blossom-600' : 'text-ink-900'"
        >
          {{ c.row.nickname }}
        </span>
        <span class="text-[11px] tracking-widest text-ink-400">第 {{ c.rank }} 名</span>
        <span class="font-serif text-lg tabular-nums text-ink-900 sm:text-xl">
          {{ c.row.total_score }}
        </span>

        <div
          class="podium-bar"
          :style="{ height: grown ? c.height : '0px', transitionDelay: c.delay }"
        ></div>
      </div>
    </div>
  </figure>
</template>
