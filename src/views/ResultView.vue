<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { getUserScore, getLeaderboard } from '../db/database'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const user = session.currentUser
const score = user ? getUserScore(user.id) : { correct: 0, total: 0 }

const rank = computed(() => {
  if (!user) return null
  const board = getLeaderboard()
  const pos = board.findIndex((r) => r.user_id === user.id)
  return pos >= 0 ? pos + 1 : null
})

const percent = computed(() =>
  score.total ? Math.round((score.correct / score.total) * 100) : 0,
)

function again() {
  router.push({ name: 'quiz' })
}
</script>

<template>
  <div class="max-w-md mx-auto text-center">
    <div class="text-6xl mb-4">
      {{ percent >= 80 ? '🏆' : percent >= 50 ? '🎉' : '💪' }}
    </div>
    <h1 class="text-2xl font-extrabold mb-2">挑戰完成！</h1>
    <p class="text-slate-300 mb-6">{{ user?.nickname }}，這是你的成績</p>

    <div class="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl space-y-4">
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
        class="flex-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold py-2.5 transition"
        @click="again"
      >
        再挑戰一次
      </button>
      <button
        class="flex-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold py-2.5 transition"
        @click="router.push({ name: 'leaderboard' })"
      >
        看排行榜 🏆
      </button>
    </div>
  </div>
</template>
