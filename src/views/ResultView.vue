<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getMyScore, getLeaderboard } from '../db/api'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const score = ref({ correct: 0, total: 0 })
const rank = ref<number | null>(null)
const loading = ref(true)

const percent = computed(() =>
  score.value.total ? Math.round((score.value.correct / score.value.total) * 100) : 0,
)

onMounted(async () => {
  try {
    score.value = await getMyScore()
    const board = await getLeaderboard()
    const pos = board.findIndex((r) => r.user_id === session.currentUser?.id)
    rank.value = pos >= 0 ? pos + 1 : null
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-md mx-auto text-center">
    <div class="text-6xl mb-4">
      {{ percent >= 80 ? '🏆' : percent >= 50 ? '🎉' : '💪' }}
    </div>
    <h1 class="text-2xl font-extrabold mb-2">挑戰完成！</h1>
    <p class="text-slate-300 mb-6">{{ session.currentUser?.nickname }}，這是你的成績</p>

    <div v-if="loading" class="text-slate-400 py-10">計算中…</div>

    <div v-else class="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl space-y-4">
      <div>
        <div class="text-5xl font-extrabold text-indigo-400">
          {{ score.correct }}<span class="text-2xl text-slate-400"> / {{ score.total }}</span>
        </div>
        <p class="text-slate-400 mt-1">答對題數</p>
      </div>
      <div class="h-2 rounded-full bg-white/10 overflow-hidden">
        <div class="h-full bg-emerald-500" :style="{ width: percent + '%' }"></div>
      </div>
      <p class="text-sm text-slate-400">正確率 {{ percent }}%</p>
      <p v-if="rank" class="text-lg">
        目前排名第 <span class="font-bold text-amber-400">{{ rank }}</span> 名
      </p>
    </div>

    <div class="flex gap-3 mt-6">
      <button
        class="flex-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold py-2.5 transition"
        @click="router.push({ name: 'home' })"
      >
        回首頁
      </button>
      <button
        class="flex-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold py-2.5 transition"
        @click="router.push({ name: 'leaderboard' })"
      >
        看排行榜 🏆
      </button>
    </div>
  </div>
</template>
