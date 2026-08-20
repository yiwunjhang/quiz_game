<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OptionTile from '../components/OptionTile.vue'
import Podium from '../components/Podium.vue'
import RankList from '../components/RankList.vue'
import TimerRing from '../components/TimerRing.vue'
import { submitLiveAnswer } from '../db/api'
import { useGame } from '../composables/useGame'
import { useSessionStore } from '../stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const gameId = String(route.params.id)

const { state, phase, loading, error, remainingSec, remainingRatio, refresh } = useGame(gameId)

const meId = computed(() => session.currentUser?.id ?? null)
const question = computed(() => state.value?.question ?? null)
const players = computed(() => state.value?.players ?? [])

/** 送出後先在本地標記，不必等伺服器回應畫面就有反應 */
const pending = ref<number | null>(null)
const submitError = ref('')

const myPick = computed(() => state.value?.my_answer?.selected_index ?? pending.value)
const answered = computed(() => myPick.value != null)

const myRank = computed(() => {
  const i = players.value.findIndex((p) => p.user_id === meId.value)
  return i < 0 ? null : i + 1
})

const myAnswer = computed(() => state.value?.my_answer ?? null)

// 換題時清掉上一題的暫存
watch(
  () => state.value?.index,
  () => {
    pending.value = null
    submitError.value = ''
  },
)

// 主持人用房間代碼進來時，直接送到控台
watch(
  () => state.value?.is_host,
  (isHost) => {
    if (isHost) router.replace({ name: 'host', params: { id: gameId } })
  },
)

async function choose(i: number) {
  if (answered.value || phase.value !== 'question') return
  pending.value = i
  submitError.value = ''
  try {
    await submitLiveAnswer(gameId, i)
    await refresh()
  } catch (e: any) {
    pending.value = null
    submitError.value = e?.message ?? '送出失敗'
  }
}
</script>

<template>
  <div v-if="loading" class="flex flex-col items-center gap-4 py-24">
    <div class="loader-ring"></div>
    <p class="section-subtitle">CONNECTING</p>
  </div>

  <div v-else-if="!state" class="card mx-auto max-w-md p-10 text-center">
    <p class="text-blossom-600">{{ error || '找不到這個房間' }}</p>
    <button class="btn btn-ghost mt-6" @click="router.push({ name: 'home' })">回首頁</button>
  </div>

  <div v-else class="mx-auto max-w-2xl space-y-6">
    <!-- ============ 等待開始 ============ -->
    <template v-if="phase === 'lobby'">
      <div class="card animate-fade-up p-10 text-center">
        <p class="section-subtitle">WELCOME</p>
        <h1 class="mt-3 font-serif text-2xl text-blossom-600">
          {{ session.currentUser?.nickname }}，你已經入座
        </h1>
        <p class="mt-3 animate-soft-pulse text-sm font-light text-ink-600">
          等待主持人開始遊戲…
        </p>
        <p class="mt-6 text-xs tracking-widest text-ink-400">
          房間代碼 {{ state.pin }} · 目前 {{ state.player_count }} 人
        </p>
      </div>

      <div class="card p-6">
        <p class="section-subtitle mb-4 text-left">PLAYERS</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="p in players"
            :key="p.user_id"
            class="animate-fade-up rounded-full border px-4 py-1.5 text-sm"
            :class="
              p.user_id === meId
                ? 'border-blossom-500 bg-blossom-100 text-blossom-600'
                : 'border-blossom-300 bg-blossom-50 text-ink-800'
            "
          >
            {{ p.nickname }}
          </span>
        </div>
      </div>
    </template>

    <!-- ============ 作答中 ============ -->
    <template v-else-if="phase === 'question'">
      <div class="flex items-center justify-between text-xs tracking-widest text-ink-400">
        <span>QUESTION {{ state.index + 1 }} / {{ state.total }}</span>
        <span>SCORE {{ state.my_score ?? 0 }}</span>
      </div>

      <div class="card flex items-center gap-5 p-7">
        <TimerRing :seconds="remainingSec" :ratio="remainingRatio" :size="76" />
        <h2 class="flex-1 font-serif text-xl leading-snug text-ink-900 sm:text-2xl">
          {{ question?.text }}
        </h2>
      </div>

      <div v-if="answered" class="card animate-fade-up p-10 text-center">
        <p class="section-subtitle">ANSWER SUBMITTED</p>
        <p class="mt-3 font-serif text-xl text-blossom-600">已送出答案</p>
        <p class="mt-2 text-sm font-light text-ink-600">
          等待其他人作答（{{ state.answer_count }} / {{ state.player_count }}）
        </p>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2">
        <OptionTile
          v-for="(opt, i) in question?.options ?? []"
          :key="i"
          :index="i"
          :text="opt"
          :picked="myPick === i"
          @click="choose(i)"
        />
      </div>

      <p v-if="submitError" class="text-center text-sm text-blossom-600">{{ submitError }}</p>
    </template>

    <!-- ============ 公布答案 ============ -->
    <template v-else-if="phase === 'reveal'">
      <div class="card animate-fade-up p-8 text-center">
        <template v-if="!myAnswer">
          <p class="section-subtitle">TIME UP</p>
          <p class="mt-3 font-serif text-xl text-ink-600">時間到，這題沒作答</p>
        </template>
        <template v-else-if="myAnswer.is_correct">
          <p class="section-subtitle" style="color: var(--color-sage-500)">CORRECT</p>
          <p class="mt-3 font-serif text-3xl text-sage-600">答對了</p>
          <p class="mt-2 font-serif text-xl text-blossom-600">+{{ myAnswer.points }}</p>
        </template>
        <template v-else>
          <p class="section-subtitle">INCORRECT</p>
          <p class="mt-3 font-serif text-3xl text-blossom-600">答錯了</p>
          <p class="mt-2 text-sm font-light text-ink-600">下一題再加油</p>
        </template>

        <p class="mt-6 text-xs tracking-widest text-ink-400">
          總分 {{ state.my_score ?? 0 }}<span v-if="myRank"> · 第 {{ myRank }} 名</span>
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <OptionTile
          v-for="(opt, i) in question?.options ?? []"
          :key="i"
          :index="i"
          :text="opt"
          :disabled="true"
          :revealed="true"
          :picked="myPick === i"
          :is-correct="state.correct_index === i"
          :count="state.stats?.[i] ?? 0"
        />
      </div>

      <div class="card p-6">
        <p class="section-subtitle mb-2 text-left">STANDINGS</p>
        <RankList :players="players" :me-id="meId" :limit="5" />
      </div>

      <p class="animate-soft-pulse text-center text-xs tracking-widest text-ink-400">
        等待主持人進入下一題…
      </p>
    </template>

    <!-- ============ 結算 ============ -->
    <template v-else>
      <div class="card p-8 text-center sm:p-10">
        <p class="section-subtitle">FINAL RESULT</p>
        <h2 class="section-title">遊戲結束</h2>
        <p class="mb-10 text-sm font-light text-ink-600">
          你拿到 {{ state.my_score ?? 0 }} 分<span v-if="myRank">，排名第 {{ myRank }}</span>
        </p>
        <Podium :players="players" :me-id="meId" />
      </div>

      <div class="flex justify-center gap-4">
        <button class="btn btn-primary" @click="router.push({ name: 'home' })">回首頁</button>
        <button class="btn btn-ghost" @click="router.push({ name: 'leaderboard' })">
          總排行榜
        </button>
      </div>
    </template>
  </div>
</template>
