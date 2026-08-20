<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const password = ref('')
const error = ref('')

function submit() {
  if (session.loginAdmin(password.value)) {
    router.push({ name: 'admin-questions' })
  } else {
    error.value = '密碼錯誤'
  }
}
</script>

<template>
  <div class="max-w-sm mx-auto">
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl">
      <h1 class="text-xl font-bold mb-1">⚙️ 後台登入</h1>
      <p class="text-sm text-slate-400 mb-4">輸入管理密碼以管理題庫</p>
      <form class="space-y-4" @submit.prevent="submit">
        <input
          v-model="password"
          type="password"
          placeholder="管理密碼"
          class="w-full rounded-lg bg-slate-800/80 border border-white/10 px-3 py-2 outline-none focus:border-indigo-400"
        />
        <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
        <button
          type="submit"
          class="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold py-2.5 transition"
        >
          登入
        </button>
      </form>
      <p class="text-xs text-slate-500 mt-4">
        預設密碼為 <code class="text-slate-300">admin123</code>，請於
        <code class="text-slate-300">src/stores/session.ts</code> 中修改。
      </p>
    </div>
  </div>
</template>
