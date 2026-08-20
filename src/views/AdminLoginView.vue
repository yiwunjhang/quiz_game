<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminLogin } from '../db/api'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const nickname = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const user = await adminLogin(nickname.value, password.value)
    session.setUser(user)
    router.push({ name: 'admin-questions' })
  } catch (e: any) {
    error.value = e?.message ?? '登入失敗'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto">
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl">
      <h1 class="text-xl font-bold mb-1">⚙️ 後台登入</h1>
      <p class="text-sm text-slate-400 mb-4">以具備管理權限的帳號登入以管理題庫</p>
      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-sm mb-1 text-slate-300">管理者暱稱</label>
          <input
            v-model="nickname"
            type="text"
            placeholder="管理帳號暱稱"
            class="w-full rounded-lg bg-slate-800/80 border border-white/10 px-3 py-2 outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-slate-300">密碼</label>
          <input
            v-model="password"
            type="password"
            placeholder="密碼"
            class="w-full rounded-lg bg-slate-800/80 border border-white/10 px-3 py-2 outline-none focus:border-indigo-400"
          />
        </div>
        <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 font-semibold py-2.5 transition"
        >
          {{ loading ? '登入中…' : '登入' }}
        </button>
      </form>
      <p class="text-xs text-slate-500 mt-4">
        管理權限需在 Supabase 將該帳號 <code class="text-slate-300">profiles.is_admin</code>
        設為 true，詳見 README。
      </p>
    </div>
  </div>
</template>
