import { supabase } from '../supabase'

/* ------------------------------------------------------------------ */
/* 型別                                                                */
/* ------------------------------------------------------------------ */

export interface AppUser {
  id: string
  nickname: string
  isAdmin: boolean
}

/** 給玩家看的題目（不含正確答案） */
export interface PublicQuestion {
  id: number
  text: string
  options: string[]
}

/** 後台完整題目（含正確答案） */
export interface Question extends PublicQuestion {
  correct_index: number
}

/** 遊戲中的玩家（依分數排序） */
export interface GamePlayer {
  user_id: string
  nickname: string
  score: number
  correct_count: number
}

/** 遊戲階段：等待中 / 作答中 / 公布答案 / 已結束 */
export type GamePhase = 'lobby' | 'question' | 'reveal' | 'ended'

/** 由 get_game_state 回傳的完整即時狀態 */
export interface GameState {
  game_id: string
  pin: string
  /** 資料庫實際狀態（主持人尚未按下一題時仍為 question） */
  status: GamePhase
  /** 實際顯示用階段：時間到即自動視為 reveal */
  phase: GamePhase
  is_host: boolean
  index: number
  total: number
  seconds: number
  started_at: string | null
  server_now: string
  question: PublicQuestion | null
  correct_index: number | null
  my_answer: { selected_index: number; is_correct: boolean; points: number } | null
  my_score: number | null
  player_count: number
  answer_count: number
  players: GamePlayer[]
  /** 公布答案時，各選項被選的人數 */
  stats: number[] | null
}

/** 後台場次清單的一列 */
export interface HostedGame {
  id: string
  pin: string
  status: GamePhase
  question_count: number
  player_count: number
  /** 這場是否計入總排行榜 */
  show_on_leaderboard: boolean
  created_at: string
  ended_at: string | null
}

export type HostApplicationStatus = 'pending' | 'approved' | 'rejected'

/** 主持人權限申請 */
export interface HostApplication {
  id: number
  nickname: string
  reason: string
  status: HostApplicationStatus
  created_at: string
  reviewed_at: string | null
  review_note: string | null
}

export interface GlobalRankRow {
  user_id: string
  nickname: string
  total_score: number
  games_played: number
  best_score: number
  correct_total: number
}

/* ------------------------------------------------------------------ */
/* 帳號 / 驗證                                                          */
/* ------------------------------------------------------------------ */

// 暱稱可能含中文或空白，無法直接當 email，這裡編碼成合法的 email local part。
// 注意：Supabase 會拒絕 .local 等無效網域，需用有效 TLD（實測 quizgame.com 可用）。
const EMAIL_DOMAIN = 'quizgame.com'

function emailForNickname(nickname: string): string {
  const bytes = new TextEncoder().encode(nickname.trim().toLowerCase())
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `u${hex}@${EMAIL_DOMAIN}`
}

async function fetchProfile(userId: string): Promise<{ nickname: string; is_admin: boolean } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, is_admin')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/**
 * 參加者加入：暱稱不存在則註冊，存在則以密碼登入。
 */
export async function registerOrLogin(nickname: string, password: string): Promise<AppUser> {
  const name = nickname.trim()
  if (!name) throw new Error('暱稱不可空白')
  if (!password) throw new Error('密碼不可空白')
  const email = emailForNickname(name)

  // 先嘗試登入
  const signIn = await supabase.auth.signInWithPassword({ email, password })

  if (signIn.error) {
    // 登入失敗 → 可能尚未註冊，嘗試註冊
    const signUp = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname: name } },
    })
    if (signUp.error) {
      const msg = signUp.error.message ?? ''
      const code = (signUp.error as any).code ?? ''
      if (code === 'user_already_exists' || /already registered|already been registered/i.test(msg)) {
        // 暱稱(email)已存在但密碼不符 → 既有帳號、密碼錯誤
        throw new Error('此暱稱已被使用，且密碼不正確')
      }
      if (code === 'weak_password' || /at least 6 characters|password/i.test(msg)) {
        throw new Error('密碼太短，請至少輸入 6 個字元')
      }
      // 其他錯誤原樣顯示，方便排錯
      throw new Error('註冊失敗：' + msg)
    }
    if (!signUp.data.session) {
      throw new Error('註冊成功但未取得登入狀態，請確認 Supabase 已關閉 Email 驗證')
    }
    const uid = signUp.data.user!.id
    // 建立 profile
    const { error: profErr } = await supabase
      .from('profiles')
      .insert({ id: uid, nickname: name })
    if (profErr && !profErr.message.includes('duplicate')) {
      throw new Error('建立個人資料失敗：' + profErr.message)
    }
    return { id: uid, nickname: name, isAdmin: false }
  }

  // 登入成功
  const uid = signIn.data.user.id
  const prof = await fetchProfile(uid)
  return { id: uid, nickname: prof?.nickname ?? name, isAdmin: prof?.is_admin ?? false }
}

/**
 * 後台登入：只登入既有帳號，並驗證是否具備管理權限。
 * 沒有權限時順便把申請狀態一起說清楚，免得申請人只看到「沒有權限」而不知道還在等審核。
 */
export async function adminLogin(nickname: string, password: string): Promise<AppUser> {
  const name = nickname.trim()
  const email = emailForNickname(name)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('帳號或密碼錯誤')

  const uid = data.user.id
  const prof = await fetchProfile(uid)
  if (!prof?.is_admin) {
    // 還登入著才查得到自己的申請，查完再登出
    const app = await getMyHostApplication().catch(() => null)
    await supabase.auth.signOut()
    if (app?.status === 'pending') {
      throw new Error('你的主持人申請審核中，請等待現任主持人核准')
    }
    if (app?.status === 'rejected') {
      throw new Error('你的主持人申請未通過' + (app.review_note ? `：${app.review_note}` : ''))
    }
    throw new Error('此帳號沒有管理權限，可從下方申請成為主持人')
  }
  return { id: uid, nickname: prof.nickname, isAdmin: true }
}

/* ------------------------------------------------------------------ */
/* 主持人權限：申請 / 審核                                              */
/* ------------------------------------------------------------------ */

/** 提出主持人申請（需先登入；帳號本身仍是一般玩家） */
export async function applyForHost(reason: string): Promise<HostApplicationStatus> {
  const { data, error } = await supabase.rpc('apply_for_host', { p_reason: reason.trim() })
  if (error) throw new Error(error.message)
  return (firstRow(data)?.status ?? 'pending') as HostApplicationStatus
}

/** 我最近一筆申請的狀態 */
export async function getMyHostApplication(): Promise<{
  status: HostApplicationStatus
  review_note: string | null
} | null> {
  const { data, error } = await supabase.rpc('get_my_host_application')
  if (error) throw new Error(error.message)
  const row = firstRow(data)
  if (!row?.status) return null
  return { status: row.status, review_note: row.review_note ?? null }
}

/** 審核端：列出所有申請（待審的排前面） */
export async function listHostApplications(): Promise<HostApplication[]> {
  const { data, error } = await supabase.rpc('list_host_applications')
  if (error) throw new Error(error.message)
  return ((Array.isArray(data) ? data : (data ?? [])) as any[]).map((r) => ({
    id: Number(r.id),
    nickname: String(r.nickname),
    reason: String(r.reason ?? ''),
    status: r.status as HostApplicationStatus,
    created_at: String(r.created_at),
    reviewed_at: r.reviewed_at ?? null,
    review_note: r.review_note ?? null,
  }))
}

/** 審核端：核准或婉拒 */
export async function reviewHostApplication(
  id: number,
  approve: boolean,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc('review_host_application', {
    p_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

/** 還原目前登入狀態（重新整理後） */
export async function getCurrentUser(): Promise<AppUser | null> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return null
  const prof = await fetchProfile(session.user.id)
  if (!prof) return null
  return { id: session.user.id, nickname: prof.nickname, isAdmin: prof.is_admin }
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
}

/* ------------------------------------------------------------------ */
/* 即時對戰                                                            */
/* ------------------------------------------------------------------ */

function normalizeState(raw: any): GameState {
  const q = raw?.question
  return {
    game_id: String(raw.game_id),
    pin: String(raw.pin),
    status: raw.status,
    phase: raw.phase,
    is_host: Boolean(raw.is_host),
    index: Number(raw.index),
    total: Number(raw.total),
    seconds: Number(raw.seconds),
    started_at: raw.started_at ?? null,
    server_now: String(raw.server_now),
    question: q
      ? {
          id: Number(q.id),
          text: String(q.text),
          options: Array.isArray(q.options) ? q.options : JSON.parse(q.options),
        }
      : null,
    correct_index: raw.correct_index == null ? null : Number(raw.correct_index),
    my_answer: raw.my_answer
      ? {
          selected_index: Number(raw.my_answer.selected_index),
          is_correct: Boolean(raw.my_answer.is_correct),
          points: Number(raw.my_answer.points),
        }
      : null,
    my_score: raw.my_score == null ? null : Number(raw.my_score),
    player_count: Number(raw.player_count ?? 0),
    answer_count: Number(raw.answer_count ?? 0),
    players: (raw.players ?? []).map((p: any) => ({
      user_id: String(p.user_id),
      nickname: String(p.nickname),
      score: Number(p.score),
      correct_count: Number(p.correct_count ?? 0),
    })),
    stats: Array.isArray(raw.stats) ? raw.stats.map((n: any) => Number(n)) : null,
  }
}

const SCHEMA_HINT = '請到 Supabase SQL Editor 重新執行一次 supabase/schema.sql'

/** RPC 若回傳單列資料表會是陣列，回傳 jsonb 則是物件，兩種都要能吃 */
function firstRow(data: any): any {
  return Array.isArray(data) ? data[0] : data
}

function assertUuid(value: any, what: string): string {
  const id = value == null ? '' : String(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`${what}（伺服器沒有回傳有效的遊戲編號）。${SCHEMA_HINT}`)
  }
  return id
}

/** 建立遊戲，回傳遊戲 id 與 6 位數代碼 */
export async function createGame(
  seconds: number,
  questionCount: number,
): Promise<{ gameId: string; pin: string }> {
  const { data, error } = await supabase.rpc('create_game', {
    p_seconds: seconds,
    p_count: questionCount,
  })
  if (error) throw new Error(error.message)
  const row = firstRow(data)
  return {
    gameId: assertUuid(row?.game_id, '建立遊戲失敗'),
    pin: String(row?.pin ?? ''),
  }
}

/** 以遊戲代碼加入，回傳遊戲 id */
export async function joinGame(pin: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_game', { p_pin: pin.trim() })
  if (error) throw new Error(error.message)
  // 舊版簽章可能回傳單列資料表，一併相容
  const value = typeof data === 'object' && data !== null ? firstRow(data)?.join_game : data
  return assertUuid(value ?? data, '加入遊戲失敗')
}

/** 讀取遊戲即時狀態 */
export async function getGameState(gameId: string): Promise<GameState> {
  const id = assertUuid(gameId, '無法讀取遊戲狀態')
  const { data, error } = await supabase.rpc('get_game_state', { p_game_id: id })
  if (error) throw new Error(error.message)
  const row = firstRow(data)
  if (!row?.game_id) throw new Error(`讀取遊戲狀態失敗。${SCHEMA_HINT}`)
  return normalizeState(row)
}

/** 作答（伺服器計時計分，每題只計第一次） */
export async function submitLiveAnswer(
  gameId: string,
  selectedIndex: number,
): Promise<{ selected_index: number; is_correct: boolean; points: number }> {
  const { data, error } = await supabase.rpc('submit_live_answer', {
    p_game_id: assertUuid(gameId, '送出答案失敗'),
    p_selected_index: selectedIndex,
  })
  if (error) throw new Error(error.message)
  const row = firstRow(data)
  return {
    selected_index: Number(row?.selected_index),
    is_correct: Boolean(row?.is_correct),
    points: Number(row?.points ?? 0),
  }
}

/** 主持人操作：開始 / 提前公布答案 / 下一題 / 結束 */
export async function hostAction(
  gameId: string,
  action: 'start' | 'reveal' | 'next' | 'end',
): Promise<GameState> {
  const { data, error } = await supabase.rpc('host_action', {
    p_game_id: assertUuid(gameId, '操作失敗'),
    p_action: action,
  })
  if (error) throw new Error(error.message)
  return normalizeState(firstRow(data))
}

/** 我目前主持中或參加中的遊戲（重新整理後可直接回到現場） */
export async function getMyActiveGame(): Promise<{ gameId: string; pin: string; isHost: boolean } | null> {
  const { data, error } = await supabase.rpc('get_my_active_game')
  if (error) throw new Error(error.message)
  const row = firstRow(data)
  // 拿不到有效的遊戲編號就當作沒有進行中的遊戲，別讓首頁導到壞掉的網址
  if (!row?.game_id) return null
  try {
    return {
      gameId: assertUuid(row.game_id, ''),
      pin: String(row.pin ?? ''),
      isHost: Boolean(row.is_host),
    }
  } catch {
    return null
  }
}

/** 我主持過的所有場次（後台管理用） */
export async function listMyGames(): Promise<HostedGame[]> {
  const { data, error } = await supabase.rpc('list_my_games')
  if (error) throw new Error(error.message)
  return ((Array.isArray(data) ? data : (data ?? [])) as any[]).map((r) => ({
    id: String(r.id),
    pin: String(r.pin ?? ''),
    status: r.status as GamePhase,
    question_count: Number(r.question_count ?? 0),
    player_count: Number(r.player_count ?? 0),
    show_on_leaderboard: r.show_on_leaderboard !== false,
    created_at: String(r.created_at),
    ended_at: r.ended_at ?? null,
  }))
}

/**
 * 刪除場次，回傳一併移除的玩家紀錄數。
 * 子表都是 on delete cascade，所以排行榜（彙總 game_players）會自動不再計入這一場。
 */
export async function deleteGame(gameId: string): Promise<number> {
  const { data, error } = await supabase.rpc('delete_game', {
    p_game_id: assertUuid(gameId, '刪除場次失敗'),
  })
  if (error) throw new Error(error.message)
  return Number(firstRow(data)?.removed_players ?? 0)
}

/** 切換某場次要不要列入總排行榜 */
export async function setGameLeaderboard(gameId: string, show: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_game_leaderboard', {
    p_game_id: assertUuid(gameId, '設定失敗'),
    p_show: show,
  })
  if (error) throw new Error(error.message)
}

/** 總排行榜：累計所有已結束場次的得分 */
export async function getGlobalLeaderboard(): Promise<GlobalRankRow[]> {
  const { data, error } = await supabase.rpc('get_global_leaderboard')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    user_id: String(r.user_id),
    nickname: String(r.nickname),
    total_score: Number(r.total_score),
    games_played: Number(r.games_played),
    best_score: Number(r.best_score),
    correct_total: Number(r.correct_total),
  }))
}

/* ------------------------------------------------------------------ */
/* 後台：題目 CRUD (需管理權限，由 RLS 保護)                            */
/* ------------------------------------------------------------------ */

export async function getQuestionsAdmin(): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('id, text, options, correct_index')
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: Number(r.id),
    text: String(r.text),
    options: Array.isArray(r.options) ? r.options : JSON.parse(r.options),
    correct_index: Number(r.correct_index),
  }))
}

function validateQuestion(text: string, options: string[], correctIndex: number): string[] {
  if (!text.trim()) throw new Error('題目內容不可空白')
  const clean = options.map((o) => o.trim())
  if (clean.filter((o) => o.length > 0).length < 2) throw new Error('至少需要兩個有內容的選項')
  if (correctIndex < 0 || correctIndex >= clean.length) throw new Error('請選擇正確答案')
  if (!clean[correctIndex]) throw new Error('正確答案的選項不可空白')
  return clean
}

export async function addQuestion(
  text: string,
  options: string[],
  correctIndex: number,
): Promise<void> {
  const clean = validateQuestion(text, options, correctIndex)
  const { error } = await supabase
    .from('questions')
    .insert({ text: text.trim(), options: clean, correct_index: correctIndex })
  if (error) throw new Error(error.message)
}

export async function updateQuestion(
  id: number,
  text: string,
  options: string[],
  correctIndex: number,
): Promise<void> {
  const clean = validateQuestion(text, options, correctIndex)
  const { error } = await supabase
    .from('questions')
    .update({ text: text.trim(), options: clean, correct_index: correctIndex })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteQuestion(id: number): Promise<void> {
  const { error } = await supabase.from('questions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * 批次新增。匯入整份題庫時不必一題打一次 API。
 * 任何一題格式不對就整批不寫入，避免匯到一半留下半套資料。
 */
export async function addQuestions(
  items: { text: string; options: string[]; correct_index: number }[],
): Promise<number> {
  const rows = items.map((it, i) => {
    try {
      const clean = validateQuestion(it.text, it.options, it.correct_index)
      return { text: it.text.trim(), options: clean, correct_index: it.correct_index }
    } catch (e: any) {
      throw new Error(`第 ${i + 1} 題：${e?.message ?? '格式不正確'}`)
    }
  })
  if (rows.length === 0) return 0
  const { error } = await supabase.from('questions').insert(rows)
  if (error) throw new Error(error.message)
  return rows.length
}

/**
 * 清空整個題庫，回傳刪掉的題數。
 *
 * 注意：game_answers.question_id 有 on delete cascade，所以歷史對戰的
 * 「逐題作答紀錄」會一併消失；玩家分數存在 game_players，排行榜不受影響。
 */
export async function deleteAllQuestions(): Promise<number> {
  const { data, error } = await supabase.from('questions').delete().gt('id', 0).select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}
