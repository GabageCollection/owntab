<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string,string> = { folder:'M3 7V5a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z', settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z', moon:'M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z', sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1', plus:'M12 5v14M5 12h14', close:'m6 6 12 12M6 18 18 6', back:'m14 6-6 6 6 6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z m10 16-4.2-4.2',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01',
  pin: 'M12 17v5 M9 10.5V6a3 3 0 0 1 6 0v4.5l3 4H6l3-4Z',
  pinFilled: 'M12 17v5 M9 10.5V6a3 3 0 0 1 6 0v4.5l3 4H6l3-4Z',
  wrench: 'M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3L14.7 12 12 9.3l2.5-2.8Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9Z'
};
</script>
<template><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] ?? paths.folder"/></svg></template>
