<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getQuizQuestions, submitAnswer, type PublicQuestion } from '../db/api'

const router = useRouter()

const questions = ref<PublicQuestion[]>([])
const index = ref(0)
const selected = ref<number | null>(null)
const correctIndex = ref<number | null>(null)
const answered = ref(false)
const correctCount = ref(0)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

const current = computed(() => questions.value[index.value])
const progress = computed(() =>
  questions.value.length ? Math.round((index.value / questions.value.length) * 100) : 0,
)

onMounted(async () => {
  try {
    questions.value = await getQuizQuestions()
  } catch (e: any) {
    error.value = e?.message ?? '載入題目失敗'
  } finally {
    loading.value = false
  }
})

async function choose(i: number) {
  if (answered.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await submitAnswer(current.value.id, i)
    selected.value = i
    correctIndex.value = res.correctIndex
    answered.value = true
    if (res.isCorrect) correctCount.value++
  } catch (e: any) {
    error.value = e?.message ?? '送出失敗'
  } finally {
    submitting.value = false
  }
}

function next() {
  if (index.value < questions.value.length - 1) {
    index.value++
    selected.value = null
    correctIndex.value = null
    answered.value = false
  } else {
    router.push({ name: 'result' })
  }
}

function optionClass(i: number): string {
  if (!answered.value) return 'border-white/10 hover:border-indigo-400 hover:bg-white/5'
  if (i === correctIndex.value) return 'border-emerald-400 bg-emerald-500/20'
  if (i === selected.value) return 'border-rose-400 bg-rose-500/20'
  return 'border-white/10 opacity-60'
}
</script>

<template>
  <div v-if="loading" class="text-center py-20 text-slate-400">載入題目中…</div>

  <div v-else-if="error" class="text-center py-20 text-rose-400">{{ error }}</div>

  <div v-else-if="questions.length === 0" class="text-center py-20 text-slate-300">
    <p class="text-4xl mb-3">🎉</p>
    <p class="text-lg">你已完成所有題目！</p>
    <button
      class="mt-6 rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold px-6 py-2.5 transition"
      @click="router.push({ name: 'leaderboard' })"
    >
      查看排行榜 🏆
    </button>
  </div>

  <div v-else class="max-w-2xl mx-auto">
    <!-- 進度 -->
    <div class="mb-6">
      <div class="flex justify-between text-sm text-slate-400 mb-1">
        <span>第 {{ index + 1 }} / {{ questions.length }} 題</span>
        <span>本次已答對 {{ correctCount }}</span>
      </div>
      <div class="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          class="h-full bg-indigo-500 transition-all duration-300"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
    </div>

    <!-- 題目 -->
    <div class="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl">
      <h2 class="text-xl font-bold mb-6">{{ current.text }}</h2>
      <div class="space-y-3">
        <button
          v-for="(opt, i) in current.options"
          :key="i"
          :disabled="submitting || answered"
          class="w-full text-left rounded-xl border px-4 py-3 transition flex items-center gap-3 disabled:cursor-default"
          :class="optionClass(i)"
          @click="choose(i)"
        >
          <span
            class="flex-none w-7 h-7 rounded-full bg-white/10 grid place-items-center text-sm font-bold"
          >
            {{ String.fromCharCode(65 + i) }}
          </span>
          <span>{{ opt }}</span>
        </button>
      </div>

      <p v-if="error" class="mt-4 text-sm text-rose-400">{{ error }}</p>

      <div v-if="answered" class="mt-6 flex items-center justify-between">
        <p
          class="text-sm font-medium"
          :class="selected === correctIndex ? 'text-emerald-400' : 'text-rose-400'"
        >
          {{ selected === correctIndex ? '✅ 答對了！' : '❌ 答錯了' }}
        </p>
        <button
          class="rounded-lg bg-indigo-500 hover:bg-indigo-400 font-semibold px-5 py-2 transition"
          @click="next"
        >
          {{ index < questions.length - 1 ? '下一題 →' : '看結果 🎉' }}
        </button>
      </div>
    </div>
  </div>
</template>
