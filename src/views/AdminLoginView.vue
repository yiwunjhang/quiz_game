<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminLogin, applyForHost, logout as apiLogout, registerOrLogin } from '../db/api'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const mode = ref<'login' | 'apply'>('login')
const nickname = ref('')
const password = ref('')
const reason = ref('')
const error = ref('')
const message = ref('')
const loading = ref(false)

function switchTo(m: 'login' | 'apply') {
  mode.value = m
  error.value = ''
  message.value = ''
}

async function submitLogin() {
  error.value = ''
  message.value = ''
  loading.value = true
  try {
    const user = await adminLogin(nickname.value, password.value)
    session.setUser(user)
    router.push({ name: 'admin-games' })
  } catch (e: any) {
    error.value = e?.message ?? '登入失敗'
  } finally {
    loading.value = false
  }
}

/**
 * 申請成為主持人。
 * 這裡只會建立（或登入）一般玩家帳號並送出申請，不會給任何權限；
 * is_admin 只有現任主持人在後台核准後才會開通。
 */
async function submitApply() {
  error.value = ''
  message.value = ''
  loading.value = true
  try {
    const user = await registerOrLogin(nickname.value, password.value)
    if (user.isAdmin) {
      session.setUser(user)
      router.push({ name: 'admin-games' })
      return
    }
    const status = await applyForHost(reason.value)
    await apiLogout()
    message.value =
      status === 'pending'
        ? `申請已送出，帳號「${user.nickname}」需等現任主持人核准後才能登入後台。`
        : '你已經有主持人權限了，請改用登入。'
  } catch (e: any) {
    error.value = e?.message ?? '申請失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm">
    <div class="card animate-fade-up p-6 sm:p-8">
      <div class="mb-6 text-center">
        <p class="section-subtitle">ADMIN</p>
        <h1 class="font-serif text-2xl text-blossom-600">主持人後台</h1>
      </div>

      <div class="mb-6 flex justify-center gap-8 border-b border-blossom-200 pb-3">
        <button
          v-for="m in (['login', 'apply'] as const)"
          :key="m"
          type="button"
          class="nav-link pb-1 text-sm tracking-widest transition-colors duration-300"
          :class="mode === m ? 'is-active text-blossom-600' : 'text-ink-400 hover:text-blossom-500'"
          @click="switchTo(m)"
        >
          {{ m === 'login' ? '登入' : '申請權限' }}
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="mode === 'login' ? submitLogin() : submitApply()">
        <div>
          <label class="mb-2 block text-xs tracking-widest text-ink-400">暱稱</label>
          <input
            v-model="nickname"
            type="text"
            autocomplete="username"
            placeholder="帳號暱稱"
            class="field"
          />
        </div>
        <div>
          <label class="mb-2 block text-xs tracking-widest text-ink-400">密碼</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="密碼"
            class="field"
          />
        </div>

        <div v-if="mode === 'apply'">
          <label class="mb-2 block text-xs tracking-widest text-ink-400">申請說明</label>
          <textarea
            v-model="reason"
            rows="3"
            maxlength="500"
            placeholder="你是誰、想用來辦什麼活動，方便現任主持人判斷"
            class="field"
          ></textarea>
        </div>

        <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>
        <p v-if="message" class="text-sm text-sage-600">{{ message }}</p>

        <button type="submit" :disabled="loading" class="btn btn-primary w-full">
          <template v-if="loading">處理中…</template>
          <template v-else>{{ mode === 'login' ? '登入' : '送出申請' }}</template>
        </button>
      </form>

      <p v-if="mode === 'apply'" class="mt-5 text-xs font-light leading-relaxed text-ink-400">
        送出後帳號只是一般玩家，需由現任主持人在後台核准才會取得建立遊戲與管理題庫的權限。
      </p>
    </div>
  </div>
</template>
