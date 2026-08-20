<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createGame, getMyActiveGame, joinGame, registerOrLogin } from '../db/api'
import { useSessionStore } from '../stores/session'
import { supabaseConfigured } from '../supabase'

const router = useRouter()
const session = useSessionStore()

const mode = ref<'join' | 'host'>('join')
const pin = ref('')
const nickname = ref('')
const password = ref('')
const seconds = ref(20)
const questionCount = ref(10)
const error = ref('')
const loading = ref(false)

/** 進行中的房間（重新整理或不小心離開時可回到現場） */
const active = ref<{ gameId: string; pin: string; isHost: boolean } | null>(null)

async function checkActive() {
  if (!session.currentUser) {
    active.value = null
    return
  }
  nickname.value ||= session.currentUser.nickname
  try {
    active.value = await getMyActiveGame()
  } catch {
    active.value = null
  }
}

watch(() => session.ready && session.currentUser?.id, checkActive, { immediate: true })

function goToGame(gameId: string, isHost: boolean) {
  router.push({ name: isHost ? 'host' : 'play', params: { id: gameId } })
}

async function ensureLogin() {
  // 已登入且暱稱沒改就沿用現有登入狀態
  if (session.currentUser && session.currentUser.nickname === nickname.value.trim()) return
  const user = await registerOrLogin(nickname.value, password.value)
  session.setUser(user)
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'join' && pin.value.trim().length < 4) {
      throw new Error('請輸入主持人畫面上的 6 位數房間代碼')
    }
    await ensureLogin()

    if (mode.value === 'join') {
      const gameId = await joinGame(pin.value)
      goToGame(gameId, false)
    } else {
      const { gameId } = await createGame(seconds.value, questionCount.value)
      goToGame(gameId, true)
    }
  } catch (e: any) {
    error.value = e?.message ?? '發生錯誤'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="grid items-center gap-8 md:grid-cols-2">
    <!-- 左側介紹 -->
    <div class="space-y-5">
      <h1 class="text-4xl font-black leading-tight text-plum-800 sm:text-5xl">
        一起玩
        <span
          class="bg-gradient-to-r from-blush-500 to-lilac-500 bg-clip-text text-transparent"
          >即時問答派對</span
        >
        🎀
      </h1>
      <p class="text-plum-600">
        主持人開房間、大家用房間代碼加入，同一時間看同一題、一起搶答。
        答得越快分數越高，每題結束立刻公布戰況，最後站上頒獎台的會是誰呢？
      </p>
      <ul class="space-y-2 text-sm text-plum-500">
        <li class="glass-soft px-4 py-2">👥 多人同時上線，所有裝置畫面同步</li>
        <li class="glass-soft px-4 py-2">⚡ 依作答速度計分，最高 1000 分／題</li>
        <li class="glass-soft px-4 py-2">🛡️ 答案由伺服器保管，公布前誰都拿不到</li>
      </ul>
    </div>

    <!-- 右側加入卡 -->
    <div class="glass glass-strong p-6 sm:p-7">
      <div
        v-if="!supabaseConfigured"
        class="mb-4 rounded-2xl border border-peach-400/60 bg-peach-200/60 px-4 py-3 text-sm text-plum-700"
      >
        ⚠️ 尚未設定 Supabase 連線資訊，請參考 README 設定環境變數。
      </div>

      <div
        v-if="active"
        class="mb-5 rounded-2xl border border-lilac-300/70 bg-lilac-100/70 px-4 py-3 text-sm"
      >
        <p class="font-bold text-plum-700">
          你有一場進行中的遊戲（代碼 {{ active.pin }}）
        </p>
        <button
          class="btn btn-primary btn-sm mt-2"
          @click="goToGame(active.gameId, active.isHost)"
        >
          回到遊戲 →
        </button>
      </div>

      <!-- 模式切換 -->
      <div class="mb-5 flex gap-1 rounded-full bg-white/50 p-1">
        <button
          v-for="m in (['join', 'host'] as const)"
          :key="m"
          type="button"
          class="flex-1 rounded-full py-2 text-sm font-bold transition"
          :class="
            mode === m
              ? 'bg-gradient-to-r from-blush-400 to-lilac-400 text-white shadow-md'
              : 'text-plum-500 hover:bg-white/60'
          "
          @click="mode = m"
        >
          {{ m === 'join' ? '🎮 加入遊戲' : '🎤 我要開房間' }}
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <div v-if="mode === 'join'">
          <label class="mb-1 block text-sm font-semibold text-plum-600">房間代碼</label>
          <input
            v-model="pin"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            class="field field-pin"
          />
        </div>

        <template v-else>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm font-semibold text-plum-600">題數</label>
              <input v-model.number="questionCount" type="number" min="1" max="50" class="field" />
            </div>
            <div>
              <label class="mb-1 block text-sm font-semibold text-plum-600">每題秒數</label>
              <input v-model.number="seconds" type="number" min="5" max="120" class="field" />
            </div>
          </div>
        </template>

        <div>
          <label class="mb-1 block text-sm font-semibold text-plum-600">暱稱</label>
          <input v-model="nickname" type="text" maxlength="20" placeholder="例如：小花" class="field" />
        </div>

        <div>
          <label class="mb-1 block text-sm font-semibold text-plum-600">密碼</label>
          <input
            v-model="password"
            type="password"
            placeholder="第一次使用即為註冊（至少 6 碼）"
            class="field"
          />
        </div>

        <p v-if="error" class="text-sm font-semibold text-blush-600">{{ error }}</p>

        <button type="submit" :disabled="loading" class="btn btn-primary w-full">
          {{
            loading ? '處理中…' : mode === 'join' ? '加入房間 →' : '建立房間 →'
          }}
        </button>
      </form>
    </div>
  </div>
</template>
