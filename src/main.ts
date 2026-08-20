import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { initDatabase } from './db/database'

async function bootstrap() {
  // 先初始化瀏覽器內 SQLite，再掛載 App
  await initDatabase()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

bootstrap()
