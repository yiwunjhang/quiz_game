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
  <div class="relative flex-none" :style="{ width: size + 'px', height: size + 'px' }">
    <svg class="timer-ring h-full w-full" viewBox="0 0 100 100">
      <circle cx="50" cy="50" :r="RADIUS" fill="#fff" stroke="#ffe8e6" stroke-width="4" />
      <circle
        cx="50"
        cy="50"
        :r="RADIUS"
        fill="none"
        :stroke="urgent ? '#c96060' : '#ed9191'"
        stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="CIRC"
        :stroke-dashoffset="offset"
      />
    </svg>
    <div class="absolute inset-0 grid place-items-center">
      <span
        class="font-serif tabular-nums"
        :class="[urgent ? 'text-blossom-600 animate-soft-pulse' : 'text-blossom-500']"
        :style="{ fontSize: size * 0.36 + 'px' }"
      >
        {{ Math.max(0, seconds) }}
      </span>
    </div>
  </div>
</template>
