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
  <div class="flex min-h-full flex-col bg-blossom-50">
    <header class="sticky top-0 z-20 border-b border-blossom-200 bg-white/95 backdrop-blur-sm">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <RouterLink
          to="/"
          class="font-serif text-xl text-blossom-600 transition-colors duration-300 hover:text-blossom-700"
        >
          Quiz Party
          <span class="ml-2 hidden text-xs tracking-[0.35em] text-blossom-500 sm:inline">
            問答派對
          </span>
        </RouterLink>

        <nav class="flex items-center gap-5 text-sm sm:gap-7">
          <RouterLink
            to="/leaderboard"
            class="nav-link tracking-widest text-ink-600 transition-colors duration-300 hover:text-blossom-600"
          >
            排行榜
          </RouterLink>
          <RouterLink
            to="/admin"
            class="nav-link tracking-widest text-ink-600 transition-colors duration-300 hover:text-blossom-600"
          >
            後台
          </RouterLink>
          <template v-if="session.currentUser">
            <span class="hidden text-xs tracking-widest text-ink-400 sm:inline">
              {{ session.currentUser.nickname }}
            </span>
            <button class="btn btn-ghost btn-sm" @click="logout">登出</button>
          </template>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <RouterView />
    </main>

    <footer class="border-t border-blossom-200 py-8 text-center">
      <p class="font-serif text-base text-blossom-500">Quiz Party</p>
      <p class="mt-1 text-xs tracking-[0.2em] text-ink-400">
        Vue 3 · Supabase Realtime · GitHub Pages
      </p>
    </footer>
  </div>
</template>
