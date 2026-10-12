<script setup lang="ts">
import { rootLabel, type Node } from '../lib/model';
defineProps<{ roots: Node[]; activeId?: string }>();
defineEmits<{ navigate: [id: string] }>();
</script>
<template><nav class="root-tabs" aria-label="书签根目录"><button v-for="root in roots" :key="root.id" class="button" :class="{active:activeId === root.id}" :aria-current="activeId === root.id ? 'page' : undefined" @click="$emit('navigate',root.id)">{{ rootLabel(root) }}</button></nav></template>
