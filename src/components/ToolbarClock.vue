<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
const now = ref(new Date());
let timer: ReturnType<typeof setInterval>;
onMounted(() => timer = setInterval(() => now.value = new Date(), 1000));
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <time class="clock" :datetime="now.toISOString()" :title="now.toLocaleDateString(undefined, { dateStyle: 'full' })">
    <span class="clock-time">{{ now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }}</span>
    <span class="clock-date muted">{{ now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', weekday: 'short' }) }}</span>
  </time>
</template>
