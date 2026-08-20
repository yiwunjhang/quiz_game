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
  <div class="relative min-h-full">
    <!-- 背景柔霧光暈 -->
    <div class="blob-field" aria-hidden="true">
      <div
        class="blob"
        style="width: 460px; height: 460px; top: -120px; left: -100px; background: #ffb8d6"
      ></div>
      <div
        class="blob"
        style="
          width: 400px;
          height: 400px;
          top: 18%;
          right: -120px;
          background: #cdb6ff;
          animation-delay: -6s;
        "
      ></div>
      <div
        class="blob"
        style="
          width: 380px;
          height: 380px;
          bottom: -140px;
          left: 25%;
          background: #a9e7ff;
          animation-delay: -11s;
        "
      ></div>
      <div
        class="blob"
        style="
          width: 300px;
          height: 300px;
          bottom: 8%;
          right: 12%;
          background: #ffd7b8;
          animation-delay: -3s;
        "
      ></div>
    </div>

    <div class="relative z-10 flex min-h-full flex-col">
      <header class="sticky top-0 z-20 border-b border-white/50 bg-white/35 backdrop-blur-xl">
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <RouterLink to="/" class="flex items-center gap-2 text-lg font-extrabold text-plum-700">
            <span class="text-2xl">🌸</span>
            <span class="hidden sm:inline">粉紅問答派對</span>
          </RouterLink>

          <nav class="flex items-center gap-1 text-sm sm:gap-2">
            <RouterLink
              to="/leaderboard"
              class="rounded-full px-3 py-1.5 font-semibold text-plum-600 transition hover:bg-white/60"
              active-class="bg-white/70"
            >
              🏆 排行榜
            </RouterLink>
            <RouterLink
              to="/admin"
              class="rounded-full px-3 py-1.5 font-semibold text-plum-600 transition hover:bg-white/60"
              active-class="bg-white/70"
            >
              ⚙️ 後台
            </RouterLink>
            <template v-if="session.currentUser">
              <span class="hidden px-2 text-plum-500 sm:inline">
                嗨，{{ session.currentUser.nickname }}
              </span>
              <button class="btn btn-ghost btn-sm" @click="logout">登出</button>
            </template>
          </nav>
        </div>
      </header>

      <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <RouterView />
      </main>

      <footer class="py-6 text-center text-xs text-plum-400">
        Vue 3 · Tailwind CSS · Supabase Realtime · 部署於 GitHub Pages
      </footer>
    </div>
  </div>
</template>
