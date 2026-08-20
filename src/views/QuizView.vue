<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  getQuestions,
  recordAttempt,
  clearAttempts,
  type Question,
} from '../db/database'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const session = useSessionStore()

const questions = ref<Question[]>([])
const index = ref(0)
const selected = ref<number | null>(null)
const answered = ref(false)
const correctCount = ref(0)

const current = computed(() => questions.value[index.value])
const progress = computed(() =>
  questions.value.length ? Math.round((index.value / questions.value.length) * 100) : 0,
)

onMounted(() => {
  questions.value = getQuestions()
  // 每次進入測驗清空舊紀錄，重新計分
  if (session.currentUser) clearAttempts(session.currentUser.id)
})

function choose(i: number) {
  if (answered.value) return
  selected.value = i
  answered.value = true
  const isCorrect = i === current.value.correct_index
  if (isCorrect) correctCount.value++
  if (session.currentUser) {
    recordAttempt(session.currentUser.id, current.value.id, i, isCorrect)
  }
}

function next() {
  if (index.value < questions.value.length - 1) {
    index.value++
    selected.value = null
    answered.value = false
  } else {
    router.push({ name: 'result' })
  }
}

function optionClass(i: number): string {
  if (!answered.value) return 'border-white/10 hover:border-indigo-400 hover:bg-white/5'
  if (i === current.value.correct_index) return 'border-emerald-400 bg-emerald-500/20'
  if (i === selected.value) return 'border-rose-400 bg-rose-500/20'
  return 'border-white/10 opacity-60'
}
</script>

<template>
  <div v-if="questions.length === 0" class="text-center py-20 text-slate-300">
    <p class="text-lg">題庫目前沒有題目 😅</p>
    <p class="text-sm text-slate-500 mt-2">請先到「後台」新增題目。</p>
  </div>

  <div v-else class="max-w-2xl mx-auto">
    <!-- 進度 -->
    <div class="mb-6">
      <div class="flex justify-between text-sm text-slate-400 mb-1">
        <span>第 {{ index + 1 }} / {{ questions.length }} 題</span>
        <span>已答對 {{ correctCount }}</span>
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
          class="w-full text-left rounded-xl border px-4 py-3 transition flex items-center gap-3"
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

      <div v-if="answered" class="mt-6 flex items-center justify-between">
        <p
          class="text-sm font-medium"
          :class="selected === current.correct_index ? 'text-emerald-400' : 'text-rose-400'"
        >
          {{ selected === current.correct_index ? '✅ 答對了！' : '❌ 答錯了' }}
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
