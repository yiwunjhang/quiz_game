<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AdminNav from '../components/AdminNav.vue'
import {
  createGame,
  deleteGame,
  getQuestionsAdmin,
  listMyGames,
  setGameLeaderboard,
  type HostedGame,
} from '../db/api'

const router = useRouter()

const seconds = ref(20)
const questionCount = ref(10)
const poolSize = ref<number | null>(null)
const games = ref<HostedGame[]>([])
const error = ref('')
const message = ref('')
const busy = ref(false)
const deletingId = ref<string | null>(null)

const poolEmpty = computed(() => poolSize.value === 0)
const live = computed(() => games.value.filter((g) => g.status !== 'ended'))
const past = computed(() => games.value.filter((g) => g.status === 'ended'))

const STATUS_LABEL: Record<string, string> = {
  lobby: '等待玩家',
  question: '作答中',
  reveal: '公布答案',
  ended: '已結束',
}

async function refresh() {
  try {
    poolSize.value = (await getQuestionsAdmin()).length
  } catch {
    poolSize.value = null
  }
  try {
    games.value = await listMyGames()
  } catch (e: any) {
    error.value = e?.message ?? '載入場次失敗'
  }
}

onMounted(refresh)

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
}

async function submit() {
  error.value = ''
  message.value = ''
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

/** 勾選 / 取消某場次是否計入排行榜。先改本地狀態，失敗再退回 */
async function toggleLeaderboard(g: HostedGame) {
  const next = !g.show_on_leaderboard
  g.show_on_leaderboard = next
  error.value = ''
  message.value = ''
  try {
    await setGameLeaderboard(g.id, next)
    message.value = next ? '已將該場次列入排行榜' : '已將該場次移出排行榜'
  } catch (e: any) {
    g.show_on_leaderboard = !next
    error.value = e?.message ?? '設定失敗'
  }
}

async function remove(g: HostedGame) {
  const when = formatDate(g.created_at)
  if (
    !confirm(
      `確定要刪除 ${when} 這場遊戲嗎？無法復原。\n` +
        `· 將移除這場的 ${g.player_count} 位玩家紀錄與作答資料\n` +
        '· 這場的分數會從總排行榜扣掉',
    )
  ) {
    return
  }
  deletingId.value = g.id
  error.value = ''
  message.value = ''
  try {
    const removed = await deleteGame(g.id)
    message.value = `已刪除該場次，排行榜移除了 ${removed} 筆成績`
    await refresh()
  } catch (e: any) {
    error.value = e?.message ?? '刪除失敗'
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <AdminNav title="主持遊戲" />

    <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>
    <p v-if="message" class="text-sm text-sage-600">{{ message }}</p>

    <div
      v-for="g in live"
      :key="g.id"
      class="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
    >
      <div>
        <p class="section-subtitle text-left">IN PROGRESS</p>
        <p class="text-ink-800">
          進行中的遊戲，代碼 {{ g.pin }} · {{ STATUS_LABEL[g.status] }} · {{ g.player_count }} 人
        </p>
      </div>
      <button
        class="btn btn-primary btn-sm"
        @click="router.push({ name: 'host', params: { id: g.id } })"
      >
        回到控台
      </button>
    </div>

    <!-- 建立新遊戲 -->
    <div class="card p-5 sm:p-7">
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

        <button type="submit" :disabled="busy || poolEmpty" class="btn btn-primary">
          {{ busy ? '建立中…' : '建立遊戲並進入控台' }}
        </button>
      </form>
    </div>

    <!-- 過往場次 -->
    <section>
      <h2 class="mb-2 font-serif text-lg text-blossom-600">過往場次（{{ past.length }}）</h2>
      <p class="mb-4 text-sm font-light text-ink-600">
        取消勾選就不會出現在總排行榜，資料仍保留、隨時可以再勾回來。
        真的不需要了才用刪除，那會連同該場的玩家與作答紀錄一起清掉。
      </p>

      <div v-if="past.length === 0" class="card p-8 text-center text-sm font-light text-ink-400">
        還沒有已結束的場次
      </div>

      <ul v-else class="card divide-y divide-blossom-200 px-5 py-2 sm:px-6">
        <li v-for="g in past" :key="g.id" class="flex flex-wrap items-center gap-3 py-3">
          <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              class="h-4 w-4 flex-none accent-blossom-500"
              :checked="g.show_on_leaderboard"
              @change="toggleLeaderboard(g)"
            />
            <span class="min-w-0">
              <span
                class="block text-sm"
                :class="g.show_on_leaderboard ? 'text-ink-800' : 'text-ink-400'"
              >
                {{ formatDate(g.created_at) }}
                <span v-if="!g.show_on_leaderboard" class="text-xs">（未列入排行榜）</span>
              </span>
              <span class="mt-0.5 block text-xs font-light text-ink-400">
                代碼 {{ g.pin }} · {{ g.question_count }} 題 · {{ g.player_count }} 人
              </span>
            </span>
          </label>
          <button
            class="btn btn-danger btn-sm flex-none"
            :disabled="deletingId === g.id"
            @click="remove(g)"
          >
            刪除
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
