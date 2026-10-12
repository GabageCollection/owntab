<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string,string> = { folder:'M3 7V5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z', settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z', moon:'M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z', sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1', plus:'M12 5v14M5 12h14', close:'m6 6 12 12M6 18 18 6', back:'m14 6-6 6 6 6' };
</script>
<template><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] ?? paths.folder"/></svg></template>
