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
  <div class="mx-auto max-w-sm">
    <div class="card animate-fade-up p-8">
      <div class="mb-7 text-center">
        <p class="section-subtitle">ADMIN</p>
        <h1 class="font-serif text-2xl text-blossom-600">後台登入</h1>
        <p class="mt-1 text-sm font-light text-ink-600">以具備管理權限的帳號登入以管理題庫</p>
      </div>

      <form class="space-y-5" @submit.prevent="submit">
        <div>
          <label class="mb-2 block text-xs tracking-widest text-ink-400">管理者暱稱</label>
          <input v-model="nickname" type="text" placeholder="管理帳號暱稱" class="field" />
        </div>
        <div>
          <label class="mb-2 block text-xs tracking-widest text-ink-400">密碼</label>
          <input v-model="password" type="password" placeholder="密碼" class="field" />
        </div>

        <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>

        <button type="submit" :disabled="loading" class="btn btn-primary w-full">
          {{ loading ? '登入中…' : '登入' }}
        </button>
      </form>

      <p class="mt-6 text-xs font-light leading-relaxed text-ink-400">
        管理權限需在 Supabase 將該帳號
        <code class="rounded bg-blossom-100 px-1 text-blossom-600">profiles.is_admin</code>
        設為 true，詳見 README。
      </p>
    </div>
  </div>
</template>
