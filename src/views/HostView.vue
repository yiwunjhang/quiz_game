<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OptionTile from '../components/OptionTile.vue'
import Podium from '../components/Podium.vue'
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
  <div v-if="loading" class="py-24 text-center text-plum-400">連線中…</div>

  <div v-else-if="!state" class="glass mx-auto max-w-md p-8 text-center">
    <p class="text-blush-600">{{ error || '找不到這個房間' }}</p>
    <button class="btn btn-ghost mt-4" @click="router.push({ name: 'home' })">回首頁</button>
  </div>

  <div v-else class="space-y-6">
    <!-- ============ 等待玩家加入 ============ -->
    <template v-if="phase === 'lobby'">
      <div class="glass glass-strong p-8 text-center">
        <p class="text-sm font-semibold tracking-widest text-plum-500">房間代碼</p>
        <p class="my-2 text-6xl font-black tracking-[0.2em] text-plum-800 sm:text-7xl">
          {{ state.pin }}
        </p>
        <button class="btn btn-ghost btn-sm" @click="copyPin">
          {{ copied ? '已複製 ✓' : '📋 複製代碼' }}
        </button>
        <p class="mt-4 text-plum-500">請大家在首頁輸入這組代碼加入遊戲</p>
      </div>

      <div class="glass p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-extrabold text-plum-700">
            已加入 {{ state.player_count }} 人
          </h2>
          <span class="text-sm text-plum-400">共 {{ state.total }} 題 · 每題 {{ state.seconds }} 秒</span>
        </div>

        <div v-if="players.length === 0" class="py-8 text-center text-plum-400 animate-soft-pulse">
          等待玩家加入…
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <span
            v-for="p in players"
            :key="p.user_id"
            class="glass-soft animate-pop px-4 py-2 font-bold text-plum-700"
          >
            {{ p.nickname }}
          </span>
        </div>
      </div>

      <div class="flex flex-wrap justify-center gap-3">
        <button
          class="btn btn-primary"
          :disabled="busy || players.length === 0"
          @click="act('start')"
        >
          開始遊戲 🎉
        </button>
        <button class="btn btn-ghost" :disabled="busy" @click="endGame">解散房間</button>
      </div>
    </template>

    <!-- ============ 出題中 / 公布答案 ============ -->
    <template v-else-if="phase === 'question' || phase === 'reveal'">
      <div class="flex items-center justify-between gap-4">
        <span class="glass-soft px-4 py-2 font-bold text-plum-600">
          第 {{ state.index + 1 }} / {{ state.total }} 題
        </span>
        <span class="glass-soft px-4 py-2 font-bold text-plum-600">
          已作答 {{ state.answer_count }} / {{ state.player_count }}
        </span>
      </div>

      <div class="glass glass-strong p-6 sm:p-8">
        <div class="flex items-start gap-5">
          <TimerRing
            v-if="phase === 'question'"
            :seconds="remainingSec"
            :ratio="remainingRatio"
            :size="96"
          />
          <h2 class="flex-1 text-2xl font-black leading-snug text-plum-800 sm:text-3xl">
            {{ question?.text }}
          </h2>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
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

      <div v-if="phase === 'reveal'" class="glass p-6">
        <h3 class="mb-3 text-lg font-extrabold text-plum-700">目前戰況 🏅</h3>
        <RankList :players="players" :limit="5" />
      </div>

      <p v-if="actionError" class="text-center text-sm font-semibold text-blush-600">
        {{ actionError }}
      </p>

      <div class="flex flex-wrap justify-center gap-3">
        <button
          v-if="phase === 'question'"
          class="btn btn-ghost"
          :disabled="busy"
          @click="act('reveal')"
        >
          提前公布答案
        </button>
        <button v-else class="btn btn-primary" :disabled="busy" @click="act('next')">
          {{ isLastQuestion ? '看最終結果 🏆' : '下一題 →' }}
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="busy" @click="endGame">結束遊戲</button>
      </div>
    </template>

    <!-- ============ 結算 ============ -->
    <template v-else>
      <div class="glass glass-strong p-6 text-center sm:p-8">
        <h2 class="mb-6 text-3xl font-black text-plum-800">🎉 遊戲結束！</h2>
        <Podium :players="players" />
      </div>

      <div class="flex justify-center gap-3">
        <button class="btn btn-primary" @click="router.push({ name: 'home' })">
          再開一場 →
        </button>
        <button class="btn btn-ghost" @click="router.push({ name: 'leaderboard' })">
          總排行榜 🏆
        </button>
      </div>
    </template>
  </div>
</template>
