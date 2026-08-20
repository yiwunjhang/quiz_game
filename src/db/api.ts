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

/** 房間內的玩家（依分數排序） */
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
 */
export async function adminLogin(nickname: string, password: string): Promise<AppUser> {
  const name = nickname.trim()
  const email = emailForNickname(name)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('帳號或密碼錯誤')

  const uid = data.user.id
  const prof = await fetchProfile(uid)
  if (!prof?.is_admin) {
    await supabase.auth.signOut()
    throw new Error('此帳號沒有管理權限')
  }
  return { id: uid, nickname: prof.nickname, isAdmin: true }
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

/** 建立房間，回傳房間 id 與 6 位數代碼 */
export async function createGame(
  seconds: number,
  questionCount: number,
): Promise<{ gameId: string; pin: string }> {
  const { data, error } = await supabase.rpc('create_game', {
    p_seconds: seconds,
    p_count: questionCount,
  })
  if (error) throw new Error(error.message)
  return { gameId: String(data.game_id), pin: String(data.pin) }
}

/** 以房間代碼加入，回傳房間 id */
export async function joinGame(pin: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_game', { p_pin: pin.trim() })
  if (error) throw new Error(error.message)
  return String(data)
}

/** 讀取房間即時狀態 */
export async function getGameState(gameId: string): Promise<GameState> {
  const { data, error } = await supabase.rpc('get_game_state', { p_game_id: gameId })
  if (error) throw new Error(error.message)
  return normalizeState(data)
}

/** 作答（伺服器計時計分，每題只計第一次） */
export async function submitLiveAnswer(
  gameId: string,
  selectedIndex: number,
): Promise<{ selected_index: number; is_correct: boolean; points: number }> {
  const { data, error } = await supabase.rpc('submit_live_answer', {
    p_game_id: gameId,
    p_selected_index: selectedIndex,
  })
  if (error) throw new Error(error.message)
  return {
    selected_index: Number(data?.selected_index),
    is_correct: Boolean(data?.is_correct),
    points: Number(data?.points ?? 0),
  }
}

/** 主持人操作：開始 / 提前公布答案 / 下一題 / 結束 */
export async function hostAction(
  gameId: string,
  action: 'start' | 'reveal' | 'next' | 'end',
): Promise<GameState> {
  const { data, error } = await supabase.rpc('host_action', {
    p_game_id: gameId,
    p_action: action,
  })
  if (error) throw new Error(error.message)
  return normalizeState(data)
}

/** 我目前主持中或參加中的房間（重新整理後可直接回到現場） */
export async function getMyActiveGame(): Promise<{ gameId: string; pin: string; isHost: boolean } | null> {
  const { data, error } = await supabase.rpc('get_my_active_game')
  if (error) throw new Error(error.message)
  if (!data) return null
  return { gameId: String(data.game_id), pin: String(data.pin), isHost: Boolean(data.is_host) }
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
