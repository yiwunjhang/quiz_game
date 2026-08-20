<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TopThreeChart from '../components/TopThreeChart.vue'
import { getGlobalLeaderboard, type GlobalRankRow } from '../db/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const rows = ref<GlobalRankRow[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    rows.value = await getGlobalLeaderboard()
  } catch (e: any) {
    error.value = e?.message ?? '載入失敗'
  } finally {
    loading.value = false
  }
})

</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div class="mb-8 text-center sm:mb-10">
      <p class="section-subtitle">LEADERBOARD</p>
      <h1 class="section-title">總排行榜</h1>
      <p class="text-sm font-light text-ink-600">累計所有已結束場次的得分</p>
    </div>

    <div v-if="loading" class="flex flex-col items-center gap-4 py-20">
      <div class="loader-ring"></div>
    </div>
    <div v-else-if="error" class="card p-10 text-center text-blossom-600 sm:p-16">{{ error }}</div>
    <div v-else-if="rows.length === 0" class="card p-10 text-center font-light text-ink-400 sm:p-16">
      還沒有完賽的紀錄，快去開一場遊戲吧
    </div>

    <TopThreeChart v-else-if="rows.length" :rows="rows" :me-id="session.currentUser?.id" />

    <!-- 完整名次同時也是圖表的表格版本 -->
    <ul
      v-if="!loading && !error && rows.length"
      class="card mt-6 divide-y divide-blossom-200 px-5 py-2 sm:px-8"
    >
      <li
        v-for="(row, i) in rows"
        :key="row.user_id"
        class="animate-fade-up flex items-center gap-5 py-4"
        :style="{ animationDelay: Math.min(i, 10) * 40 + 'ms' }"
      >
        <div
          class="w-8 flex-none text-center font-serif text-xl"
          :class="i < 3 ? 'text-blossom-500' : 'text-ink-400'"
        >
          {{ i + 1 }}
        </div>
        <div class="min-w-0 flex-1">
          <div
            class="truncate font-medium"
            :class="
              session.currentUser?.id === row.user_id ? 'text-blossom-600' : 'text-ink-900'
            "
          >
            {{ row.nickname }}
            <span
              v-if="session.currentUser?.id === row.user_id"
              class="ml-1 text-xs tracking-widest text-blossom-500"
            >
              YOU
            </span>
          </div>
          <div class="mt-0.5 text-xs font-light text-ink-400">
            {{ row.games_played }} 場 · 答對 {{ row.correct_total }} 題 · 單場最高
            {{ row.best_score }}
          </div>
        </div>
        <div class="flex-none text-right">
          <div class="font-serif text-2xl tabular-nums text-blossom-600">
            {{ row.total_score }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
