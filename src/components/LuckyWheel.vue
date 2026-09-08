<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 幸運轉盤。指針固定在正上方，轉的是整個輪盤。
 *
 * 中獎者由呼叫端先決定（spin(index)），這裡只負責把該扇形轉到指針下方，
 * 這樣「抽誰」與「怎麼轉」分開，動畫再怎麼調都不會影響抽選的公平性。
 */
const props = defineProps<{ names: string[] }>()
// 回報名字而不只是索引：這是轉盤實際畫出來、指針真正停住的那一格，
// 父層就不必再用索引去猜自己的名單，兩邊也不會因為順序不同而對不上
const emit = defineEmits<{ (e: 'finish', name: string, index: number): void }>()

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

/** 名字的外端貼著外圈，往圓心方向排 */
const LABEL_OUTER = R - 8

/**
 * 字級由扇形「靠近外圈處的弧寬」決定。名字是沿半徑排的，所以限制字高的是
 * 扇形的角寬而不是半徑長度 —— 80 人時每格 4.5°，在半徑 80 處仍有約 6.3 個
 * 單位的弧寬，塞得下字，不需要整個放棄標示。
 */
const fontSize = computed(() => {
  const arc = (2 * Math.PI * (LABEL_OUTER - 8) * segAngle.value) / 360
  return Math.min(7, Math.max(2.2, arc * 0.72))
})

/**
 * 扇形越靠圓心越窄，字排過頭就會跟隔壁擠在一起，
 * 所以可用長度只算到「弧寬還容得下一個字」的那個半徑為止。
 */
const maxChars = computed(() => {
  const rMin = Math.min(
    LABEL_OUTER - 8,
    (fontSize.value * 360) / (2 * Math.PI * segAngle.value),
  )
  return Math.max(2, Math.floor((LABEL_OUTER - rMin) / fontSize.value))
})

/** 字小到看不出來才放棄標字，只留顏色，改由右側名單對照 */
const showLabels = computed(() => count.value > 0 && fontSize.value >= 2.4)

/** 格子多的時候白色分隔線會吃掉可見寬度，收細一點 */
const strokeWidth = computed(() => (count.value > 40 ? 0.25 : 0.6))

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
      x: flip ? CENTER - LABEL_OUTER : CENTER + LABEL_OUTER,
      anchor: flip ? 'start' : 'end',
      text: clip(name),
    }
    return { i, key: `${i}-${name}`, d, fill, label, name }
  }),
)

const spinning = computed(() => pendingIndex.value !== null)

/* -------- 滑鼠移到扇形上直接看名字 -------- */
// 名單一多字就很小（80 人時約 10px），滑過去放大顯示才看得清楚是誰
const hovered = ref<number | null>(null)
const tipEl = ref<HTMLElement | null>(null)

const hoveredName = computed(() =>
  hovered.value === null ? '' : (props.names[hovered.value] ?? ''),
)

// 轉動中不顯示，跟著飛的提示只會干擾
function onSegmentEnter(i: number) {
  if (!spinning.value) hovered.value = i
}

// 直接寫 DOM 樣式，不走響應式。否則滑鼠每動一次就會讓整個轉盤
// （80 人時就是 80 個扇形）重新 diff 一輪。
function onMove(e: MouseEvent) {
  const el = tipEl.value
  if (!el) return
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  el.style.left = `${e.clientX - box.left}px`
  el.style.top = `${e.clientY - box.top}px`
}

function clearHover() {
  hovered.value = null
}

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

  hovered.value = null
  pendingIndex.value = index
  durationMs.value = reduceMotion ? 600 : 5200
  rotation.value = next
  return true
}

function onTransitionEnd(e: TransitionEvent) {
  if (e.propertyName !== 'transform') return
  const index = pendingIndex.value
  pendingIndex.value = null
  if (index !== null) emit('finish', props.names[index] ?? '', index)
}

defineExpose({ spin, spinning })
</script>

<template>
  <div class="wheel" @mousemove="onMove" @mouseleave="clearHover">
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
            <path
              :d="s.d"
              :fill="s.fill"
              :stroke="hovered === s.i ? '#c96060' : '#fff'"
              :stroke-width="hovered === s.i ? 1 : strokeWidth"
              @mouseenter="onSegmentEnter(s.i)"
            />
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

    <!-- 跟著游標的名字提示。pointer-events: none，才不會把 hover 搶走 -->
    <div v-show="hoveredName" ref="tipEl" class="wheel-tip">{{ hoveredName }}</div>

    <p v-if="!count" class="wheel-empty">名單是空的</p>
  </div>
</template>
