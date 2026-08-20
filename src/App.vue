<script setup lang="ts">
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useSessionStore } from './stores/session'

const session = useSessionStore()
const router = useRouter()

async function logout() {
  await session.logout()
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="min-h-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100">
    <header class="border-b border-white/10 backdrop-blur sticky top-0 z-10 bg-slate-900/60">
      <div class="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3">
        <RouterLink to="/" class="flex items-center gap-2 font-bold text-lg">
          <span class="text-2xl">🧠</span>
          <span class="hidden sm:inline">問答遊戲挑戰</span>
        </RouterLink>
        <nav class="flex items-center gap-1 sm:gap-2 text-sm">
          <RouterLink
            to="/leaderboard"
            class="px-3 py-1.5 rounded-lg hover:bg-white/10 transition"
            active-class="bg-white/10"
          >
            🏆 排行榜
          </RouterLink>
          <RouterLink
            to="/admin"
            class="px-3 py-1.5 rounded-lg hover:bg-white/10 transition"
            active-class="bg-white/10"
          >
            ⚙️ 後台
          </RouterLink>
          <template v-if="session.currentUser">
            <span class="px-2 text-indigo-300 hidden sm:inline"
              >嗨，{{ session.currentUser.nickname }}</span
            >
            <button
              class="px-3 py-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-500 transition"
              @click="logout"
            >
              登出
            </button>
          </template>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-8">
      <RouterView />
    </main>

    <footer class="text-center text-xs text-slate-500 py-6">
      Vue 3 · Tailwind CSS · 瀏覽器內 SQLite · 部署於 GitHub Pages
    </footer>
  </div>
</template>
