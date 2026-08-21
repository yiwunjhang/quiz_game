<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OptionTile from '../components/OptionTile.vue'
import TopThreeChart from '../components/TopThreeChart.vue'
import RankList from '../components/RankList.vue'
import TimerRing from '../components/TimerRing.vue'
import { hostAction } from '../db/api'
import { useGame } from '../composables/useGame'

const route = useRoute()
const router = useRouter()
const gameId = String(route.params.id)

const { state, phase, loading, error, remainingSec, remainingRatio, refresh } = useGame(gameId)

const busy = ref(false)
const actionError = ref('')
const copied = ref(false)

const players = computed(() => state.value?.players ?? [])
const question = computed(() => state.value?.question ?? null)
const isLastQuestion = computed(
  () => !!state.value && state.value.index >= state.value.total - 1,
)

// 不是主持人卻開到控台網址時，導回玩家畫面
watch(
  () => state.value && !state.value.is_host,
  (notHost) => {
    if (notHost) router.replace({ name: 'play', params: { id: gameId } })
  },
)

async function act(action: 'start' | 'reveal' | 'next' | 'end') {
  busy.value = true
  actionError.value = ''
  try {
    await hostAction(gameId, action)
    await refresh()
  } catch (e: any) {
    actionError.value = e?.message ?? '操作失敗'
  } finally {
    busy.value = false
  }
}

async function endGame() {
  if (!confirm('確定要結束這場遊戲嗎？')) return
  await act('end')
}

async function copyPin() {
  if (!state.value) return
  try {
    await navigator.clipboard.writeText(state.value.pin)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    /* 瀏覽器不允許時就讓使用者自己看畫面上的號碼 */
  }
}
</script>

<template>
  <div v-if="loading" class="flex flex-col items-center gap-4 py-24">
    <div class="loader-ring"></div>
    <p class="section-subtitle">CONNECTING</p>
  </div>

  <div v-else-if="!state" class="card mx-auto max-w-md p-10 text-center">
    <p class="text-blossom-600">{{ error || '找不到這場遊戲' }}</p>
    <button class="btn btn-ghost mt-6" @click="router.push({ name: 'home' })">回首頁</button>
  </div>

  <div v-else class="space-y-8">
    <!-- ============ 等待玩家加入 ============ -->
    <template v-if="phase === 'lobby'">
      <div class="card animate-fade-up p-10 text-center sm:p-12">
        <p class="section-subtitle">GAME PIN</p>
        <p class="my-4 font-serif text-6xl tracking-[0.25em] text-blossom-600 sm:text-7xl">
          {{ state.pin }}
        </p>
        <button class="btn btn-ghost btn-sm" @click="copyPin">
          {{ copied ? '已複製' : '複製代碼' }}
        </button>
        <p class="mt-6 text-sm font-light text-ink-600">請大家在首頁輸入這組代碼加入遊戲</p>
      </div>

      <div class="card p-7">
        <div class="mb-5 flex items-baseline justify-between border-b border-blossom-200 pb-3">
          <h2 class="font-serif text-xl text-blossom-600">已加入 {{ state.player_count }} 人</h2>
          <span class="text-xs tracking-widest text-ink-400">
            共 {{ state.total }} 題 · 每題 {{ state.seconds }} 秒
          </span>
        </div>

        <div v-if="players.length === 0" class="animate-soft-pulse py-10 text-center text-ink-400">
          等待玩家加入…
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="p in players"
            :key="p.user_id"
            class="animate-fade-up rounded-full border border-blossom-300 bg-blossom-50 px-4 py-1.5 text-sm text-ink-800"
          >
            {{ p.nickname }}
          </span>
        </div>
      </div>

      <div class="flex flex-wrap justify-center gap-4">
        <button
          class="btn btn-primary"
          :disabled="busy || players.length === 0"
          @click="act('start')"
        >
          開始遊戲
        </button>
        <button class="btn btn-ghost" :disabled="busy" @click="endGame">結束遊戲</button>
      </div>
    </template>

    <!-- ============ 出題中 / 公布答案 ============ -->
    <template v-else-if="phase === 'question' || phase === 'reveal'">
      <div class="flex items-center justify-between text-xs tracking-widest text-ink-400">
        <span>QUESTION {{ state.index + 1 }} / {{ state.total }}</span>
        <span>已作答 {{ state.answer_count }} / {{ state.player_count }}</span>
      </div>

      <div class="card p-8 sm:p-10">
        <div class="flex items-center gap-6">
          <TimerRing
            v-if="phase === 'question'"
            :seconds="remainingSec"
            :ratio="remainingRatio"
            :size="96"
          />
          <h2 class="flex-1 font-serif text-2xl leading-snug text-ink-900 sm:text-3xl">
            {{ question?.text }}
          </h2>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <OptionTile
          v-for="(opt, i) in question?.options ?? []"
          :key="i"
          :index="i"
          :text="opt"
          :disabled="true"
          :revealed="phase === 'reveal'"
          :is-correct="phase === 'reveal' && state.correct_index === i"
          :count="phase === 'reveal' ? (state.stats?.[i] ?? 0) : null"
          large
        />
      </div>

      <div v-if="phase === 'reveal'" class="card p-7">
        <p class="section-subtitle mb-2 text-left">STANDINGS</p>
        <RankList :players="players" :limit="5" />
      </div>

      <p v-if="actionError" class="text-center text-sm text-blossom-600">{{ actionError }}</p>

      <div class="flex flex-wrap items-center justify-center gap-4">
        <button
          v-if="phase === 'question'"
          class="btn btn-ghost"
          :disabled="busy"
          @click="act('reveal')"
        >
          提前公布答案
        </button>
        <button v-else class="btn btn-primary" :disabled="busy" @click="act('next')">
          {{ isLastQuestion ? '看最終結果' : '下一題' }}
        </button>
        <button
          class="text-xs tracking-widest text-ink-400 transition-colors duration-300 hover:text-blossom-600"
          :disabled="busy"
          @click="endGame"
        >
          結束遊戲
        </button>
      </div>
    </template>

    <!-- ============ 結算 ============ -->
    <template v-else>
      <div class="card p-8 text-center sm:p-12">
        <p class="section-subtitle">FINAL RESULT</p>
        <h2 class="section-title">遊戲結束</h2>
      </div>

      <TopThreeChart :rows="players" eyebrow="FINAL PODIUM" title="本場前三名" />

      <div class="card p-5 sm:p-6">
        <p class="section-subtitle mb-2 text-left">FINAL RANKING</p>
        <RankList :players="players" />
      </div>

      <div class="flex justify-center gap-4">
        <button class="btn btn-primary" @click="router.push({ name: 'admin-games' })">再開一場</button>
        <button class="btn btn-ghost" @click="router.push({ name: 'leaderboard' })">
          總排行榜
        </button>
      </div>
    </template>
  </div>
</template>
