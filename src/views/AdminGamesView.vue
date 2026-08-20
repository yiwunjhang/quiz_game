<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AdminNav from '../components/AdminNav.vue'
import { createGame, getMyActiveGame, getQuestionsAdmin } from '../db/api'

const router = useRouter()

const seconds = ref(20)
const questionCount = ref(10)
const poolSize = ref<number | null>(null)
const error = ref('')
const busy = ref(false)

/** 主持中還沒結束的那一場，重新整理後可直接回到控台 */
const active = ref<{ gameId: string; pin: string; isHost: boolean } | null>(null)

const poolEmpty = computed(() => poolSize.value === 0)

async function refresh() {
  try {
    poolSize.value = (await getQuestionsAdmin()).length
  } catch {
    poolSize.value = null
  }
  try {
    const a = await getMyActiveGame()
    active.value = a?.isHost ? a : null
  } catch {
    active.value = null
  }
}

onMounted(refresh)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const { gameId } = await createGame(seconds.value, questionCount.value)
    router.push({ name: 'host', params: { id: gameId } })
  } catch (e: any) {
    error.value = e?.message ?? '建立遊戲失敗'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <AdminNav title="主持遊戲" />

    <div
      v-if="active"
      class="card flex flex-wrap items-center justify-between gap-4 p-6"
    >
      <div>
        <p class="section-subtitle text-left">IN PROGRESS</p>
        <p class="text-ink-800">你有一場主持中的遊戲，代碼 {{ active.pin }}</p>
      </div>
      <button
        class="btn btn-primary btn-sm"
        @click="router.push({ name: 'host', params: { id: active!.gameId } })"
      >
        回到控台
      </button>
    </div>

    <div class="card p-7">
      <h2 class="mb-2 font-serif text-lg text-blossom-600">建立新遊戲</h2>
      <p class="mb-6 text-sm font-light text-ink-600">
        從題庫隨機抽題並產生 6 位數代碼，參加者在首頁輸入代碼即可加入。
        <span v-if="poolSize != null" class="text-ink-400">（目前題庫共 {{ poolSize }} 題）</span>
      </p>

      <div
        v-if="poolEmpty"
        class="mb-6 rounded-2xl border border-sand-300 bg-sand-100 px-4 py-3 text-sm text-ink-800"
      >
        題庫是空的，請先到
        <RouterLink :to="{ name: 'admin-questions' }" class="text-blossom-600">題庫管理</RouterLink>
        新增題目。
      </div>

      <form class="space-y-5" @submit.prevent="submit">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-2 block text-xs tracking-widest text-ink-400">題數</label>
            <input v-model.number="questionCount" type="number" min="1" max="50" class="field" />
          </div>
          <div>
            <label class="mb-2 block text-xs tracking-widest text-ink-400">每題秒數</label>
            <input v-model.number="seconds" type="number" min="5" max="120" class="field" />
          </div>
        </div>

        <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>

        <button type="submit" :disabled="busy || poolEmpty" class="btn btn-primary">
          {{ busy ? '建立中…' : '建立遊戲並進入控台' }}
        </button>
      </form>
    </div>
  </div>
</template>
