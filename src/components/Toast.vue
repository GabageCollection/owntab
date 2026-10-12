<script setup lang="ts">
defineProps<{message:string;kind:'success'|'error'}>();
</script>
<template><div class="toast" :class="kind" role="status"><span aria-hidden="true">{{ kind === 'success' ? '✓' : '✕' }}</span><span>{{ message }}</span></div></template>
