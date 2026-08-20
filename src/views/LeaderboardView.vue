<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getLeaderboard, type LeaderboardRow } from '../db/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const rows = ref<LeaderboardRow[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    rows.value = await getLeaderboard()
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
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-extrabold mb-6 flex items-center gap-2">🏆 排行榜</h1>

    <div v-if="loading" class="text-center py-16 text-slate-400">載入中…</div>
    <div v-else-if="error" class="text-center py-16 text-rose-400">{{ error }}</div>
    <div v-else-if="rows.length === 0" class="text-center py-16 text-slate-400">
      還沒有人完成挑戰，快去當第一名吧！
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(row, i) in rows"
        :key="row.user_id"
        class="flex items-center gap-4 rounded-xl border px-4 py-3 transition"
        :class="[
          i < 3 ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-white/5',
          session.currentUser?.id === row.user_id ? 'ring-2 ring-indigo-400' : '',
        ]"
      >
        <div class="w-10 text-center text-xl font-bold">{{ medal(i) }}</div>
        <div class="flex-1">
          <div class="font-semibold">{{ row.nickname }}</div>
          <div class="text-xs text-slate-400">作答 {{ row.answered_count }} 題</div>
        </div>
        <div class="text-right">
          <div class="text-2xl font-extrabold text-indigo-400">{{ row.correct_count }}</div>
          <div class="text-xs text-slate-400">答對</div>
        </div>
      </div>
    </div>
  </div>
</template>
