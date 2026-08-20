import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '../stores/session'

// 使用 hash 模式，GitHub Pages 重新整理不會 404
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    {
      path: '/quiz',
      name: 'quiz',
      component: () => import('../views/QuizView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/result',
      name: 'result',
      component: () => import('../views/ResultView.vue'),
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
      path: '/admin/questions',
      name: 'admin-questions',
      component: () => import('../views/AdminQuestionsView.vue'),
      meta: { requiresAdmin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.meta.requiresUser && !session.currentUser) {
    return { name: 'home' }
  }
  if (to.meta.requiresAdmin && !session.isAdmin) {
    return { name: 'admin-login' }
  }
  return true
})

export default router
