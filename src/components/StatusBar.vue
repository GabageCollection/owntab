<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ count: number; folders: number; error: boolean; importing: boolean; syncing: boolean }>();
const label = computed(() => props.error ? '✕ 同步失败' : props.importing ? '⟳ 正在导入书签' : props.syncing ? '⟳ 同步中' : '✓ 已同步');
</script>
<template><footer class="statusbar" aria-live="polite"><span>{{ count }} 项<span v-if="folders"> · {{ folders }} 个文件夹</span></span><span :class="{danger:error,success:!error && !importing && !syncing}">{{ label }}</span></footer></template>
