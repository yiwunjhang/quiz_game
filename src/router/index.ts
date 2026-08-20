import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '../stores/session'

// 使用 hash 模式，GitHub Pages 重新整理不會 404
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    {
      // 主持人控台（投影／大螢幕）
      path: '/host/:id',
      name: 'host',
      component: () => import('../views/HostView.vue'),
      meta: { requiresUser: true },
    },
    {
      // 玩家作答畫面
      path: '/play/:id',
      name: 'play',
      component: () => import('../views/PlayView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/leaderboard',
      name: 'leaderboard',
      component: () => import('../views/LeaderboardView.vue'),
    },
    {
      path: '/admin',
      name: 'admin-login',
      component: () => import('../views/AdminLoginView.vue'),
    },
    {
      // 主持人在後台建立遊戲
      path: '/admin/games',
      name: 'admin-games',
      component: () => import('../views/AdminGamesView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/questions',
      name: 'admin-questions',
      component: () => import('../views/AdminQuestionsView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      // 審核他人的主持人權限申請
      path: '/admin/applications',
      name: 'admin-applications',
      component: () => import('../views/AdminApplicationsView.vue'),
      meta: { requiresAdmin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  // 直接開啟遊戲網址時，先等登入狀態還原完成再判斷
  if (!session.ready) await session.restore()

  if (to.meta.requiresUser && !session.currentUser) {
    return { name: 'home' }
  }
  if (to.meta.requiresAdmin && !session.isAdmin) {
    return { name: 'admin-login' }
  }
  // 已登入且具管理權限者，造訪後台登入頁時直接進主持頁
  if (to.name === 'admin-login' && session.isAdmin) {
    return { name: 'admin-games' }
  }
  return true
})

export default router
