import { computed, onUnmounted, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getGameState, type GamePhase, type GameState } from '../db/api'

/**
 * 訂閱一場遊戲的即時狀態。
 *
 * 三層保險，確保所有人畫面同步：
 *  1. Supabase Realtime：主持人切換題目 / 有人加入時立刻推播
 *  2. 輪詢：作答中每 2 秒、其他階段每 5 秒補抓一次（Realtime 斷線時的後備）
 *  3. 本地倒數：以「伺服器時間」校正過的時鐘計算剩餘秒數，
 *     避免各裝置時間不一致造成倒數不同步
 */
export function useGame(gameId: string) {
  const state = ref<GameState | null>(null)
  const loading = ref(true)
  const error = ref('')

  /** 伺服器時間 - 本機時間，用來校正倒數 */
  let clockOffset = 0
  const localNow = ref(Date.now())

  let channel: RealtimeChannel | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let inflight: Promise<void> | null = null
  let stopped = false
  /** 本地倒數歸零後，只補抓一次答案 */
  let timeoutRefreshed = false

  async function refresh(): Promise<void> {
    if (stopped) return
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const next = await getGameState(gameId)
        clockOffset = Date.parse(next.server_now) - Date.now()
        if (state.value?.index !== next.index) timeoutRefreshed = false
        state.value = next
        error.value = ''
      } catch (e: any) {
        error.value = e?.message ?? '連線失敗'
      } finally {
        loading.value = false
        inflight = null
      }
    })()
    return inflight
  }

  const remainingMs = computed(() => {
    const s = state.value
    if (!s || s.status !== 'question' || !s.started_at) return 0
    const deadline = Date.parse(s.started_at) + s.seconds * 1000
    return Math.max(0, deadline - (localNow.value + clockOffset))
  })

  const remainingSec = computed(() => Math.ceil(remainingMs.value / 1000))

  /** 剩餘時間比例 0~1，供倒數圓環使用 */
  const remainingRatio = computed(() => {
    const s = state.value
    if (!s || !s.seconds) return 0
    return Math.min(1, remainingMs.value / (s.seconds * 1000))
  })

  /**
   * 實際顯示用階段。時間一到就在本地切到 reveal，
   * 不必等伺服器回應，畫面才不會卡在「作答中」。
   */
  const phase = computed<GamePhase>(() => {
    const s = state.value
    if (!s) return 'lobby'
    if (s.status === 'question' && s.started_at && remainingMs.value <= 0) return 'reveal'
    return s.phase
  })

  /** 目前這一題我是否已作答 */
  const answered = computed(() => state.value?.my_answer != null)

  function scheduleNextPoll() {
    if (stopped) return
    const delay = state.value?.status === 'question' ? 2000 : 5000
    pollTimer = setTimeout(async () => {
      await refresh()
      scheduleNextPoll()
    }, delay)
  }

  function start() {
    stopped = false
    refresh().then(scheduleNextPoll)

    // 本地時鐘：每 100ms 更新一次，倒數才會平滑
    tickTimer = setInterval(() => {
      localNow.value = Date.now()
      // 時間到的瞬間補抓一次，才能拿到正確答案與作答統計
      if (
        !timeoutRefreshed &&
        state.value?.status === 'question' &&
        remainingMs.value <= 0
      ) {
        timeoutRefreshed = true
        void refresh()
      }
    }, 100)

    void subscribeRealtime()
  }

  async function subscribeRealtime() {
    try {
      // Realtime 也要帶 JWT，RLS 才會把遊戲的變更推給這位使用者
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) await Promise.resolve(supabase.realtime.setAuth(token))
    } catch {
      /* 取不到 token 就純靠輪詢 */
    }
    if (stopped) return

    channel = supabase
      .channel(`game-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        () => void refresh(),
      )
      .subscribe()
  }

  function stop() {
    stopped = true
    if (pollTimer) clearTimeout(pollTimer)
    if (tickTimer) clearInterval(tickTimer)
    pollTimer = null
    tickTimer = null
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  start()
  onUnmounted(stop)

  return {
    state,
    phase,
    answered,
    loading,
    error,
    remainingSec,
    remainingRatio,
    refresh,
    stop,
  }
}
