<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

function medal(i: number): string {
  return ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="mb-1 text-3xl font-black text-plum-800">🏆 總排行榜</h1>
    <p class="mb-6 text-sm text-plum-500">累計所有已結束場次的得分</p>

    <div v-if="loading" class="glass p-16 text-center text-plum-400">載入中…</div>
    <div v-else-if="error" class="glass p-16 text-center text-blush-600">{{ error }}</div>
    <div v-else-if="rows.length === 0" class="glass p-16 text-center text-plum-400">
      還沒有完賽的紀錄，快去開一場遊戲吧！
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="(row, i) in rows"
        :key="row.user_id"
        class="glass animate-pop flex items-center gap-4 px-5 py-3.5"
        :class="[
          i < 3 ? 'ring-1 ring-blush-300/70' : '',
          session.currentUser?.id === row.user_id ? 'ring-2 ring-lilac-400/80' : '',
        ]"
        :style="{ animationDelay: Math.min(i, 10) * 40 + 'ms' }"
      >
        <div class="w-10 flex-none text-center text-2xl font-black text-plum-500">
          {{ medal(i) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate font-extrabold text-plum-700">{{ row.nickname }}</div>
          <div class="text-xs text-plum-400">
            {{ row.games_played }} 場 · 答對 {{ row.correct_total }} 題 · 單場最高
            {{ row.best_score }}
          </div>
        </div>
        <div class="flex-none text-right">
          <div class="text-2xl font-black tabular-nums text-blush-600">{{ row.total_score }}</div>
          <div class="text-xs text-plum-400">總分</div>
        </div>
      </li>
    </ul>
  </div>
</template>
