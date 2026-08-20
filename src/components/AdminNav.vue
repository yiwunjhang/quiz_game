<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listHostApplications } from '../db/api'
import { useSessionStore } from '../stores/session'

defineProps<{ title: string }>()

const router = useRouter()
const session = useSessionStore()

/** 待審申請數，讓主持人不用特地點進去才知道有人在等 */
const pendingCount = ref(0)

onMounted(async () => {
  try {
    const apps = await listHostApplications()
    pendingCount.value = apps.filter((a) => a.status === 'pending').length
  } catch {
    pendingCount.value = 0
  }
})

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

    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
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
        <RouterLink
          :to="{ name: 'admin-applications' }"
          class="nav-link flex items-center gap-1.5 tracking-widest text-ink-600 transition-colors duration-300 hover:text-blossom-600"
          active-class="is-active text-blossom-600"
        >
          申請審核
          <span
            v-if="pendingCount"
            class="grid h-5 min-w-5 place-items-center rounded-full bg-blossom-500 px-1.5 text-[11px] tracking-normal text-white"
          >
            {{ pendingCount }}
          </span>
        </RouterLink>
      </nav>
      <button class="btn btn-ghost btn-sm" @click="logout">登出後台</button>
    </div>
  </div>
</template>
