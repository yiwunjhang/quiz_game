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
  <div v-if="loading" class="py-24 text-center text-plum-400">連線中…</div>

  <div v-else-if="!state" class="glass mx-auto max-w-md p-8 text-center">
    <p class="text-blush-600">{{ error || '找不到這個房間' }}</p>
    <button class="btn btn-ghost mt-4" @click="router.push({ name: 'home' })">回首頁</button>
  </div>

  <div v-else class="mx-auto max-w-2xl space-y-5">
    <!-- ============ 等待開始 ============ -->
    <template v-if="phase === 'lobby'">
      <div class="glass glass-strong p-8 text-center">
        <p class="text-5xl animate-bob">🌸</p>
        <h1 class="mt-4 text-2xl font-black text-plum-800">
          {{ session.currentUser?.nickname }}，你已經入座！
        </h1>
        <p class="mt-2 text-plum-500 animate-soft-pulse">等待主持人開始遊戲…</p>
        <p class="mt-4 text-sm text-plum-400">
          房間代碼 <span class="font-bold tracking-widest text-plum-600">{{ state.pin }}</span>
          · 目前 {{ state.player_count }} 人
        </p>
      </div>

      <div class="glass p-5">
        <h2 class="mb-3 text-sm font-extrabold text-plum-600">房間裡的人</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="p in players"
            :key="p.user_id"
            class="glass-soft animate-pop px-3 py-1.5 text-sm font-bold text-plum-700"
            :class="p.user_id === meId ? 'ring-2 ring-lilac-400/80' : ''"
          >
            {{ p.nickname }}
          </span>
        </div>
      </div>
    </template>

    <!-- ============ 作答中 ============ -->
    <template v-else-if="phase === 'question'">
      <div class="flex items-center justify-between gap-3">
        <span class="glass-soft px-4 py-2 text-sm font-bold text-plum-600">
          第 {{ state.index + 1 }} / {{ state.total }} 題
        </span>
        <span class="glass-soft px-4 py-2 text-sm font-bold text-plum-600">
          我的分數 {{ state.my_score ?? 0 }}
        </span>
      </div>

      <div class="glass glass-strong flex items-start gap-4 p-6">
        <TimerRing :seconds="remainingSec" :ratio="remainingRatio" :size="76" />
        <h2 class="flex-1 text-xl font-black leading-snug text-plum-800 sm:text-2xl">
          {{ question?.text }}
        </h2>
      </div>

      <div v-if="answered" class="glass p-8 text-center animate-pop">
        <p class="text-4xl animate-bob">💫</p>
        <p class="mt-3 text-lg font-extrabold text-plum-700">已送出答案！</p>
        <p class="mt-1 text-sm text-plum-500">
          等待其他人作答（{{ state.answer_count }} / {{ state.player_count }}）
        </p>
      </div>

      <div v-else class="grid gap-3 sm:grid-cols-2">
        <OptionTile
          v-for="(opt, i) in question?.options ?? []"
          :key="i"
          :index="i"
          :text="opt"
          :picked="myPick === i"
          @click="choose(i)"
        />
      </div>

      <p v-if="submitError" class="text-center text-sm font-semibold text-blush-600">
        {{ submitError }}
      </p>
    </template>

    <!-- ============ 公布答案 ============ -->
    <template v-else-if="phase === 'reveal'">
      <div
        class="glass glass-strong p-7 text-center animate-pop"
        :class="myAnswer?.is_correct ? 'ring-2 ring-mint-400/70' : ''"
      >
        <template v-if="!myAnswer">
          <p class="text-4xl">⏰</p>
          <p class="mt-3 text-xl font-black text-plum-700">時間到，這題沒作答</p>
        </template>
        <template v-else-if="myAnswer.is_correct">
          <p class="text-5xl animate-bob">🎊</p>
          <p class="mt-3 text-2xl font-black text-mint-500">答對了！</p>
          <p class="mt-1 text-lg font-extrabold text-blush-600">+{{ myAnswer.points }} 分</p>
        </template>
        <template v-else>
          <p class="text-5xl">🥺</p>
          <p class="mt-3 text-2xl font-black text-blush-600">答錯了</p>
          <p class="mt-1 text-sm text-plum-500">下一題再加油！</p>
        </template>

        <p class="mt-4 text-sm text-plum-500">
          目前總分 <span class="font-extrabold text-plum-700">{{ state.my_score ?? 0 }}</span>
          <span v-if="myRank"> · 第 {{ myRank }} 名</span>
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
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

      <div class="glass p-5">
        <h3 class="mb-3 text-sm font-extrabold text-plum-600">目前戰況 🏅</h3>
        <RankList :players="players" :me-id="meId" :limit="5" />
      </div>

      <p class="text-center text-sm text-plum-400 animate-soft-pulse">等待主持人進入下一題…</p>
    </template>

    <!-- ============ 結算 ============ -->
    <template v-else>
      <div class="glass glass-strong p-6 text-center sm:p-8">
        <h2 class="mb-1 text-3xl font-black text-plum-800">🎉 遊戲結束！</h2>
        <p class="mb-6 text-plum-500">
          你拿到 <span class="font-extrabold text-blush-600">{{ state.my_score ?? 0 }}</span> 分
          <span v-if="myRank">，排名第 {{ myRank }}</span>
        </p>
        <Podium :players="players" :me-id="meId" />
      </div>

      <div class="flex justify-center gap-3">
        <button class="btn btn-primary" @click="router.push({ name: 'home' })">回首頁</button>
        <button class="btn btn-ghost" @click="router.push({ name: 'leaderboard' })">
          總排行榜 🏆
        </button>
      </div>
    </template>
  </div>
</template>
