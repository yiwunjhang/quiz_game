import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 使用相對路徑 base，讓專案可部署在 GitHub Pages 的子路徑
// (https://<user>.github.io/<repo>/) 而不需修改設定。
// 搭配 router 的 hash 模式，重新整理頁面也不會 404。
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
})
