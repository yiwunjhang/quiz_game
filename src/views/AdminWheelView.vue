<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import LuckyWheel from '../components/LuckyWheel.vue'
import { listGamePlayers, listMyGames, type HostedGame } from '../db/api'

/** 一個獎項：名稱 + 要抽幾位，drawn 是已經抽出的人數 */
interface Prize {
  id: string
  name: string
  count: number
  drawn: number
}

interface WinRecord {
  name: string
  prize: string
  at: string
}

const STORE_KEY = 'quizparty.wheel.v1'

const wheel = ref<InstanceType<typeof LuckyWheel> | null>(null)

const games = ref<HostedGame[]>([])
const selectedGameId = ref('')
const entries = ref<string[]>([])
const manualInput = ref('')
const prizes = ref<Prize[]>([])
const history = ref<WinRecord[]>([])
const removeAfterWin = ref(true)

const winner = ref<WinRecord | null>(null)
/** 抽中後先留在畫面上，等下一次開轉才真的移出名單 */
const pendingRemove = ref<string | null>(null)

const spinning = ref(false)
const loading = ref(false)
const error = ref('')
const message = ref('')

/* ---------------- 狀態保存：整理名單很花時間，重新整理不該白做 --------------- */

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return
    const s = JSON.parse(raw)
    entries.value = Array.isArray(s.entries) ? s.entries.map(String) : []
    prizes.value = Array.isArray(s.prizes)
      ? s.prizes.map((p: any) => ({
          id: String(p.id ?? crypto.randomUUID()),
          name: String(p.name ?? ''),
          count: Math.max(1, Number(p.count) || 1),
          drawn: Math.max(0, Number(p.drawn) || 0),
        }))
      : []
    history.value = Array.isArray(s.history) ? s.history : []
    removeAfterWin.value = s.removeAfterWin !== false
    selectedGameId.value = String(s.selectedGameId ?? '')
    // 這一位一定要跟著還原，否則重新整理後他會回到池子裡被重複抽中
    const pending = s.pendingRemove == null ? null : String(s.pendingRemove)
    pendingRemove.value = pending && entries.value.includes(pending) ? pending : null
  } catch {
    // 壞掉的暫存不值得處理，當作沒有就好
  }
}

function save() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        entries: entries.value,
        prizes: prizes.value,
        history: history.value,
        removeAfterWin: removeAfterWin.value,
        pendingRemove: pendingRemove.value,
        selectedGameId: selectedGameId.value,
      }),
    )
  } catch {
    // 無痕模式寫不進去也不影響抽獎
  }
}

watch([entries, prizes, history, removeAfterWin, selectedGameId, pendingRemove], save, {
  deep: true,
})

// 中途關掉「抽中後移除」，就讓還沒移出的那位留在名單裡，別在下次開轉時被偷偷拿掉
watch(removeAfterWin, (on) => {
  if (!on) pendingRemove.value = null
})

onMounted(async () => {
  load()
  try {
    games.value = await listMyGames()
    // 存下來的場次若已被刪除，就別讓下拉選單指著不存在的東西
    if (selectedGameId.value && !games.value.some((g) => g.id === selectedGameId.value)) {
      selectedGameId.value = ''
    }
  } catch (e: any) {
    error.value = e?.message ?? '載入場次失敗'
  }
})

/* ---------------- 名單 ---------------- */

const gameOptions = computed(() =>
  games.value.map((g) => ({
    id: g.id,
    label:
      new Date(g.created_at).toLocaleString('zh-TW', {
        dateStyle: 'short',
        timeStyle: 'short',
      }) +
      ` · 代碼 ${g.pin} · ${g.player_count} 人` +
      (g.status === 'ended' ? '' : '（進行中）'),
  })),
)

function addNames(names: string[]): number {
  const before = entries.value.length
  const seen = new Set(entries.value)
  for (const raw of names) {
    const name = raw.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    entries.value.push(name)
  }
  return entries.value.length - before
}

/** 從某場問答把參加者名單抓進來 */
async function loadFromGame() {
  if (!selectedGameId.value || spinning.value) return
  error.value = ''
  message.value = ''
  loading.value = true
  try {
    const players = await listGamePlayers(selectedGameId.value)
    const added = addNames(players.map((p) => p.nickname))
    message.value = added ? `已加入 ${added} 位參加者` : '這場的參加者都已經在名單裡了'
  } catch (e: any) {
    error.value = e?.message ?? '載入名單失敗'
  } finally {
    loading.value = false
  }
}

/** 手動補人：換行、逗號、頓號都當成分隔 */
function addManual() {
  if (spinning.value) return
  const added = addNames(manualInput.value.split(/[\n,、，]/))
  if (added) {
    message.value = `已加入 ${added} 位`
    error.value = ''
    manualInput.value = ''
  } else {
    error.value = '沒有可以加入的新名字'
  }
}

function removeName(name: string) {
  if (spinning.value) return
  entries.value = entries.value.filter((n) => n !== name)
  if (pendingRemove.value === name) pendingRemove.value = null
}

function clearNames() {
  if (spinning.value || !entries.value.length) return
  if (!confirm(`確定要清空名單裡的 ${entries.value.length} 個名字嗎？`)) return
  entries.value = []
  pendingRemove.value = null
  winner.value = null
}

/* ---------------- 獎品品項 ---------------- */

const currentPrize = computed(() => prizes.value.find((p) => p.drawn < p.count) ?? null)
const prizesDone = computed(() => prizes.value.length > 0 && !currentPrize.value)

/** 沒設定獎品也能抽，那就只是抽名字 */
const prizeLabel = computed(() => {
  const p = currentPrize.value
  if (!p) return ''
  const name = p.name.trim() || '未命名獎品'
  return p.count > 1 ? `${name}（第 ${p.drawn + 1} / ${p.count} 位）` : name
})

function addPrize() {
  prizes.value.push({ id: crypto.randomUUID(), name: '', count: 1, drawn: 0 })
}

function removePrize(id: string) {
  prizes.value = prizes.value.filter((p) => p.id !== id)
}

/* ---------------- 轉盤 ---------------- */

const canSpin = computed(() => !spinning.value && entries.value.length > 0 && !prizesDone.value)

/** 用 crypto 取亂數並去掉尾巴，避免 % 造成前面幾格機率略高 */
function pickIndex(n: number): number {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  let v = 0
  do {
    crypto.getRandomValues(buf)
    v = buf[0]
  } while (v >= limit)
  return v % n
}

function spin() {
  if (!canSpin.value) return
  // 上一位中獎者到這時才真的離開名單，轉盤才不會在公布的瞬間跳掉
  if (pendingRemove.value) {
    const gone = pendingRemove.value
    entries.value = entries.value.filter((n) => n !== gone)
    pendingRemove.value = null
  }
  if (!entries.value.length) return

  error.value = ''
  message.value = ''
  winner.value = null
  spinning.value = true
  if (!wheel.value?.spin(pickIndex(entries.value.length))) {
    spinning.value = false
  }
}

function onFinish(index: number) {
  spinning.value = false
  const name = entries.value[index]
  if (!name) return

  const prize = currentPrize.value
  const record: WinRecord = {
    name,
    prize: prize ? prize.name.trim() : '',
    at: new Date().toISOString(),
  }
  winner.value = record
  history.value.unshift(record)
  if (prize) prize.drawn += 1
  if (removeAfterWin.value) pendingRemove.value = name
}

/* ---------------- 重來 ---------------- */

/** 把中獎的人放回名單、獎項歸零，同一批名單就能重抽 */
function resetDraw() {
  if (spinning.value || !history.value.length) return
  if (!confirm('確定要重置嗎？抽獎紀錄會清空，中獎者會放回名單。')) return
  addNames(history.value.map((h) => h.name))
  history.value = []
  prizes.value.forEach((p) => (p.drawn = 0))
  pendingRemove.value = null
  winner.value = null
  message.value = '已重置，可以重新開抽'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4 border-b border-blossom-200 pb-4">
      <div>
        <p class="section-subtitle text-left">LUCKY DRAW</p>
        <h1 class="font-serif text-2xl text-blossom-600">幸運轉盤</h1>
      </div>
      <RouterLink :to="{ name: 'admin-games' }" class="btn btn-ghost btn-sm">回後台</RouterLink>
    </div>

    <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>
    <p v-if="message" class="text-sm text-sage-600">{{ message }}</p>

    <div class="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <!-- 轉盤 -->
      <div class="card space-y-5 p-5 sm:p-7">
        <div class="text-center">
          <p class="section-subtitle">{{ prizeLabel ? 'NOW DRAWING' : 'READY' }}</p>
          <h2 class="font-serif text-xl text-blossom-600">{{ prizeLabel || '準備開抽' }}</h2>
          <p class="mt-1 text-xs font-light text-ink-400">
            名單共 {{ entries.length }} 人<span v-if="history.length">
              · 已抽出 {{ history.length }} 位</span
            >
          </p>
        </div>

        <LuckyWheel ref="wheel" :names="entries" @finish="onFinish" />

        <div class="text-center">
          <button class="btn btn-primary" :disabled="!canSpin" @click="spin">
            {{ spinning ? '轉動中…' : '開始抽獎' }}
          </button>
          <p v-if="prizesDone" class="mt-3 text-sm text-ink-600">
            所有獎項都抽完了，可以新增獎品或按重置再來一輪。
          </p>
          <p v-else-if="!entries.length" class="mt-3 text-sm text-ink-600">
            先從右邊載入問答場次的名單，或手動輸入名字。
          </p>
        </div>

        <!-- 中獎公布 -->
        <div
          v-if="winner && !spinning"
          class="wheel-winner rounded-2xl border border-sand-300 bg-sand-100 px-5 py-6 text-center"
        >
          <p class="section-subtitle">CONGRATULATIONS</p>
          <p class="mt-1 font-serif text-3xl text-blossom-600">{{ winner.name }}</p>
          <p v-if="winner.prize" class="mt-2 text-sm text-ink-800">獲得「{{ winner.prize }}」</p>
        </div>
      </div>

      <!-- 名單 -->
      <div class="card space-y-6 p-5 sm:p-7">
        <div>
          <h2 class="mb-2 font-serif text-lg text-blossom-600">抽獎名單</h2>
          <p class="text-sm font-light text-ink-600">
            答題結束後大家的名字都在場次裡，選一場載入就好；重複的名字會自動略過。
          </p>
        </div>

        <div class="space-y-2">
          <label class="block text-xs tracking-widest text-ink-400">從問答場次載入</label>
          <div class="flex flex-wrap gap-2">
            <select v-model="selectedGameId" class="field min-w-0 flex-1">
              <option value="">選擇場次…</option>
              <option v-for="g in gameOptions" :key="g.id" :value="g.id">{{ g.label }}</option>
            </select>
            <button
              class="btn btn-ghost flex-none"
              :disabled="!selectedGameId || loading || spinning"
              @click="loadFromGame"
            >
              {{ loading ? '載入中…' : '載入名單' }}
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <label class="block text-xs tracking-widest text-ink-400">手動加入（一行一位）</label>
          <textarea
            v-model="manualInput"
            rows="3"
            class="field resize-y"
            placeholder="小美&#10;阿哲&#10;Risa"
          ></textarea>
          <button class="btn btn-ghost btn-sm" :disabled="spinning" @click="addManual">
            加入名單
          </button>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between gap-3">
            <span class="text-xs tracking-widest text-ink-400">
              目前名單（{{ entries.length }}）
            </span>
            <button
              v-if="entries.length"
              class="text-xs text-blossom-600 transition-colors hover:text-blossom-700"
              :disabled="spinning"
              @click="clearNames"
            >
              清空
            </button>
          </div>
          <div
            v-if="entries.length"
            class="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-2xl bg-blossom-50 p-3"
          >
            <span
              v-for="name in entries"
              :key="name"
              class="name-chip"
              :class="{ 'name-chip-won': name === pendingRemove }"
            >
              {{ name }}
              <button type="button" :aria-label="`移除 ${name}`" @click="removeName(name)">×</button>
            </span>
          </div>
          <p
            v-else
            class="rounded-2xl bg-blossom-50 p-6 text-center text-sm font-light text-ink-400"
          >
            名單是空的
          </p>
        </div>

        <label class="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
          <input
            v-model="removeAfterWin"
            type="checkbox"
            class="h-4 w-4 flex-none accent-blossom-500"
          />
          抽中後從名單移除（不重複中獎）
        </label>
      </div>
    </div>

    <!-- 獎品品項 -->
    <section class="card p-5 sm:p-7">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-serif text-lg text-blossom-600">獎品品項</h2>
        <button class="btn btn-ghost btn-sm" :disabled="spinning" @click="addPrize">新增獎品</button>
      </div>
      <p class="mb-4 text-sm font-light text-ink-600">
        由上往下依序開抽，一個獎項抽滿名額才會換下一個。不填也可以，那就是單純抽名字。
      </p>

      <ul v-if="prizes.length" class="space-y-3">
        <li
          v-for="p in prizes"
          :key="p.id"
          class="flex flex-wrap items-center gap-3"
          :class="{ 'opacity-50': p.drawn >= p.count }"
        >
          <input
            v-model="p.name"
            type="text"
            class="field min-w-0 flex-1"
            placeholder="獎品名稱，例如：頭獎 藍牙耳機"
            :disabled="spinning"
          />
          <div class="flex flex-none items-center gap-2">
            <input
              v-model.number="p.count"
              type="number"
              min="1"
              max="99"
              class="field w-20 text-center"
              :disabled="spinning"
            />
            <span class="text-xs text-ink-400">名額</span>
          </div>
          <span class="flex-none text-xs text-ink-400">已抽 {{ p.drawn }}</span>
          <button
            class="btn btn-danger btn-sm flex-none"
            :disabled="spinning"
            @click="removePrize(p.id)"
          >
            移除
          </button>
        </li>
      </ul>
      <p v-else class="text-sm font-light text-ink-400">尚未設定獎品</p>
    </section>

    <!-- 抽獎紀錄 -->
    <section>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-serif text-lg text-blossom-600">抽獎紀錄（{{ history.length }}）</h2>
        <button
          v-if="history.length"
          class="btn btn-ghost btn-sm"
          :disabled="spinning"
          @click="resetDraw"
        >
          重置（中獎者放回名單）
        </button>
      </div>

      <div v-if="!history.length" class="card p-8 text-center text-sm font-light text-ink-400">
        還沒有抽出任何人
      </div>

      <ol v-else class="card divide-y divide-blossom-200 px-5 py-2 sm:px-6">
        <li
          v-for="(h, i) in history"
          :key="h.at + h.name"
          class="flex flex-wrap items-center gap-3 py-3"
        >
          <span class="w-8 flex-none font-serif text-blossom-500">{{ history.length - i }}</span>
          <span class="min-w-0 flex-1 text-ink-800">{{ h.name }}</span>
          <span v-if="h.prize" class="flex-none text-sm text-ink-600">{{ h.prize }}</span>
          <span class="flex-none text-xs text-ink-400">{{ formatTime(h.at) }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>
