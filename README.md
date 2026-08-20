# 🧠 問答遊戲挑戰 (Quiz Game)

純前端問答遊戲系統，使用 **Vue 3 + Vite + TypeScript + Tailwind CSS**，
資料儲存在瀏覽器內的 **SQLite（sql.js / WASM）**，可直接部署到 **GitHub Pages**。

## 功能

- 🎮 參加者以「暱稱 + 密碼」加入遊戲（首次登入即註冊）
- ❓ 逐題作答，即時顯示對錯與進度
- 🏆 排行榜：依「答對不重複題數」排名
- ⚙️ 後台管理：新增／編輯／刪除題目、匯出／匯入題庫 JSON
- 💾 資料以 SQLite 格式持久化在 `localStorage`

## ⚠️ 重要限制

這是**純前端**應用，資料存在「使用者當下的瀏覽器」中，**不會跨裝置或跨瀏覽器同步**。

適用情境：

- 活動現場用**同一台裝置/大螢幕**，參加者輪流登入作答
- 或每位參加者各自在自己的瀏覽器獨立遊玩

若需要「多人各自裝置、共用同一份題庫與排行榜」，必須改為搭配後端 API 或雲端資料庫
（例如 .NET8 + Azure SQL、或 Supabase 等 BaaS）。資料層集中在 `src/db/database.ts`，方便日後替換。

## 開發

```bash
npm install
npm run dev      # 本機開發 http://localhost:5173
npm run build    # 產出 dist/
npm run preview  # 預覽建置結果
```

## 後台

- 網址：`/#/admin`
- 預設管理密碼：`admin123`
- **正式使用請務必修改** `src/stores/session.ts` 中的 `ADMIN_PASSWORD`

## 部署到 GitHub Pages

1. 建立 GitHub repo 並推送本專案。
2. 到 repo 的 **Settings → Pages → Build and deployment**，Source 選擇 **GitHub Actions**。
3. 推送到 `main` 分支後，`.github/workflows/deploy.yml` 會自動建置並部署。
4. 完成後即可在 `https://<你的帳號>.github.io/<repo 名稱>/` 開啟。

> 專案使用 `base: './'` 搭配 router 的 hash 模式，因此在任何子路徑下都能正常運作，
> 重新整理頁面也不會 404。

## 技術架構

| 層          | 技術                             |
| ----------- | -------------------------------- |
| UI          | Vue 3 `<script setup>` + Tailwind CSS v4 |
| 路由        | vue-router（hash 模式）          |
| 狀態        | Pinia                            |
| 資料庫      | sql.js（瀏覽器內 SQLite）        |
| 持久化      | localStorage（序列化 DB）        |
| 部署        | GitHub Actions → GitHub Pages    |
