# 🌸 Quiz Party 問答派對

Kahoot 式的**即時多人問答遊戲**：主持人在後台建立遊戲、參加者用 6 位數代碼加入，
同一時間看同一題、一起搶答，答得越快分數越高，最後站上頒獎台。

技術為 **Vue 3 + Vite + TypeScript + Tailwind CSS v4**，
後端使用 **Supabase（Postgres + Auth + Realtime）**，前端部署到 **GitHub Pages**。

## 功能

- 🎤 **主持人後台**：登入後建立遊戲、選題數與每題秒數，控台可控制出題節奏（適合投影到大螢幕）
- 🎮 **參加者首頁**：只需輸入遊戲代碼＋暱稱即可加入，手機／電腦皆可，所有裝置畫面即時同步
- ⚡ **速度計分**：答對才得分，最快 1000 分、時間快到只剩 500 分
- 📊 **每題公布**：顯示正確答案、各選項有幾人選、即時名次
- 🏆 **頒獎台**：終場前三名頒獎台 + 完整名次；另有累計所有場次的總排行榜
- 🛡️ **防作弊**：正確答案存在伺服器，公布前前端拿不到；分數由伺服器依時間計算
- ⚙️ **後台管理**：新增／編輯／刪除題目、匯出／匯入題庫 JSON（需管理權限）

## 遊玩流程

1. 主持人到 `/#/admin` 登入後台 → **主持遊戲** → 設定題數與秒數 → 建立後控台顯示 6 位數代碼。
2. 參加者在首頁輸入代碼 + 暱稱 + 密碼 → 進入等待室。
3. 主持人按「開始遊戲」，所有人同時看到第一題並開始倒數。
4. 時間到（或主持人提前公布）就顯示答案與戰況，主持人按「下一題」繼續。
5. 最後一題後進入結算頒獎台。

## 架構

| 層     | 技術                                     |
| ------ | ---------------------------------------- |
| UI     | Vue 3 `<script setup>` + Tailwind CSS v4 |
| 路由   | vue-router（hash 模式）                  |
| 狀態   | Pinia + `useGame` composable             |
| 同步   | Supabase Realtime + 輪詢後備 + 伺服器時鐘校正 |
| 後端   | Supabase（Postgres + Auth + RPC）        |
| 部署   | GitHub Actions → GitHub Pages            |

**同步機制**：主持人切題時 Realtime 立刻推播給所有人；同時每 2～5 秒輪詢一次當作
斷線後備；倒數則以 `get_game_state` 回傳的伺服器時間校正本機時鐘，
確保各裝置倒數一致，也避免有人改本機時間偷時間。

**安全設計**：玩家的所有讀寫都經過 `security definer` 函式與 Row Level Security，
正確答案在公布階段前不會出現在任何 API 回應中，分數由伺服器依作答時間計算並
限制每題只計第一次。建立遊戲與題庫管理限定 `is_admin = true` 的主持人帳號，而 `is_admin`
只能由現任主持人在後台核准申請後開通，使用者無法自行取得。

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
   這會建立資料表、權限規則、伺服器函式，把遊戲相關資料表加入 Realtime 推播，
   並塞入幾題範例題目。

   > 已經用過舊版（單人循序作答）的專案，直接重跑一次這份 `schema.sql` 即可升級，
   > 現有題庫與帳號都會保留。舊的 `attempts` 表已不再使用，
   > 檔案最下方附有可自行執行的清除指令。

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

## 三、設定第一位主持人

主持人權限（`profiles.is_admin`）只有兩種取得方式：**手動在資料庫開通**，
或**由現任主持人在後台核准申請**。使用者無法自行取得。

第一位主持人沒有人可以核准，所以要手動開：

1. 到 `/#/admin` → 切到 **申請權限**，填入暱稱（例如 `admin`）+ 密碼送出。
   這會建立一個一般玩家帳號並產生一筆待審申請。
2. 回到 Supabase **SQL Editor**，直接開通：
   ```sql
   update public.profiles set is_admin = true where nickname = 'admin';
   ```
3. 之後到 `/#/admin` 用該暱稱與密碼登入，即可建立遊戲、管理題庫、審核其他人的申請。

### 之後的主持人：走審核流程

1. 申請人到 `/#/admin` → **申請權限**，填暱稱、密碼與申請說明後送出。
   此時帳號仍只是一般玩家，登入後台會被擋下並提示「審核中」。
2. 現任主持人登入後台，導覽列的 **申請審核** 會顯示待審筆數。
3. 點進去按 **核准** 或 **婉拒**（可附備註，會顯示給申請人）。核准後對方才拿到權限。

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
- **建立遊戲時說「題庫是空的」** → 先到後台 **題庫管理** 新增題目，或重跑 `schema.sql`
  匯入範例題目。
- **玩家畫面沒有即時更新** → 確認 `schema.sql` 已完整執行（其中會把 `games`、
  `game_players` 加入 `supabase_realtime` publication）。即使 Realtime 沒生效，
  前端仍有每 2～5 秒的輪詢後備，只是反應會慢一點。
- **遊戲開始後想加入** → 為了公平，開始後不能中途加入；已在場內的人重新整理後
  仍可回到現場（首頁會顯示「回到遊戲」）。
- **想讓某一場不要出現在排行榜** → 「結束遊戲」不是刪除，它正是讓該場計入排行榜的
  動作。到後台 **主持遊戲 → 過往場次**，取消該場的勾選即可（`games.show_on_leaderboard`），
  資料仍保留、隨時可再勾回來。同一列的 **刪除** 則是永久移除，會連同該場的玩家與
  作答紀錄一起清掉（`on delete cascade`）。
