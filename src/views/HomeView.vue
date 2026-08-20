<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import HeroArt from '../components/HeroArt.vue'
import { getMyActiveGame, joinGame, registerOrLogin } from '../db/api'
import { useSessionStore } from '../stores/session'
import { supabaseConfigured } from '../supabase'

const router = useRouter()
const session = useSessionStore()

/** 開場動畫：點一下才進到加入表單，手機上第一眼只看到插圖 */
const entered = ref(false)

const pin = ref('')
const nickname = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

/** 進行中的遊戲（重新整理或不小心離開時可回到現場） */
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
    if (pin.value.trim().length < 4) {
      throw new Error('請輸入主持人畫面上的 6 位數遊戲代碼')
    }
    await ensureLogin()
    goToGame(await joinGame(pin.value), false)
  } catch (e: any) {
    error.value = e?.message ?? '發生錯誤'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Transition name="splash" mode="out-in">
    <!-- ============ 開場：點任一處進入 ============ -->
    <div v-if="!entered" key="splash" class="splash" @click="entered = true">
      <HeroArt class="splash-art" />
      <p class="section-subtitle animate-fade-up" style="animation-delay: 500ms">
        LIVE QUIZ PARTY
      </p>
      <h1
        class="animate-fade-up font-serif text-3xl text-blossom-600 sm:text-4xl"
        style="animation-delay: 600ms"
      >
        問答派對
      </h1>

      <!-- 中途重新整理的人不用先點開場，直接從這裡回現場 -->
      <button
        v-if="active"
        type="button"
        class="btn btn-primary animate-fade-up mt-6"
        @click.stop="goToGame(active.gameId, active.isHost)"
      >
        回到遊戲（代碼 {{ active.pin }}）
      </button>

      <button
        type="button"
        class="splash-hint animate-fade-up"
        :style="{ animationDelay: active ? '150ms' : '850ms' }"
        @click.stop="entered = true"
      >
        {{ active ? '加入其他遊戲' : '點一下開始' }}
      </button>
    </div>

    <!-- ============ 主畫面 ============ -->
    <div v-else key="main" class="grid items-center gap-10 md:grid-cols-2 md:gap-14">
      <!-- 加入卡：手機上擺第一個，一進來就能輸入代碼 -->
      <div class="card animate-fade-up order-1 p-6 sm:p-8 md:order-2">
        <div
          v-if="!supabaseConfigured"
          class="mb-5 rounded-2xl border border-sand-300 bg-sand-100 px-4 py-3 text-sm text-ink-800"
        >
          尚未設定 Supabase 連線資訊，請參考 README 設定環境變數。
        </div>

        <div
          v-if="active"
          class="mb-6 rounded-2xl border border-blossom-300 bg-blossom-50 px-4 py-3 text-sm"
        >
          <p class="text-ink-800">你有一場進行中的遊戲（代碼 {{ active.pin }}）</p>
          <button
            class="btn btn-primary btn-sm mt-3"
            @click="goToGame(active.gameId, active.isHost)"
          >
            回到遊戲
          </button>
        </div>

        <div class="mb-6 border-b border-blossom-200 pb-3 text-center">
          <p class="section-subtitle">JOIN</p>
          <h2 class="font-serif text-xl text-blossom-600">加入遊戲</h2>
        </div>

        <form class="space-y-4 sm:space-y-5" @submit.prevent="submit">
          <div>
            <label class="mb-2 block text-xs tracking-widest text-ink-400">遊戲代碼</label>
            <input
              v-model="pin"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              maxlength="6"
              placeholder="000000"
              class="field field-pin"
            />
          </div>

          <div>
            <label class="mb-2 block text-xs tracking-widest text-ink-400">暱稱</label>
            <input
              v-model="nickname"
              type="text"
              autocomplete="username"
              maxlength="20"
              placeholder="例如：小花"
              class="field"
            />
          </div>

          <div>
            <label class="mb-2 block text-xs tracking-widest text-ink-400">密碼</label>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="第一次使用即為註冊（至少 6 碼）"
              class="field"
            />
          </div>

          <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>

          <button type="submit" :disabled="loading" class="btn btn-primary w-full">
            {{ loading ? '處理中…' : '加入遊戲' }}
          </button>
        </form>

        <p class="mt-5 text-center text-xs font-light text-ink-400">
          要主持遊戲嗎？請到
          <RouterLink to="/admin" class="text-blossom-500 hover:text-blossom-600">後台</RouterLink>
          登入後建立。
        </p>
      </div>

      <!-- 介紹：手機上擺在卡片後面；插圖只在桌機出現（手機剛剛開場已經看過） -->
      <div class="animate-fade-up order-2 space-y-5 md:order-1 md:space-y-6">
        <p class="section-subtitle text-left">LIVE QUIZ PARTY</p>
        <h1 class="font-serif text-3xl leading-snug text-blossom-600 sm:text-4xl md:text-5xl">
          一起玩<br />即時問答派對
        </h1>

        <HeroArt class="hidden max-w-sm md:block" />

        <p class="max-w-md text-sm font-light leading-relaxed text-ink-600 sm:text-base">
          輸入主持人畫面上的代碼就能加入，同一時間看同一題、一起搶答。
          答得越快分數越高，每題結束立刻公布戰況，最後站上頒獎台的會是誰呢？
        </p>
        <ul class="space-y-2.5 text-sm font-light text-ink-600">
          <li class="flex gap-3">
            <span class="text-blossom-500">—</span> 多人同時上線，所有裝置畫面同步
          </li>
          <li class="flex gap-3">
            <span class="text-blossom-500">—</span> 依作答速度計分，最高 1000 分／題
          </li>
          <li class="flex gap-3">
            <span class="text-blossom-500">—</span> 答案由伺服器保管，公布前誰都拿不到
          </li>
        </ul>
      </div>
    </div>
  </Transition>
</template>
