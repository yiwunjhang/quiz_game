<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  getQuestionsAdmin,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  type Question,
} from '../db/api'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const questions = ref<Question[]>([])
const editingId = ref<number | null>(null)
const text = ref('')
const options = ref<string[]>(['', '', '', ''])
const correctIndex = ref(0)
const error = ref('')
const message = ref('')
const busy = ref(false)

async function refresh() {
  try {
    questions.value = await getQuestionsAdmin()
  } catch (e: any) {
    error.value = e?.message ?? '載入題庫失敗'
  }
}

onMounted(refresh)

function resetForm() {
  editingId.value = null
  text.value = ''
  options.value = ['', '', '', '']
  correctIndex.value = 0
  error.value = ''
}

function addOption() {
  if (options.value.length < 6) options.value.push('')
}

function removeOption(i: number) {
  if (options.value.length <= 2) return
  options.value.splice(i, 1)
  if (correctIndex.value >= options.value.length) correctIndex.value = 0
}

async function save() {
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    const opts = options.value.map((o) => o.trim())
    if (editingId.value != null) {
      await updateQuestion(editingId.value, text.value, opts, correctIndex.value)
      message.value = '題目已更新'
    } else {
      await addQuestion(text.value, opts, correctIndex.value)
      message.value = '題目已新增'
    }
    resetForm()
    await refresh()
  } catch (e: any) {
    error.value = e?.message ?? '儲存失敗'
  } finally {
    busy.value = false
  }
}

function edit(q: Question) {
  editingId.value = q.id
  text.value = q.text
  options.value = [...q.options]
  correctIndex.value = q.correct_index
  error.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function remove(q: Question) {
  if (!confirm(`確定要刪除題目「${q.text}」嗎？`)) return
  busy.value = true
  try {
    await deleteQuestion(q.id)
    if (editingId.value === q.id) resetForm()
    await refresh()
  } catch (e: any) {
    error.value = e?.message ?? '刪除失敗'
  } finally {
    busy.value = false
  }
}

async function logout() {
  await session.logout()
  router.push({ name: 'home' })
}

/* ---- 匯出 / 匯入 ---- */
function exportJson() {
  const data = JSON.stringify(
    questions.value.map((q) => ({
      text: q.text,
      options: q.options,
      correct_index: q.correct_index,
    })),
    null,
    2,
  )
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'questions.json'
  a.click()
  URL.revokeObjectURL(url)
}

const fileInput = ref<HTMLInputElement | null>(null)

async function importJson(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  error.value = ''
  message.value = ''
  busy.value = true
  try {
    const arr = JSON.parse(await file.text())
    if (!Array.isArray(arr)) throw new Error('格式不正確')
    let ok = 0
    for (const item of arr) {
      if (item?.text && Array.isArray(item.options)) {
        await addQuestion(item.text, item.options, Number(item.correct_index) || 0)
        ok++
      }
    }
    message.value = `已匯入 ${ok} 題`
    await refresh()
  } catch (err: any) {
    error.value = '匯入失敗：' + (err?.message ?? '未知錯誤')
  } finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-black text-plum-800">⚙️ 題庫管理</h1>
      <button class="btn btn-ghost btn-sm" @click="logout">登出後台</button>
    </div>

    <!-- 表單 -->
    <div class="glass glass-strong p-6">
      <h2 class="mb-4 text-lg font-extrabold text-plum-700">
        {{ editingId != null ? '編輯題目' : '新增題目' }}
      </h2>

      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-sm font-semibold text-plum-600">題目內容</label>
          <textarea v-model="text" rows="2" placeholder="輸入題目…" class="field"></textarea>
        </div>

        <div>
          <label class="mb-2 block text-sm font-semibold text-plum-600">
            選項（點選左側標記正確答案）
          </label>
          <div class="space-y-2">
            <div v-for="(_, i) in options" :key="i" class="flex items-center gap-2">
              <button
                type="button"
                class="grid h-9 w-9 flex-none place-items-center rounded-full border-2 text-xs font-bold transition"
                :class="
                  correctIndex === i
                    ? 'border-mint-400 bg-mint-200 text-mint-500'
                    : 'border-white/70 bg-white/40 text-plum-400 hover:border-blush-300'
                "
                title="設為正確答案"
                @click="correctIndex = i"
              >
                {{ String.fromCharCode(65 + i) }}
              </button>
              <input
                v-model="options[i]"
                type="text"
                :placeholder="'選項 ' + String.fromCharCode(65 + i)"
                class="field flex-1"
              />
              <button
                type="button"
                class="h-9 w-9 flex-none rounded-full bg-white/50 text-plum-400 transition hover:bg-blush-200 disabled:opacity-30"
                :disabled="options.length <= 2"
                @click="removeOption(i)"
              >
                ✕
              </button>
            </div>
          </div>
          <button
            v-if="options.length < 6"
            type="button"
            class="mt-2 text-sm font-semibold text-lilac-500 hover:text-lilac-400"
            @click="addOption"
          >
            + 新增選項
          </button>
        </div>

        <p v-if="error" class="text-sm font-semibold text-blush-600">{{ error }}</p>
        <p v-if="message" class="text-sm font-semibold text-mint-500">{{ message }}</p>

        <div class="flex gap-2">
          <button :disabled="busy" class="btn btn-primary" @click="save">
            {{ editingId != null ? '更新題目' : '新增題目' }}
          </button>
          <button v-if="editingId != null" class="btn btn-ghost" @click="resetForm">
            取消編輯
          </button>
        </div>
      </div>
    </div>

    <!-- 匯出 / 匯入 -->
    <div class="flex flex-wrap items-center gap-3">
      <button class="btn btn-ghost btn-sm" @click="exportJson">⬇️ 匯出題庫 JSON</button>
      <label class="btn btn-ghost btn-sm cursor-pointer">
        ⬆️ 匯入題庫 JSON
        <input
          ref="fileInput"
          type="file"
          accept="application/json"
          class="hidden"
          @change="importJson"
        />
      </label>
    </div>

    <!-- 題目列表 -->
    <div>
      <h2 class="mb-3 text-lg font-extrabold text-plum-700">
        目前題庫（{{ questions.length }} 題）
      </h2>
      <div v-if="questions.length === 0" class="glass p-8 text-center text-sm text-plum-400">
        尚無題目。
      </div>
      <ol v-else class="space-y-3">
        <li v-for="(q, qi) in questions" :key="q.id" class="glass p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <p class="font-extrabold text-plum-700">{{ qi + 1 }}. {{ q.text }}</p>
              <ul class="mt-2 space-y-1 text-sm">
                <li
                  v-for="(opt, oi) in q.options"
                  :key="oi"
                  :class="oi === q.correct_index ? 'font-bold text-mint-500' : 'text-plum-400'"
                >
                  {{ String.fromCharCode(65 + oi) }}. {{ opt }}
                  <span v-if="oi === q.correct_index">✓</span>
                </li>
              </ul>
            </div>
            <div class="flex flex-none flex-col gap-2">
              <button class="btn btn-ghost btn-sm" @click="edit(q)">編輯</button>
              <button :disabled="busy" class="btn btn-danger btn-sm" @click="remove(q)">
                刪除
              </button>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
