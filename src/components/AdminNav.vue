<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

defineProps<{ title: string }>()

const router = useRouter()
const session = useSessionStore()

async function logout() {
  await session.logout()
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4 border-b border-blossom-200 pb-4">
    <div>
      <p class="section-subtitle text-left">ADMIN</p>
      <h1 class="font-serif text-2xl text-blossom-600">{{ title }}</h1>
    </div>

    <div class="flex items-center gap-6">
      <nav class="flex items-center gap-5 text-sm">
        <RouterLink
          :to="{ name: 'admin-games' }"
          class="nav-link tracking-widest text-ink-600 transition-colors duration-300 hover:text-blossom-600"
          active-class="is-active text-blossom-600"
        >
          主持遊戲
        </RouterLink>
        <RouterLink
          :to="{ name: 'admin-questions' }"
          class="nav-link tracking-widest text-ink-600 transition-colors duration-300 hover:text-blossom-600"
          active-class="is-active text-blossom-600"
        >
          題庫管理
        </RouterLink>
      </nav>
      <button class="btn btn-ghost btn-sm" @click="logout">登出後台</button>
    </div>
  </div>
</template>
