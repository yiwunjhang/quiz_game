<script setup lang="ts">
import heroArt from '../images/S__116113414.png'
import IconStars from './IconStars.vue'
</script>

<template>
  <!-- 星星用 % 定位與縮放，開場（320px）與桌機（384px）兩種尺寸都對得上 -->
  <div class="hero-art">
    <img
      :src="heroArt"
      class="hero-art-img"
      alt="兩位玩家一起玩問答派對的插畫"
      width="1455"
      height="1124"
    />
    <IconStars class="hero-star hero-star-1" />
    <IconStars class="hero-star hero-star-2" />
    <IconStars class="hero-star hero-star-3" />
  </div>
</template>
