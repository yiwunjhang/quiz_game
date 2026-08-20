<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AdminNav from '../components/AdminNav.vue'
import {
  listHostApplications,
  reviewHostApplication,
  type HostApplication,
} from '../db/api'

const apps = ref<HostApplication[]>([])
const notes = ref<Record<number, string>>({})
const loading = ref(true)
const busyId = ref<number | null>(null)
const error = ref('')
const message = ref('')

const pending = computed(() => apps.value.filter((a) => a.status === 'pending'))
const reviewed = computed(() => apps.value.filter((a) => a.status !== 'pending'))

async function refresh() {
  try {
    apps.value = await listHostApplications()
    error.value = ''
  } catch (e: any) {
    error.value = e?.message ?? '載入申請失敗'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })
}

async function review(app: HostApplication, approve: boolean) {
  const verb = approve ? '核准' : '婉拒'
  if (!confirm(`確定要${verb}「${app.nickname}」的主持人申請嗎？`)) return
  busyId.value = app.id
  error.value = ''
  message.value = ''
  try {
    await reviewHostApplication(app.id, approve, notes.value[app.id])
    message.value = `已${verb}「${app.nickname}」的申請`
    delete notes.value[app.id]
    await refresh()
  } catch (e: any) {
    error.value = e?.message ?? '審核失敗'
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <AdminNav title="主持人申請" />

    <p v-if="error" class="text-sm text-blossom-600">{{ error }}</p>
    <p v-if="message" class="text-sm text-sage-600">{{ message }}</p>

    <div v-if="loading" class="flex justify-center py-16">
      <div class="loader-ring"></div>
    </div>

    <template v-else>
      <section>
        <h2 class="mb-4 font-serif text-lg text-blossom-600">
          待審核（{{ pending.length }}）
        </h2>

        <div
          v-if="pending.length === 0"
          class="card p-8 text-center text-sm font-light text-ink-400"
        >
          目前沒有待審核的申請
        </div>

        <ul v-else class="space-y-3">
          <li v-for="a in pending" :key="a.id" class="card p-5 sm:p-6">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="font-medium text-ink-900">{{ a.nickname }}</p>
              <p class="text-xs tracking-widest text-ink-400">{{ formatDate(a.created_at) }}</p>
            </div>

            <p class="mt-2 whitespace-pre-wrap text-sm font-light text-ink-600">
              {{ a.reason || '（未填寫申請說明）' }}
            </p>

            <input
              v-model="notes[a.id]"
              type="text"
              maxlength="200"
              placeholder="審核備註（選填，會顯示給申請人）"
              class="field mt-4 text-sm"
            />

            <div class="mt-3 flex flex-wrap gap-2">
              <button
                class="btn btn-primary btn-sm"
                :disabled="busyId === a.id"
                @click="review(a, true)"
              >
                核准
              </button>
              <button
                class="btn btn-ghost btn-sm"
                :disabled="busyId === a.id"
                @click="review(a, false)"
              >
                婉拒
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="reviewed.length">
        <h2 class="mb-4 font-serif text-lg text-blossom-600">已審核</h2>
        <ul class="card divide-y divide-blossom-200 px-5 py-2 sm:px-6">
          <li v-for="a in reviewed" :key="a.id" class="flex items-center gap-4 py-3">
            <span class="min-w-0 flex-1 truncate text-sm text-ink-800">
              {{ a.nickname }}
              <span v-if="a.review_note" class="text-xs font-light text-ink-400">
                · {{ a.review_note }}
              </span>
            </span>
            <span
              class="flex-none text-xs tracking-widest"
              :class="a.status === 'approved' ? 'text-sage-600' : 'text-ink-400'"
            >
              {{ a.status === 'approved' ? '已核准' : '已婉拒' }}
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
