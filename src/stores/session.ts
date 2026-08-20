import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User } from '../db/database'

// 後台管理密碼。正式使用請務必修改此值。
export const ADMIN_PASSWORD = 'admin123'

const USER_KEY = 'quiz-game-current-user'

export const useSessionStore = defineStore('session', () => {
  // 從 sessionStorage 還原目前登入者，重新整理不會登出
  const stored = sessionStorage.getItem(USER_KEY)
  const currentUser = ref<User | null>(stored ? JSON.parse(stored) : null)
  const isAdmin = ref<boolean>(sessionStorage.getItem('quiz-game-admin') === '1')

  function login(user: User) {
    currentUser.value = user
    sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  }

  function logout() {
    currentUser.value = null
    sessionStorage.removeItem(USER_KEY)
  }

  function loginAdmin(password: string): boolean {
    if (password === ADMIN_PASSWORD) {
      isAdmin.value = true
      sessionStorage.setItem('quiz-game-admin', '1')
      return true
    }
    return false
  }

  function logoutAdmin() {
    isAdmin.value = false
    sessionStorage.removeItem('quiz-game-admin')
  }

  return { currentUser, isAdmin, login, logout, loginAdmin, logoutAdmin }
})
