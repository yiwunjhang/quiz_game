import initSqlJs, { type Database } from 'sql.js'
// Vite 會把 wasm 轉成帶 hash 的 URL，並套用 base 路徑，
// 因此在 GitHub Pages 子路徑下也能正確載入。
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

const STORAGE_KEY = 'quiz-game-db-v1'

let db: Database | null = null

/** 型別定義 */
export interface Question {
  id: number
  text: string
  options: string[]
  correct_index: number
  created_at: string
}

export interface LeaderboardRow {
  user_id: number
  nickname: string
  correct_count: number
  answered_count: number
  last_played: string
}

/* ------------------------------------------------------------------ */
/* 初始化與持久化                                                       */
/* ------------------------------------------------------------------ */

/** 從 localStorage 讀取先前存下的資料庫 (base64) */
function loadFromStorage(): Uint8Array | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** 把目前的資料庫序列化存回 localStorage */
export function persist(): void {
  if (!db) return
  const data = db.export()
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(data.subarray(i, i + chunk)))
  }
  localStorage.setItem(STORAGE_KEY, btoa(binary))
}

function createSchema(): void {
  if (!db) return
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_index INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
}

/** 若題庫為空，塞入幾題範例題目 */
function seedIfEmpty(): void {
  if (!db) return
  const res = db.exec('SELECT COUNT(*) AS c FROM questions')
  const count = res.length ? Number(res[0].values[0][0]) : 0
  if (count > 0) return

  const samples: Array<Omit<Question, 'id' | 'created_at'>> = [
    { text: 'Vue 3 的預設回應式系統是基於哪個 JavaScript 特性？', options: ['Object.defineProperty', 'Proxy', 'Getter/Setter 手寫', 'MutationObserver'], correct_index: 1 },
    { text: 'Tailwind CSS 屬於哪一種 CSS 方法論？', options: ['BEM', 'OOCSS', 'Utility-First', 'Atomic Design'], correct_index: 2 },
    { text: '下列何者是 SQLite 的特性？', options: ['需要獨立伺服器程序', '資料庫是單一檔案', '不支援 SQL', '只能存在記憶體'], correct_index: 1 },
    { text: 'GitHub Pages 主要用來託管哪種內容？', options: ['靜態網站', 'Docker 容器', 'SQL 資料庫', '背景排程任務'], correct_index: 0 },
    { text: 'HTTP 狀態碼 404 代表什麼？', options: ['伺服器內部錯誤', '找不到資源', '未授權', '請求逾時'], correct_index: 1 },
  ]

  for (const q of samples) {
    addQuestion(q.text, q.options, q.correct_index)
  }
}

/** 初始化資料庫，必須在 app 啟動時 await */
export async function initDatabase(): Promise<void> {
  if (db) return
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const saved = loadFromStorage()
  db = saved ? new SQL.Database(saved) : new SQL.Database()
  createSchema()
  seedIfEmpty()
  persist()
}

function requireDb(): Database {
  if (!db) throw new Error('資料庫尚未初始化，請先呼叫 initDatabase()')
  return db
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

/** 用 SHA-256 對密碼做雜湊 (純前端示範用途) */
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder().encode(password)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function now(): string {
  return new Date().toISOString()
}

/* ------------------------------------------------------------------ */
/* 使用者 / 驗證                                                        */
/* ------------------------------------------------------------------ */

export interface User {
  id: number
  nickname: string
}

/** 註冊或登入：暱稱不存在則建立，存在則驗證密碼 */
export async function registerOrLogin(nickname: string, password: string): Promise<User> {
  const d = requireDb()
  const name = nickname.trim()
  if (!name) throw new Error('暱稱不可空白')
  if (!password) throw new Error('密碼不可空白')

  const stmt = d.prepare('SELECT id, password_hash FROM users WHERE nickname = :n')
  stmt.bind({ ':n': name })
  const exists = stmt.step()
  const row = exists ? stmt.getAsObject() : null
  stmt.free()

  const hash = await hashPassword(password)

  if (row) {
    if (row.password_hash !== hash) {
      throw new Error('此暱稱已被使用，且密碼不正確')
    }
    return { id: Number(row.id), nickname: name }
  }

  d.run('INSERT INTO users (nickname, password_hash, created_at) VALUES (?, ?, ?)', [
    name,
    hash,
    now(),
  ])
  persist()
  const idRes = d.exec('SELECT last_insert_rowid() AS id')
  const id = Number(idRes[0].values[0][0])
  return { id, nickname: name }
}

/* ------------------------------------------------------------------ */
/* 題目 CRUD (後台)                                                     */
/* ------------------------------------------------------------------ */

export function getQuestions(): Question[] {
  const d = requireDb()
  const res = d.exec('SELECT id, text, options, correct_index, created_at FROM questions ORDER BY id')
  if (!res.length) return []
  return res[0].values.map((row) => ({
    id: Number(row[0]),
    text: String(row[1]),
    options: JSON.parse(String(row[2])),
    correct_index: Number(row[3]),
    created_at: String(row[4]),
  }))
}

export function addQuestion(text: string, options: string[], correctIndex: number): void {
  const d = requireDb()
  validateQuestion(text, options, correctIndex)
  d.run('INSERT INTO questions (text, options, correct_index, created_at) VALUES (?, ?, ?, ?)', [
    text.trim(),
    JSON.stringify(options),
    correctIndex,
    now(),
  ])
  persist()
}

export function updateQuestion(
  id: number,
  text: string,
  options: string[],
  correctIndex: number,
): void {
  const d = requireDb()
  validateQuestion(text, options, correctIndex)
  d.run('UPDATE questions SET text = ?, options = ?, correct_index = ? WHERE id = ?', [
    text.trim(),
    JSON.stringify(options),
    correctIndex,
    id,
  ])
  persist()
}

export function deleteQuestion(id: number): void {
  const d = requireDb()
  d.run('DELETE FROM questions WHERE id = ?', [id])
  persist()
}

function validateQuestion(text: string, options: string[], correctIndex: number): void {
  if (!text.trim()) throw new Error('題目內容不可空白')
  const clean = options.map((o) => o.trim()).filter((o) => o.length > 0)
  if (clean.length < 2) throw new Error('至少需要兩個選項')
  if (correctIndex < 0 || correctIndex >= options.length) throw new Error('請選擇正確答案')
  if (!options[correctIndex]?.trim()) throw new Error('正確答案的選項不可空白')
}

/* ------------------------------------------------------------------ */
/* 作答 / 計分                                                          */
/* ------------------------------------------------------------------ */

/** 記錄一次作答 */
export function recordAttempt(
  userId: number,
  questionId: number,
  selectedIndex: number,
  isCorrect: boolean,
): void {
  const d = requireDb()
  d.run(
    'INSERT INTO attempts (user_id, question_id, selected_index, is_correct, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, questionId, selectedIndex, isCorrect ? 1 : 0, now()],
  )
  persist()
}

/** 清除某使用者的作答紀錄 (重新挑戰時使用) */
export function clearAttempts(userId: number): void {
  const d = requireDb()
  d.run('DELETE FROM attempts WHERE user_id = ?', [userId])
  persist()
}

/**
 * 排行榜：每位使用者答對的「不重複題目數」由高到低。
 * 使用 DISTINCT 避免重複作答同一題灌分。
 */
export function getLeaderboard(): LeaderboardRow[] {
  const d = requireDb()
  const res = d.exec(`
    SELECT
      u.id AS user_id,
      u.nickname AS nickname,
      COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN a.question_id END) AS correct_count,
      COUNT(DISTINCT a.question_id) AS answered_count,
      MAX(a.created_at) AS last_played
    FROM users u
    LEFT JOIN attempts a ON a.user_id = u.id
    GROUP BY u.id, u.nickname
    HAVING answered_count > 0
    ORDER BY correct_count DESC, last_played ASC
  `)
  if (!res.length) return []
  return res[0].values.map((row) => ({
    user_id: Number(row[0]),
    nickname: String(row[1]),
    correct_count: Number(row[2] ?? 0),
    answered_count: Number(row[3] ?? 0),
    last_played: String(row[4] ?? ''),
  }))
}

/** 取得某使用者答對的不重複題目數 */
export function getUserScore(userId: number): { correct: number; total: number } {
  const d = requireDb()
  const res = d.exec(
    `SELECT
       COUNT(DISTINCT CASE WHEN is_correct = 1 THEN question_id END) AS correct,
       COUNT(DISTINCT question_id) AS total
     FROM attempts WHERE user_id = ?`,
    [userId],
  )
  if (!res.length) return { correct: 0, total: 0 }
  const v = res[0].values[0]
  return { correct: Number(v[0] ?? 0), total: Number(v[1] ?? 0) }
}

/** 危險操作：清空整個資料庫 (後台可用) */
export function resetDatabase(): void {
  localStorage.removeItem(STORAGE_KEY)
  db = null
}
