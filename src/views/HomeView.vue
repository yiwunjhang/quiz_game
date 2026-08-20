<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { registerOrLogin, getQuestions } from '../db/database'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const nickname = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const questionCount = getQuestions().length

async function start() {
  error.value = ''
  loading.value = true
  try {
    const user = await registerOrLogin(nickname.value, password.value)
    session.login(user)
    router.push({ name: 'quiz' })
  } catch (e: any) {
    error.value = e?.message ?? '發生錯誤'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="grid gap-8 md:grid-cols-2 items-center">
    <div class="space-y-4">
      <h1 class="text-3xl sm:text-4xl font-extrabold leading-tight">
        來一場<span class="text-indigo-400">問答挑戰</span>吧！
      </h1>
      <p class="text-slate-300">
        輸入你的暱稱與密碼即可加入。作答完成後系統會計算你答對的題數，
        看看誰能登上排行榜第一名 🏆
      </p>
      <ul class="text-sm text-slate-400 space-y-1">
        <li>🎯 目前題庫共 <span class="text-indigo-300 font-semibold">{{ questionCount }}</span> 題</li>
        <li>🔒 暱稱首次登入即註冊，之後需輸入相同密碼</li>
        <li>💾 資料儲存在你的瀏覽器（SQLite）</li>
      </ul>
    </div>

    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl">
      <h2 class="text-lg font-bold mb-4">加入遊戲</h2>
      <form class="space-y-4" @submit.prevent="start">
        <div>
          <label class="block text-sm mb-1 text-slate-300">暱稱</label>
          <input
            v-model="nickname"
            type="text"
            maxlength="20"
            placeholder="例如：小明"
            class="w-full rounded-lg bg-slate-800/80 border border-white/10 px-3 py-2 outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-slate-300">密碼</label>
          <input
            v-model="password"
            type="password"
            placeholder="設定你的密碼"
            class="w-full rounded-lg bg-slate-800/80 border border-white/10 px-3 py-2 outline-none focus:border-indigo-400"
          />
        </div>

        <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 font-semibold py-2.5 transition"
        >
          {{ loading ? '處理中…' : '開始挑戰 →' }}
        </button>
      </form>
    </div>
  </div>
</template>
