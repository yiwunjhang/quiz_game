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

export interface LeaderboardRow {
  user_id: string
  nickname: string
  correct_count: number
  answered_count: number
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
/* 玩家：題目 / 作答 / 分數                                              */
/* ------------------------------------------------------------------ */

/** 取得測驗題目（不含答案，透過 server 端函式） */
export async function getQuizQuestions(): Promise<PublicQuestion[]> {
  const { data, error } = await supabase.rpc('get_quiz_questions')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: Number(r.id),
    text: String(r.text),
    options: Array.isArray(r.options) ? r.options : JSON.parse(r.options),
  }))
}

/**
 * 提交作答，由 server 端評分並記錄（每題每人只計一次），
 * 回傳是否答對以及正確答案索引（供作答後標示，因已鎖定不能重answer 故安全）。
 */
export async function submitAnswer(
  questionId: number,
  selectedIndex: number,
): Promise<{ isCorrect: boolean; correctIndex: number }> {
  const { data, error } = await supabase.rpc('submit_answer', {
    p_question_id: questionId,
    p_selected_index: selectedIndex,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return {
    isCorrect: Boolean(row?.is_correct),
    correctIndex: Number(row?.correct_index),
  }
}

/** 取得自己的成績（答對的不重複題數 / 作答的不重複題數） */
export async function getMyScore(): Promise<{ correct: number; total: number }> {
  const { data, error } = await supabase.rpc('get_my_score')
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return { correct: Number(row?.correct ?? 0), total: Number(row?.total ?? 0) }
}

/** 排行榜（答對最多的不重複題數由高到低） */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_leaderboard')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    user_id: String(r.user_id),
    nickname: String(r.nickname),
    correct_count: Number(r.correct_count),
    answered_count: Number(r.answered_count),
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
