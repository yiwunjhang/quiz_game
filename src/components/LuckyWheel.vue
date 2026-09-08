<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 幸運轉盤。指針固定在正上方，轉的是整個輪盤。
 *
 * 中獎者由呼叫端先決定（spin(index)），這裡只負責把該扇形轉到指針下方，
 * 這樣「抽誰」與「怎麼轉」分開，動畫再怎麼調都不會影響抽選的公平性。
 */
const props = defineProps<{ names: string[] }>()
const emit = defineEmits<{ (e: 'finish', index: number): void }>()

/** 累加的角度，只會愈轉愈大，才不會出現倒轉 */
const rotation = ref(0)
const durationMs = ref(0)
const pendingIndex = ref<number | null>(null)

const R = 96
const CENTER = 100

/** 低彩度馬卡龍色票，與答案磚同一套溫度 */
const PALETTE = ['#ffd7d2', '#fae3c6', '#dfeadd', '#dbe7f0', '#ecdff2', '#fbe0ea']

const count = computed(() => props.names.length)
const segAngle = computed(() => (count.value ? 360 / count.value : 360))

/** 扇形太細就放棄標字，只留顏色，改由右側名單對照 */
const showLabels = computed(() => count.value > 0 && count.value <= 48)

const fontSize = computed(() => Math.min(8, Math.max(3, segAngle.value * 0.42)))

/** 名字沿著半徑排，可用長度大約是 76 個單位 */
const maxChars = computed(() => Math.max(2, Math.floor(76 / fontSize.value)))

function pointOn(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)]
}

function clip(name: string) {
  return name.length > maxChars.value ? name.slice(0, maxChars.value - 1) + '…' : name
}

const segments = computed(() =>
  props.names.map((name, i) => {
    const seg = segAngle.value
    const start = i * seg
    const end = start + seg
    const mid = start + seg / 2
    const [x1, y1] = pointOn(start, R)
    const [x2, y2] = pointOn(end, R)
    // 只有一個人時畫不出扇形，直接鋪滿整個圓
    const d =
      count.value === 1
        ? `M ${CENTER} ${CENTER - R} A ${R} ${R} 0 1 1 ${CENTER - 0.01} ${CENTER - R} Z`
        : `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`

    let fill = PALETTE[i % PALETTE.length]
    // 收尾撞色會看不出最後一格，往後挪一個色
    if (i === count.value - 1 && i > 0 && fill === PALETTE[0]) {
      fill = PALETTE[(i + 1) % PALETTE.length]
    }

    // 字從外圈往圓心排；左半圈整個翻面，才不會變成上下顛倒
    const flip = mid > 180
    const label = {
      transform: `rotate(${flip ? mid + 90 : mid - 90} ${CENTER} ${CENTER})`,
      x: flip ? CENTER - (R - 8) : CENTER + (R - 8),
      anchor: flip ? 'start' : 'end',
      text: clip(name),
    }
    return { key: `${i}-${name}`, d, fill, label }
  }),
)

const spinning = computed(() => pendingIndex.value !== null)

/** 把第 index 格轉到指針下方。轉動中或名單是空的就不受理 */
function spin(index: number) {
  if (spinning.value || !count.value) return false
  const seg = segAngle.value
  // 不要每次都停在正中央，在扇形內隨機偏一點比較像真的在轉
  const jitter = (Math.random() - 0.5) * seg * 0.7
  const target = -(index * seg + seg / 2 + jitter)
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const turns = reduceMotion ? 1 : 5 + Math.floor(Math.random() * 3)

  let next = target
  while (next < rotation.value + turns * 360) next += 360

  pendingIndex.value = index
  durationMs.value = reduceMotion ? 600 : 5200
  rotation.value = next
  return true
}

function onTransitionEnd(e: TransitionEvent) {
  if (e.propertyName !== 'transform') return
  const index = pendingIndex.value
  pendingIndex.value = null
  if (index !== null) emit('finish', index)
}

defineExpose({ spin, spinning })
</script>

<template>
  <div class="wheel">
    <!-- 指針：固定在正上方，指著停下來的那一格 -->
    <div class="wheel-pointer" aria-hidden="true"></div>

    <svg viewBox="0 0 200 200" class="wheel-svg" role="img" aria-label="幸運轉盤">
      <circle :cx="CENTER" :cy="CENTER" :r="R + 3" fill="#fff" stroke="#ffe8e6" stroke-width="2" />

      <g
        class="wheel-rotor"
        :style="{
          transform: `rotate(${rotation}deg)`,
          transitionDuration: durationMs + 'ms',
        }"
        @transitionend="onTransitionEnd"
      >
        <template v-if="count">
          <g v-for="s in segments" :key="s.key">
            <path :d="s.d" :fill="s.fill" stroke="#fff" stroke-width="0.6" />
            <text
              v-if="showLabels"
              :transform="s.label.transform"
              :x="s.label.x"
              :y="CENTER"
              :font-size="fontSize"
              :text-anchor="s.label.anchor"
              dominant-baseline="middle"
              fill="#524a45"
            >
              {{ s.label.text }}
            </text>
          </g>
        </template>
        <circle v-else :cx="CENTER" :cy="CENTER" :r="R" fill="#fff0ee" />
      </g>

      <!-- 中心軸心 -->
      <circle :cx="CENTER" :cy="CENTER" r="13" fill="#fff" stroke="#ed9191" stroke-width="2" />
      <circle :cx="CENTER" :cy="CENTER" r="4.5" fill="#ed9191" />
    </svg>

    <p v-if="!count" class="wheel-empty">名單是空的</p>
  </div>
</template>
