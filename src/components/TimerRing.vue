<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 剩餘秒數 */
    seconds: number
    /** 剩餘比例 0~1 */
    ratio: number
    size?: number
  }>(),
  { size: 88 },
)

const RADIUS = 40
const CIRC = 2 * Math.PI * RADIUS

const offset = computed(() => CIRC * (1 - Math.min(1, Math.max(0, props.ratio))))
const urgent = computed(() => props.seconds <= 5)
</script>

<template>
  <div
    class="relative flex-none"
    :style="{ width: size + 'px', height: size + 'px' }"
    :class="urgent ? 'animate-soft-pulse' : ''"
  >
    <svg class="timer-ring w-full h-full" viewBox="0 0 100 100">
      <circle
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="rgba(255,255,255,0.45)"
        stroke="rgba(255,255,255,0.85)"
        stroke-width="9"
      />
      <circle
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        :stroke="urgent ? '#fa6ea6' : '#b391ff'"
        stroke-width="9"
        stroke-linecap="round"
        :stroke-dasharray="CIRC"
        :stroke-dashoffset="offset"
      />
    </svg>
    <div class="absolute inset-0 grid place-items-center">
      <span
        class="font-extrabold tabular-nums"
        :class="urgent ? 'text-blush-600' : 'text-plum-700'"
        :style="{ fontSize: size * 0.34 + 'px' }"
      >
        {{ Math.max(0, seconds) }}
      </span>
    </div>
  </div>
</template>
