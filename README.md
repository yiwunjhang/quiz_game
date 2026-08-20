# 🧠 問答遊戲挑戰 (Quiz Game)

多人問答遊戲系統，使用 **Vue 3 + Vite + TypeScript + Tailwind CSS**，
後端資料以 **Supabase（雲端 Postgres + Auth）** 儲存，前端部署到 **GitHub Pages**。
**多台裝置共用同一份題庫與排行榜。**

## 功能

- 🎮 參加者以「暱稱 + 密碼」加入（首次登入即註冊，支援中文暱稱）
- ❓ 逐題作答；**答案由伺服器評分**，前端拿不到正確答案，無法作弊
- 🔒 每人每題只計一次，分數無法灌水
- 🏆 排行榜：依「答對不重複題數」排名（公開頁面，免登入可看）
- ⚙️ 後台管理：新增／編輯／刪除題目、匯出／匯入題庫 JSON（需管理權限）

## 架構

| 層     | 技術                                    |
| ------ | --------------------------------------- |
| UI     | Vue 3 `<script setup>` + Tailwind CSS v4 |
| 路由   | vue-router（hash 模式）                 |
| 狀態   | Pinia                                   |
| 後端   | Supabase（Postgres + Auth + RPC）       |
| 部署   | GitHub Actions → GitHub Pages           |

安全設計：玩家的所有讀寫（取題、作答、排行榜）都經過 Supabase 的
`security definer` 函式與 Row Level Security，確保答案不外洩、分數不可偽造。
題庫管理則限定 `is_admin = true` 的帳號。

---

## 一、建立 Supabase 專案（免費）

1. 到 <https://supabase.com> 註冊並登入。
2. 點 **New project**，填專案名稱、資料庫密碼、選離你最近的區域，建立（約需 1～2 分鐘）。
3. 建好後到 **Settings → API**，記下兩個值：
   - **Project URL**（形如 `https://xxxx.supabase.co`）
   - **anon public** key
4. **關閉 Email 驗證**（本專案用暱稱登入，不需收信）：
   到 **Authentication → Sign In / Providers → Email**，
   將 **Confirm email** 關閉並儲存。
5. 到 **SQL Editor → New query**，貼上專案中 `supabase/schema.sql` 全部內容並 **Run**。
   這會建立資料表、權限規則、伺服器函式，並塞入幾題範例題目。

## 二、本機開發

```bash
npm install
cp .env.example .env.local   # 然後填入上面的 URL 與 anon key
npm run dev                  # http://localhost:5173
```

`.env.local` 內容：

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=你的-anon-public-key
```

## 三、設定管理者帳號

1. 開啟遊戲首頁，用一個暱稱（例如 `admin`）+ 密碼註冊登入一次。
2. 回到 Supabase **SQL Editor**，執行：
   ```sql
   update public.profiles set is_admin = true where nickname = 'admin';
   ```
3. 之後到 `/#/admin`，用該暱稱與密碼登入即可管理題庫。

## 四、部署到 GitHub Pages

1. 建立 GitHub repo 並推送本專案。
2. repo → **Settings → Secrets and variables → Actions → Variables**，
   新增兩個 **Repository variable**：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   > anon key 本來就是公開金鑰（受 RLS 保護），用 Variables 或 Secrets 皆可。
3. repo → **Settings → Pages → Build and deployment**，Source 選 **GitHub Actions**。
4. 推送到 `main` 後，`.github/workflows/deploy.yml` 會自動建置並部署到
   `https://<你的帳號>.github.io/<repo 名稱>/`。

> 使用 `base: './'` 搭配 router hash 模式，任何子路徑皆可運作，重新整理不會 404。

---

## 常見問題

- **註冊時出現「未取得登入狀態」** → 請確認步驟一第 4 點已關閉 Email 驗證。
- **首頁顯示「尚未設定 Supabase 連線資訊」** → `.env.local`（本機）或 repo Variables（部署）未設定。
- **密碼太短被拒** → Supabase 預設密碼至少 6 碼。
- **暱稱含特殊符號登入失敗** → 內部會把暱稱編碼成合法 email；若整個網域被拒，
  可修改 `src/db/api.ts` 中的 `EMAIL_DOMAIN` 常數。
