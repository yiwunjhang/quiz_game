import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getCurrentUser, logout as apiLogout, type AppUser } from '../db/api'

export const useSessionStore = defineStore('session', () => {
  const currentUser = ref<AppUser | null>(null)
  const ready = ref(false)

  const isAdmin = computed(() => currentUser.value?.isAdmin ?? false)

  /** 從 Supabase 還原登入狀態，App 啟動時呼叫一次 */
  async function restore() {
    try {
      currentUser.value = await getCurrentUser()
    } catch {
      currentUser.value = null
    } finally {
      ready.value = true
    }
  }

  function setUser(user: AppUser) {
    currentUser.value = user
  }

  async function logout() {
    await apiLogout()
    currentUser.value = null
  }

  return { currentUser, isAdmin, ready, restore, setUser, logout }
})
